# Coding Conventions

**Analysis Date:** 2026-10-30

This document describes the conventions actually in use in `after-effects-mcp`, so that new code matches what is already here. Two languages coexist and their rules are different: TypeScript in `src/index.ts` (Node 20 / ES2022 / ESM) and ExtendScript in `src/scripts/*.jsx` (ES3, no transpiler, executed by Adobe After Effects).

## Toolchain

| Concern | Actual state |
|---------|--------------|
| Language (server) | TypeScript 5.2.2, `strict: true` |
| Module system | ESM only (`"type": "module"` in `package.json`) |
| Build | `esbuild` bundle → `build/index.js`, then `copyfiles` mirrors `src/scripts/**/*` → `build/scripts/` |
| Language (AE side) | ExtendScript ES3 — no transpile step, no bundler |
| Lint / format | None configured |
| Tests | None configured (see `TESTING.md`) |

The build command is the only gate:

```json
"build": "esbuild src/index.ts --bundle --platform=node --format=esm --outfile=build/index.js --packages=external && copyfiles -u 1 \"src/scripts/**/*\" build"
```

Because `--packages=external` is used, runtime dependencies (`@modelcontextprotocol/sdk`, `zod`, `node-fetch`) are **not** bundled — they must be installed where `build/index.js` runs. `build/scripts/*.jsx` is copied verbatim, so any syntax error in a `.jsx` file reaches After Effects untouched; `esbuild` will never catch it.

## Naming Patterns

**Files:**
- TypeScript entry point is a single file: `src/index.ts`.
- ExtendScript files are `camelCase.jsx`, one script per file, name matching the function: `src/scripts/listCompositions.jsx` exports `listCompositions()`, `src/scripts/createComposition.jsx` exports `createComposition()`. Multi-word: `src/scripts/setLayerProperties.jsx`, `src/scripts/applyEffectTemplate.jsx`, `src/scripts/getLayerInfo.jsx`.
- The bridge panel is the one exception, with a kebab-case multi-word name: `src/scripts/mcp-bridge-auto.jsx`.
- Root tooling scripts are kebab-case: `install-bridge.js`.

**Functions:**
- TypeScript: `camelCase`, verb-first — `getAETempDir()`, `readResultsFromTempFile()`, `writeCommandFile()`, `clearResultsFile()`, `waitForBridgeResult()`, `main()`.
- ExtendScript: `camelCase`, verb-first — `listCompositions()`, `setCompositionProperties(args)`, `executeCommand(command, args)`, `checkForCommands()`, `updateCommandStatus(status)`, `logToPanel(message)`.

**Variables:**
- TypeScript module-level constants: `UPPER_SNAKE_CASE` — `SCRIPTS_DIR`, `TEMP_DIR`. The server instance is a plain `const server`.
- TypeScript locals: `camelCase` — `bridgeDir`, `commandFile`, `resultPath`, `lastSize`, `thirtySecondsAgo`.
- ExtendScript locals: `camelCase`, declared with `var` — `commandData`, `resultFile`, `argsFile`, `isChecking`, `checkInterval`.

**Types / schemas:**
- Zod schema objects that are reused across tools are `PascalCase` constants suffixed `Schema`: `LayerIdentifierSchema`, `KeyframeValueSchema`.
- One-off inline schemas are anonymous, written directly in the tool's second argument object.
- TypeScript helpers that are not exported carry no `export` keyword; there are no exported types in `src/index.ts`.

**MCP surface names — inconsistent, prefer kebab-case for new tools:**

| Style | Examples | Notes |
|-------|----------|-------|
| kebab-case (dominant) | `run-script`, `get-results`, `get-help`, `create-composition`, `apply-effect`, `apply-effect-template`, `run-bridge-test`, `test-animation` | Use this for new tools |
| camelCase (ExtendScript mirror) | `setLayerKeyframe`, `setLayerExpression` | Named to match the `switch` command in `mcp-bridge-auto.jsx` |
| prefixed snake-ish | `mcp_aftereffects_applyEffect`, `mcp_aftereffects_applyEffectTemplate`, `mcp_aftereffects_get_effects_help` | Legacy aliases for the effect tools |

**ExtendScript payload keys are camelCase and use 1-based indices:** `compIndex`, `layerIndex`, `propertyName`, `timeInSeconds`, `backgroundColor`, `changedProperties`.

