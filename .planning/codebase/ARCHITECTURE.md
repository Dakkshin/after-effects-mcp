# Architecture

**Analysis Date:** 2026-10-30

## Pattern Overview

**Overall:** Two-process, file-mediated command queue (asynchronous file drop-box). A single-file MCP stdio server writes JSON commands to a shared folder; an After Effects ScriptUI panel polls that folder, dispatches the command to an ExtendScript function, and writes a JSON result back to the same folder.

**Key Characteristics:**
- No network socket, no IPC, no RPC between Node and After Effects. The only channel is two JSON files on disk: `ae_command.json` and `ae_mcp_result.json`.
- Both sides are decoupled in time: the MCP server never blocks on a live AE connection; it records intent, and AE picks it up on its own timer.
- Every AE operation is a pure `function(args) -> JSON string` in ExtendScript. There are no classes, no event bus, no plugin SDK.
- Command names are the protocol contract. They are strings that must match in three places: the MCP tool's `writeCommandFile("<name>", ...)` call, the `allowedScripts` whitelist, and the `switch` in the bridge.
- AE 2025+ drops dockable ScriptUI panels, so the bridge is always a floating `Window("palette")`.

## Layers

**1. MCP Transport & Tool Surface:**
- Purpose: Speak the Model Context Protocol over stdio; expose tools, prompts, and resources; validate arguments with Zod.
- Location: `src/index.ts`
- Contains: `McpServer` construction, `StdioServerTransport` connect, `server.tool(...)`, `server.prompt(...)`, `server.resource(...)`, Zod schemas (`LayerIdentifierSchema`, `KeyframeValueSchema`), the `allowedScripts` whitelist.
- Depends on: `@modelcontextprotocol/sdk`, `zod`, Node `fs`, `os`, `path`.
- Used by: MCP clients (Claude Code, Cursor, Copilot) configured via `.mcp.json`.

**2. Bridge File Protocol (the seam):**
- Purpose: Define the on-disk contract between the two processes.
- Location: `src/index.ts` (`getAETempDir`, `writeCommandFile`, `readResultsFromTempFile`, `clearResultsFile`, `waitForBridgeResult`) and `src/scripts/mcp-bridge-auto.jsx` (`getCommandFilePath`, `getResultFilePath`, `updateCommandStatus`, `checkForCommands`).
- Contains: the shared directory `~/Documents/ae-mcp-bridge` (created on demand by both sides), the command record shape, the result record shape, and the status state machine.
- Depends on: Node `fs` / ExtendScript `File`.
- Used by: layers 1 and 3.

**3. Bridge Dispatcher & ScriptUI Panel:**
- Purpose: Poll for pending commands, dispatch by name, write results, show a log.
- Location: `src/scripts/mcp-bridge-auto.jsx`
- Contains: `Window("palette", "MCP Bridge Auto")` UI (`statusText`, `logText`, `autoRunCheckbox`, `checkButton`), the `2000 ms` `app.scheduleTask("checkForCommands()", checkInterval, true)` timer, `executeCommand(command, args)` switch at `src/scripts/mcp-bridge-auto.jsx:1498`, `updateCommandStatus`, `logToPanel`.
- Depends on: layer 4 (the operation functions) and the After Effects scripting DOM (`app`, `CompItem`, `Folder`, `File`).
- Used by: layer 2.

**4. ExtendScript Operation Functions:**
- Purpose: Actually manipulate the AE project — one function per command.
- Location: `src/scripts/mcp-bridge-auto.jsx` (embedded copies, lines 16-1232): `createComposition`, `createTextLayer`, `createShapeLayer`, `createCamera`, `duplicateLayer`, `deleteLayer`, `setLayerMask`, `createSolidLayer`, `setLayerProperties`, `batchSetLayerProperties`, `setLayerKeyframe`, `setLayerExpression`, `applyEffect`, `applyEffectSettings`, `applyEffectTemplate`, `bridgeTestEffects`, `setCompositionProperties`, `getProjectInfo`, `listCompositions`, `getLayerInfo`.
- Contains: all AE DOM access, all `try/catch`, all `JSON.stringify(..., null, 2)` return values.
- Depends on: Adobe ExtendScript engine + AE scripting API (`app.project`, `CompItem`, `Property`, `MaskPropertyGroup`).
- Used by: layer 3.

**Legacy / not in the live path:**
- `src/scripts/createComposition.jsx`, `createTextLayer.jsx`, `createShapeLayer.jsx`, `createSolidLayer.jsx`, `setLayerProperties.jsx`, `applyEffect.jsx`, `applyEffectTemplate.jsx`, `getProjectInfo.jsx`, `getLayerInfo.jsx`, `listCompositions.jsx` are standalone scripts that read `../temp/args.json` and are executed manually (File > Scripts). Nothing in `src/index.ts` invokes them. Their bodies are duplicated inside `mcp-bridge-auto.jsx`.

