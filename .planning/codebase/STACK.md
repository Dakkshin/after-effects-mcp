# Technology Stack

**Analysis Date:** 2026-10-30

## Languages

**Primary:**
- TypeScript 5.2.2 — MCP server implementation, single file `src/index.ts` (~965 lines). Compiled with `target: ES2022`, `module: Node16`, `strict: true`.
- ExtendScript (Adobe ES3-dialect JavaScript, `.jsx`) — Adobe After Effects host-side code, `src/scripts/*.jsx`. The live bridge panel is `src/scripts/mcp-bridge-auto.jsx` (~1790 lines); the other 9 `.jsx` files are standalone reference/legacy copies of the same functions.
- Node ESM JavaScript (`.js`, `"type": "module"`) — installer script `install-bridge.js` (148 lines).

**Secondary:**
- JSON — MCP config `.mcp.json`, package manifests, and the runtime IPC payloads (`ae_command.json` / `ae_mcp_result.json`).

## Runtime

**Environment:**
- Node.js. `README.md` claims `node >=14`; `package.json` declares **no** `engines` field, so the floor is unenforced. `package.json` sets `"type": "module"`, every `.ts`/`.js` file uses ESM (import/export), and `src/index.ts` uses top-level `await` (line 956), which requires Node 14.8+.
- Adobe After Effects 2022 or later (`README.md` Prerequisites). The bridge panel additionally branches on AE >= 25.0 (AE 2025) at `src/scripts/mcp-bridge-auto.jsx:1285-1286`, because dockable ScriptUI panels are unsupported there.

**Package Manager:**
- npm. `package-lock.json` present, `lockfileVersion: 3`, `hasInstallScript: true`.
- `npm install` triggers `postinstall` → `npm run build` (`package.json`), so a build is always produced on install.
- Current checkout state: `node_modules/` absent, `build/` absent (neither is committed; both are gitignored).

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` ^1.28.0 — MCP server runtime. `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js` (`src/index.ts:1-2`).
- `zod` ^3.22.2 — tool input schemas; every `server.tool(...)` in `src/index.ts` declares its parameters as Zod shapes.

**Testing:**
- Not detected. No test runner, no test files, no `test` script in `package.json`. The only in-repo self-check is the MCP tool `test-animation`/`run-bridge-test`, which generate an `.jsx` probe script for manual execution inside After Effects (`src/index.ts:525`, `src/index.ts:913`; host implementation `src/scripts/mcp-bridge-auto.jsx:1207`).

**Build/Dev:**
- `esbuild` ^0.27.4 — the actual bundler. `npm run build` runs `esbuild src/index.ts --bundle --platform=node --format=esm --outfile=build/index.js --packages=external` then `copyfiles -u 1 "src/scripts/**/*" build`.
- `copyfiles` ^2.4.1 — copies `src/scripts/*.jsx` into `build/scripts/` (this is what `install-bridge.js` ships to After Effects).
- `typescript` ^5.2.2 — present as a devDependency and configured by `tsconfig.json`, but **not** invoked by any npm script; it is available for type-checking only. README notes esbuild replaced `tsc` because `tsc` ran out of memory.

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` ^1.28.0 — protocol framing, `server.tool` / `server.resource` / `server.prompt` registration, stdio transport (`src/index.ts:1-2`, `src/index.ts:955-956`).
- `zod` ^3.22.2 — request validation at the MCP boundary (`src/index.ts:7`, and the schema constants `LayerIdentifierSchema` / `KeyframeValueSchema` near `src/index.ts:435`).

**Infrastructure (declared but unused):**
- `node-fetch` ^3.3.2 — declared in `package.json` dependencies; no import or usage anywhere in `src/`.
- `execSync` imported from `child_process` at `src/index.ts:3` is dead: the comment at `src/index.ts:36` states "Headless CLI execution has been removed. All interactions are routed through the Bridge panel."

**Node built-ins used:**
- `fs`, `path`, `os`, `url` (`fileURLToPath` for `__dirname`), `child_process` (`install-bridge.js` only, for `sudo`/PowerShell elevation).

## Configuration

**Environment:**
- No `.env` file, no dotenv loader, no environment-keyed config. `.gitignore` lists `.env*` but nothing reads them.
- The only environment reads are `process.env.TEMP || process.env.TMP || os.tmpdir()` when generating the manual test script (`src/index.ts:537`).
- Runtime paths are computed, not configured: `SCRIPTS_DIR` and `TEMP_DIR` from `__dirname` (`src/index.ts:21-22`); the IPC directory is hardcoded to `os.homedir()/Documents/ae-mcp-bridge` (`src/index.ts:26-35`).

**Build:**
- `package.json` scripts: `build`, `start` (`node build/index.js`), `install-bridge` (`node install-bridge.js`), `postinstall`.
- `tsconfig.json`: `rootDir: ./src`, `outDir: ./build`, `include: ["src/**/*"]`, `exclude: ["node_modules"]` — but `outDir` is not used by the esbuild pipeline.
- `.npmignore` excludes `src/`, `tsconfig.json`, `.git/`, `.github/`, `manual_animation_test.jsx`, logs, and `temp/`, leaving `build/` and `install-bridge.js` as the published surface.
- `.mcp.json` registers `AfterEffectsMCP` with `command: "node"` and `args: ["C:\\Users\\Daniel\\Downloads\\after-effects-mcp\\build\\index.js"]` — an absolute path from another machine; it must be rewritten per installation.

## Platform Requirements

**Development:**
- Node.js + npm.
- Adobe After Effects 2022+ installed locally for any execution path.
- On Windows, `npm run install-bridge` writes into `C:\Program Files\Adobe\...`, so it needs administrator rights (it shells out to `Start-Process PowerShell -Verb RunAs`, `install-bridge.js:96-102`).
- In After Effects: Edit/After Effects > Preferences > Scripting & Expressions > "Allow Scripts to Write Files and Access Network" must be enabled (`install-bridge.js:109-113`).

**Production:**
- Not a hosted service. Distribution is a Node process launched by an MCP client over stdio, plus a ScriptUI panel installed into the local After Effects `ScriptUI Panels` folder:
  - Windows: `<AE>/Support Files/Scripts/ScriptUI Panels/mcp-bridge-auto.jsx`
  - macOS: `<AE>/Scripts/ScriptUI Panels/mcp-bridge-auto.jsx`
  (`install-bridge.js:69-72`; AE roots probed for 2021–2026 at `install-bridge.js:22-40`)

---

*Stack analysis: 2026-10-30*