## Code Style

**Indentation:** 2 spaces in `src/index.ts` and `install-bridge.js`; **4 spaces** in `src/scripts/*.jsx`.

**Quotes:** double quotes in TypeScript for imports and strings; ExtendScript is mixed, leaning double quotes for outer strings with single quotes inside (`'`). Match the file you are editing.

**Semicolons:** always, both languages.

**TypeScript specifics:**
- `strict` is on — no implicit `any`. Existing escape hatch is explicit: `Record<string, any>` in `writeCommandFile(command: string, args: Record<string, any> = {})`.
- Explicit return types on helpers: `function getAETempDir(): string`, `function readResultsFromTempFile(): string`, `function writeCommandFile(...): void`, `async function waitForBridgeResult(...): Promise<string>`.
- `import * as fs from "fs"` / `import * as os from "os"` / `import * as path from "path"` namespace style, not named imports.
- ESM `__dirname` shim at `src/index.ts:17-18`:
```ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

**ExtendScript specifics (hard constraints, ES3):**
- `var` only. No `let`, no `const`.
- No arrow functions, no template literals, no destructuring, no `Array.prototype.includes`, no `Object.assign`.
- String concatenation with `+`; JSON output through `JSON.stringify(value, null, 2)`.
- File I/O uses the ExtendScript `File` object with explicit `open()` / `read()` / `write()` / `close()`.
- `parseInt(args.x) || <default>` / `parseFloat(args.y) || <default>` is the established defaulting idiom, e.g. in `src/scripts/createComposition.jsx`:
```js
var width = parseInt(args.width) || 1920;
```

## Import Organization

**Order in `src/index.ts:1-8`** — third-party packages, then Node builtins, then local:
1. `@modelcontextprotocol/sdk/server/mcp.js`
2. `@modelcontextprotocol/sdk/server/stdio.js`
3. `child_process`, `fs`, `os`, `path`
4. `zod`
5. `url`

**Path aliases:** none. Relative paths only, and there is only one TS file.

Note: `import { execSync } from "child_process";` at `src/index.ts:3` is unused — leftover from the removed headless-CLI path. Do not add new unused imports; do not remove it as a drive-by change either, since it is unrelated to any current task.

## Tool Registration Pattern

Every MCP tool is a top-level `server.tool(name, description, zodShape, handler)` call in `src/index.ts`. There are 13 tools, 1 resource, and 3 prompts. The shape to copy:

```ts
server.tool(
  "run-script",
  "Run a read-only script in After Effects",
  {
    script: z.string().describe("Name of the predefined script to run"),
    parameters: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the script")
  },
  async ({ script, parameters = {} }) => {
```

Rules observed throughout:
- The name is the first argument, the human-readable description the second, a **plain object of zod schemas** the third. Do not wrap the schema in `z.object(...)`.
- Every field gets `.describe(...)`. This is universal — `create-composition`, `setLayerKeyframe`, `apply-effect`, `test-animation` all do it. Descriptions state units and indexing, e.g. `"1-based index of the target composition in the project panel."`.
- Optional values use `.optional()` and get their default in the handler's destructuring: `async ({ script, parameters = {} }) =>`. Do not use `.default()` in the schema.
- Numeric bounds are expressed in zod, not in the handler: `z.number().int().positive()`, `z.number().int().min(0).max(255)`.
- Closed sets use `z.enum([...])` — the effect template list in `apply-effect-template` and `mcp_aftereffects_applyEffectTemplate`.
- Shared identifier schemas are defined once and spread:
```ts
const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};
```
then `{ ...LayerIdentifierSchema, propertyName: z.string()... }`.
- Tools that take no input register an empty object literal as the third argument: `server.tool("get-results", "...", {}, async () => {`.

A tool's name must also be dispatchable. `run-script` gates the script name against the `allowedScripts` array in `src/index.ts:176-196` (20 entries), and that name must additionally exist as a `case` in `executeCommand`'s `switch` inside `src/scripts/mcp-bridge-auto.jsx`. **Adding a script requires editing both places**; miss the `switch` and the bridge returns `{ error: "Unknown command: <name>" }`.

## Error Handling

**Two layers, two different contracts.**

**TypeScript layer — never throw out of a handler. Return `isError: true`:**

```ts
if (!allowedScripts.includes(script)) {
  return {
    content: [
      {
        type: "text",
        text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${allowedScripts.join(", ")}`
      }
    ],
    isError: true
  };
}
```

and inside the `catch`:

```ts
} catch (error) {
  return {
    content: [
      {
        type: "text",
        text: `Error queuing command: ${String(error)}`
      }
    ],
    isError: true
  };
}
```

Conventions: the message text starts with `Error ...`; the error is interpolated with `${String(error)}`; the shape is always `{ content: [{ type: "text", text }], isError: true }`. Non-error successes omit `isError` entirely rather than setting `false`.

The bridge helpers (`writeCommandFile`, `clearResultsFile`, `readResultsFromTempFile`) are the exception: they catch, `console.error` the failure, and return a readable string — they never propagate. `readResultsFromTempFile` signals absence in-band:

```ts
return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
```

and staleness as a warning object with an `originalContent` field rather than an error.

Polling helpers swallow expected parse races with **commented** empty catches — this is deliberate, not sloppiness:

```ts
} catch {
  // not JSON yet; continue polling
}
```
```ts
} catch {
  // transient read error; continue polling
}
```

Timeouts surface as data, not exceptions:

```ts
return JSON.stringify({ error: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}.` });
```

**ExtendScript layer — return a JSON envelope, do not rethrow:**

```js
try {
  // ... work ...
  return JSON.stringify({ status: "success", message: "Composition created successfully", composition: { /* ... */ } }, null, 2);
} catch (error) {
  return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
}
```

The envelope keys are fixed: `status` (`"success"` | `"error"`), `message` (human sentence, or `error.toString()`), plus payload fields at the top level. Validation failures are raised as `throw new Error(...)` **inside** the `try` so the `catch` converts them into the envelope, e.g. from `src/scripts/applyEffect.jsx`:

```js
if (!effectName && !effectMatchName && !presetPath) {
  throw new Error("You must specify either effectName, effectMatchName, or presetPath");
}
```

and from `src/scripts/setLayerProperties.jsx`:

```js
throw new Error("No composition found with name '" + compName + "' and no active composition");
```

Message wording is prescriptive English, quoted identifiers in single quotes, includes the offending value.

**Bridge-level catch** in `src/scripts/mcp-bridge-auto.jsx` writes the richer envelope so the fault is locatable — `{ status: "error", command, message, line, fileName }` — and then calls `updateCommandStatus("error")`.

## Response Shapes

Three request/response shapes exist. Pick based on whether the MCP call can wait for After Effects.

**1. Queued acknowledgement** (fire-and-forget; the client must poll `get-results`):

```ts
return {
  content: [
    {
      type: "text",
      text: `Command to run "${script}" has been queued.\n` +
            `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
            `Use the "get-results" tool after a few seconds to check for results.`
    }
  ]
};
```

**2. Direct passthrough** (returns the bridge's JSON string verbatim — same `readResultsFromTempFile()` / `waitForBridgeResult()` output, unparsed, no re-wrapping):

```ts
const result = readResultsFromTempFile();
return { content: [{ type: "text", text: result }] };
```

The effect tools use this after a fixed drain (`await new Promise(resolve => setTimeout(resolve, 1000))`) following `writeCommandFile`.

**3. Resource contents** — `server.resource("compositions", "aftereffects://compositions", ...)` returns MCP resource shape rather than tool content:

```ts
return {
  contents: [{ uri: uri.href, mimeType: "application/json", text: result }]
};
```

**Bridge result envelope** — whatever a `.jsx` returns is post-processed before being written to `ae_mcp_result.json`:

```js
resultObj._responseTimestamp = new Date().toISOString();
resultObj._commandExecuted = command;
```

So every consumed result carries `_commandExecuted` and `_responseTimestamp`. `waitForBridgeResult(expectedCommand, ...)` matches on `_commandExecuted` to reject a stale file, and `readResultsFromTempFile` uses file mtime for the 30-second staleness warning. **Any new result-shaping code must preserve these two fields.**

## Logging

**Framework:** `console.error` only, in TypeScript. This is mandatory, not preference — stdout carries the JSON-RPC stream for `StdioServerTransport`, so a single `console.log` corrupts the protocol. Startup and fatal paths also use `console.error`:

```ts
async function main() {
  console.error("After Effects MCP Server starting...");
```

Diagnostics are placed on the bridge file I/O path so a stalled bridge is diagnosable from the MCP host log: `Checking for results at: ...`, `Result file exists, last modified: ...`, `Result file content length: ... bytes`, `Command "<name>" written to ...`, `Results file cleared at ...`. Follow that pattern — log the absolute path and the observed state.

**ExtendScript logging** goes to the panel, not a console: `logToPanel(message)` prepends `timestamp + ": " + message + "\n"` to the read-only multiline `logText`, so newest entries are on top. File-write failures are logged explicitly (checking `open("w")` / `write()` / `close()` return values) instead of being assumed to succeed.

## Comments

**When to comment:**
- File header: two lines at the top of each standalone script — filename, then purpose:
```js
// listCompositions.jsx
// Lists all compositions in the current project
```
- Section banners above registration blocks in `src/index.ts`: `// Add a tool for running read-only scripts`, `// Add a tool to get the results from the last script execution`, `// Add prompts for common After Effects tasks`, `// Add a resource to expose project compositions`, `// Helper function to write command to file`, `// Helper function to clear the results file to avoid stale cache`.
- Explaining a non-obvious decision inline: `// Ensure the directory exists`, `// Clear any stale result data`, `// Use ~/Documents/ae-mcp-bridge for reliable cross-process access`, `// pending, running, completed, error` next to the status field.
- Recording removals: `// Headless CLI execution has been removed. All interactions are routed through the Bridge panel.`
- Empty catches always carry a reason (`// Handle parsing error`, `// not JSON yet; continue polling`, `// Skip properties that don't exist or can't be accessed`).

**JSDoc/TSDoc:** none. Do not introduce a JSDoc block on one function in a 963-line file — it will read as inconsistent. Descriptive names plus the section banner carry the intent.

## Function Design

**Size:** no enforced limit; the codebase is tolerant of long handlers. `src/index.ts` is 963 lines with 13 tools inline, and `src/scripts/mcp-bridge-auto.jsx` is 1662 lines with a single `executeCommand` switch covering 19 commands plus an `#include`-less inlined copy of every standalone script.

**Parameters:** object-in / string-out at the ExtendScript boundary (`function setLayerProperties(args)`), positional at the TypeScript boundary when the tool schema is spread from a shared object. Handler arguments are destructured at the call site: `async ({ compIndex, layerIndex, propertyName }) => {`.

**Return values:** strings everywhere on the outside. ExtendScript always returns `JSON.stringify(..., null, 2)`. TypeScript helpers return `string`; MCP handlers return the protocol envelope object.

**Guard style:** validate then act; fail with a specific message. Bounds checks precede use in `src/scripts/setLayerProperties.jsx` (`"Layer index out of bounds: " + layerIndex`). Lookups fall back to the active item before giving up — `app.project.activeItem` when a name lookup misses — and only then throw.

**Accumulate changes and report them.** Mutating scripts build a list and return it, so the caller can verify what actually changed:
```js
var changedProperties = [];
// ...
changedProperties.push("position");
```

## Module Design

**Exports:** `src/index.ts` exports nothing; it is an executable entry point that ends in `main().catch(...)` with `process.exit(1)`. The `.jsx` files export nothing either — the function name is the contract, resolved by the `switch` in `src/scripts/mcp-bridge-auto.jsx`.

**Barrel files:** none.

**Single-file by design:** all server logic lives in `src/index.ts`. There is no `src/lib/`, no `src/tools/`, no `src/utils/`. Adding a second TS module means changing the architectural shape and should be a deliberate decision, not a convenience.

**Duplication that must be respected:** `src/scripts/mcp-bridge-auto.jsx` contains an inlined copy of the standalone scripts (`createComposition`, `createTextLayer`, `createShapeLayer`, `createSolidLayer`, `setLayerProperties`, and the rest) because After Effects cannot `#include` them reliably from a ScriptUI panel — the original `#include` block is still visible, commented out, near the top of the file. **A change to a standalone script must be mirrored into `mcp-bridge-auto.jsx`**, or the two implementations will diverge silently while only the panel version is ever exercised.

---

*Convention analysis: 2026-10-30*