## Data Flow

**MCP tool call -> bridge -> ExtendScript -> AE (write path):**

1. MCP client calls a server tool, e.g. `create-composition` or `run-script`. Zod validates the arguments in `src/index.ts`.
2. `run-script` checks the name against `allowedScripts` (`src/index.ts:173`, gate at `:196`); a miss returns `{ isError: true }` text listing valid names.
3. The tool calls `clearResultsFile()` then `writeCommandFile(command, args)`, which writes `~/Documents/ae-mcp-bridge/ae_command.json`:
   ```json
   { "command": "createComposition", "args": {...}, "timestamp": "<ISO>", "status": "pending" }
   ```
4. The MCP tool returns immediately with prose telling the caller to poll `get-results`. The server does not wait.
5. AE's `checkForCommands()` fires every 2000 ms, reads the file, and if `status === "pending"` flips it to `"running"` and calls `executeCommand`.
6. `executeCommand` matches the name in its `switch`, calls the ExtendScript function, and takes its JSON string return value.
7. The bridge stamps `_responseTimestamp` and `_commandExecuted: <command>` onto the parsed result, writes `~/Documents/ae-mcp-bridge/ae_mcp_result.json` as UTF-8, and sets command status to `"completed"` (or `"error"` in the catch branch, which writes `{ status: "error", command, message, line, fileName }`).

**Result read path:**

1. Client calls `get-results` -> `readResultsFromTempFile()` (`src/index.ts:39`) reads `ae_mcp_result.json`.
2. If mtime is older than 30 seconds the server returns a `{ warning: "Result file appears to be stale...", originalContent }` envelope instead of the raw result.
3. If the file is missing it returns `{ error: "No results file found..." }`. Note: `clearResultsFile()` normally writes a `{ status: "waiting" }` placeholder, so "missing" is the exceptional case.

**Blocking resource read path (`aftereffects://compositions`):**

1. MCP client reads the resource.
2. Handler calls `clearResultsFile()`, `writeCommandFile("listCompositions", {})`, then `await waitForBridgeResult("listCompositions", 6000, 250)` (`src/index.ts:78`).
3. `waitForBridgeResult` polls every 250 ms for up to 6 s, accepting a result only when the content length changes and `parsed._commandExecuted === expectedCommand`. On timeout it returns `{ error: "Timed out waiting for bridge result..." }`.

**Direct-return tool path (`mcp_aftereffects_applyEffect`, `mcp_aftereffects_applyEffectTemplate`):**

1. Tool writes the command, sleeps a fixed `1000 ms`, then calls `readResultsFromTempFile()` and returns whatever is on disk. This is time-based rather than correlation-based, so it can return the previous command's result.

**Side-effect tool path (`test-animation`):**

1. Tool generates a one-off `.jsx` file in `os.tmpdir()` containing hard-coded comp/layer indices, writes it with `fs.writeFileSync`, and returns instructions for the user to run it manually via File > Scripts. It bypasses both the command file and the bridge.

**State Management:**
- No in-memory state in `src/index.ts`; the module-level constants are only `server`, `SCRIPTS_DIR`, `TEMP_DIR`.
- All cross-process state lives in the two JSON files. Command `status` is the only state machine: `pending -> running -> completed | error`.
- AE-side state is the live AE project itself; nothing is cached between commands.

## Key Abstractions

**`writeCommandFile(command, args)`:**
- Purpose: The single producer entry point on the MCP side.
- Location: `src/index.ts:108`
- Pattern: Fire-and-forget write of a status-stamped record. All 12 write tools funnel through it, which is why the command name string is the real API.

**`executeCommand(command, args)`:**
- Purpose: The single consumer entry point on the AE side.
- Location: `src/scripts/mcp-bridge-auto.jsx:1498`
- Pattern: A `switch` over command name mapping to a function call. `setLayerKeyframe` and `setLayerExpression` take positional args (`args.compIndex, args.layerIndex, ...`); every other command takes the whole `args` object.

**`allowedScripts` whitelist:**
- Purpose: Prevent arbitrary script execution from the MCP client.
- Location: `src/index.ts:173` (`run-script` tool only; the tool itself is registered at `src/index.ts:164`)
- Pattern: Array `.includes()` gate. Note the named tools (`create-composition`, `apply-effect`, `setLayerKeyframe`, ...) do **not** re-check it; they are implicitly allow-listed by existing as separate tools.

**`LayerIdentifierSchema`:**
- Purpose: Shared Zod shape `{ compIndex, layerIndex }` reused across the layer tools.
- Location: `src/index.ts:437`
- Pattern: Object spread (`...LayerIdentifierSchema`) into each tool's `inputSchema` (spread at `src/index.ts:451` and `:489`).

**`getAETempDir()`:**
- Purpose: Resolve and create the one shared bridge folder.
- Location: `src/index.ts:26`
- Pattern: `os.homedir()/Documents/ae-mcp-bridge` with `mkdirSync({ recursive: true })`. Must match `Folder.myDocuments + "/ae-mcp-bridge"` in `src/scripts/mcp-bridge-auto.jsx:1321` and `:1331` exactly.

## Entry Points

**MCP server process:**
- Location: `src/index.ts:950` (`main()`), started by the `main().catch(...)` at `src/index.ts:960`; invoked by `node build/index.js`
- Triggers: An MCP client spawning the process per `.mcp.json` (`command: "node"`, `args: ["<path>/build/index.js"]`)
- Responsibilities: Register all tools/prompts/resources, connect `StdioServerTransport`, log to stderr only (stdout is the protocol channel).

**After Effects bridge panel:**
- Location: `src/scripts/mcp-bridge-auto.jsx` (panel construction at `:1289`, checker start at `:1768`)
- Triggers: User opens `Window > mcp-bridge-auto.jsx` after `npm run install-bridge` copies it to the ScriptUI Panels folder
- Responsibilities: Build the palette, start the 2 s `scheduleTask` poller, execute pending commands, log every step to `logText`.

**Installer:**
- Location: `install-bridge.js`
- Triggers: `npm run install-bridge` (and `postinstall`)
- Responsibilities: Probe `C:\Program Files\Adobe\Adobe After Effects 20xx` / `/Applications/Adobe After Effects 20xx` (2021-2026), copy `build/scripts/mcp-bridge-auto.jsx` into `.../Support Files/Scripts/ScriptUI Panels/` (Windows) or `.../Scripts/ScriptUI Panels/` (macOS), re-invoking via `Start-Process -Verb RunAs` on Windows or `sudo cp` on macOS when the plain copy fails.

## Error Handling

**Strategy:** Catch-and-return-JSON on the AE side; catch-and-return-`isError`-text on the MCP side. Nothing throws across the process boundary, and nothing is logged to stdout.

**Patterns:**
- Every ExtendScript operation wraps its body in `try/catch` and returns `JSON.stringify({ status: "error", message: error.toString() }, null, 2)`. A command therefore "succeeds" at the transport level even when the AE operation failed; the caller must inspect `status`.
- `executeCommand`'s outer `catch` (`src/scripts/mcp-bridge-auto.jsx:1651`) writes `{ status, command, message, line, fileName }` to the result file and sets command status to `"error"`.
- File-write failures are logged to the panel but do not abort the command (`logToPanel("ERROR: Failed to write to result file...")`).
- Every MCP tool wraps its body in `try/catch` and returns `{ content: [{ type: "text", text: "Error ... : " + String(error) }], isError: true }`.
- `main().catch(...)` logs and `process.exit(1)` — the only hard failure path.
- Diagnostics go to `console.error` (stderr): `"Checking for results at: ..."`, `"Result file content length: N bytes"`, stale-file warnings.
- Timeout is expressed as a returned value, not an exception: `waitForBridgeResult` returns `{ error: "Timed out waiting for bridge result for command '...'" }`.

## Cross-Cutting Concerns

**Logging:** MCP side — `console.error` with path/length/staleness detail. AE side — `logToPanel(message)` prepending `HH:MM:SS:` lines into `logText`, so the newest entry is at the top. There is no log file; the panel is the only AE-side trace.

**Validation:** Zod schemas in `src/index.ts` per tool (positive ints for `compIndex`/`layerIndex`, enums for `templateName` and `operation`, `z.record(z.string(), z.unknown())` for free-form `parameters`/`effectSettings`). The `run-script` tool additionally validates `script` against `allowedScripts`. AE side validates nothing — it trusts the command name and args, defaulting missing values (`args.width || 1920`, `args.text || "Text Layer"`).

**Authentication:** None. Security boundary is the shared home directory. Anyone who can write `~/Documents/ae-mcp-bridge/ae_command.json` can drive After Effects, subject to the Scripts preference "Allow Scripts to Write Files and Access Network" being enabled.

**Environment assumptions:** AE 2022+ scripting DOM, Node 14+ (README), `type: "module"` ESM everywhere (`__dirname` rebuilt from `import.meta.url` in both `src/index.ts:13-16` and `install-bridge.js:9-11`). ExtendScript is ES3, so the bridge carries its own JSON fallback (`if (!JSON) { ... toJSON ... }`) and uses `var`, not `let`/`const`.

---

*Architecture analysis: 2026-10-30*
