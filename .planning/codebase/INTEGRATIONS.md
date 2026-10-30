# External Integrations

**Analysis Date:** 2026-10-30

## APIs & External Services

**None.** This server makes no outbound HTTP, WebSocket, or socket calls. There is no cloud service, no Adobe API, no SDK client, and no auth provider. The only external system it talks to is the Adobe After Effects desktop application running on the same machine.

**MCP protocol surface (inbound):**
- Transport: **stdio** — `new StdioServerTransport()` then `await server.connect(transport)` (`src/index.ts:955-956`). The client spawns `node build/index.js` and speaks JSON-RPC over stdin/stdout. All diagnostics go to stderr via `console.error` (`src/index.ts:951-958`), keeping stdout clean for protocol frames.
- Server identity: `{ name: "AfterEffectsServer", version: "1.0.0" }` (`src/index.ts:11-14`).
- SDK: `@modelcontextprotocol/sdk` ^1.28.0 (`src/index.ts:1-2`).

**Resources:**
- `aftereffects://compositions` — `server.resource(...)` at `src/index.ts:144-162`. Clears the result file, queues `listCompositions`, then blocks up to 6000 ms (250 ms polling) via `waitForBridgeResult` before returning the JSON text.

**Tools registered:**
| Tool | Location | Host command queued |
|------|----------|---------------------|
| `run-script` | `src/index.ts:164` | arbitrary entry from `allowedScripts` allowlist (`src/index.ts:168-191`) |
| `get-results` | `src/index.ts:240` | none — reads `ae_mcp_result.json` |
| `get-help` | `src/index.ts:322` | none — static text |
| `create-composition` | `src/index.ts:389` | `createComposition` |
| `setLayerKeyframe` | `src/index.ts:447` | `setLayerKeyframe` |
| `setLayerExpression` | `src/index.ts:485` | `setLayerExpression` |
| `test-animation` | `src/index.ts:525` | none — writes a standalone `.jsx` to `%TEMP%` for manual run |
| `apply-effect` | `src/index.ts:640` | `applyEffect` (fire-and-forget) |
| `apply-effect-template` | `src/index.ts:681` | `applyEffectTemplate` (fire-and-forget) |
| `mcp_aftereffects_applyEffect` | `src/index.ts:731` | `applyEffect`, then fixed 1000 ms sleep + read result |
| `mcp_aftereffects_applyEffectTemplate` | `src/index.ts:775` | `applyEffectTemplate`, then fixed 1000 ms sleep + read result |
| `mcp_aftereffects_get_effects_help` | `src/index.ts:828` | none — static effect match-name reference |
| `run-bridge-test` | `src/index.ts:913` | `bridgeTestEffects` |

**Prompts registered:**
- `list-compositions` (`src/index.ts:270`), `analyze-composition` (`src/index.ts:286`), `create-composition` (`src/index.ts:305`). Prompt-only text; no side effects.

## Data Storage

**Databases:**
- None.

**File Storage (the actual integration contract):**
A filesystem mailbox in the user's Documents folder, shared by the Node process and the After Effects panel:
- Directory: `os.homedir()/Documents/ae-mcp-bridge`, created on demand (`src/index.ts:26-35`; host side `src/scripts/mcp-bridge-auto.jsx:1321-1339`).
- Command queue: `ae_command.json` — written by `writeCommandFile` (`src/index.ts:108-123`) as `{ command, args, timestamp, status: "pending" }`; the panel flips `status` to `running` → `completed`/`error` via `updateCommandStatus` (`src/scripts/mcp-bridge-auto.jsx:1687`).
- Result mailbox: `ae_mcp_result.json` — written by the panel's `executeCommand` (`src/scripts/mcp-bridge-auto.jsx:1498`, write block near line 1621) with UTF-8 encoding and injected `_responseTimestamp` + `_commandExecuted` fields; read by `readResultsFromTempFile` (`src/index.ts:39-76`) and polled by `waitForBridgeResult` (`src/index.ts:78-106`, defaults 5000 ms / 250 ms).
- Reset marker: `clearResultsFile` overwrites the result file with `{ status: "waiting", ... }` before each queued command (`src/index.ts:125-140`).
- Staleness guard: results with an mtime older than 30 seconds are returned wrapped in a warning object instead of raw content (`src/index.ts:51-64`).
- Manual test artifacts: `%TEMP%/ae_test_<timestamp>.jsx`, `ae_test_result.txt`, `ae_test_error.txt` (`src/index.ts:537`, `555`, `563`, `584`, `592`).

**Caching:**
- None.

## Adobe Host App Bridge (ExtendScript / ScriptUI)

**Panel:**
- `src/scripts/mcp-bridge-auto.jsx` builds a ScriptUI palette `new Window("palette", "MCP Bridge Auto", undefined)` (`:1289`), with a status line (`:1296`), a read-only command log (`:1303`), an "Auto-run commands" checkbox (`:1313`, default `true`), and a "Check for Commands Now" button (`:1756`).
- Polling: `app.scheduleTask("checkForCommands()", checkInterval, true)` with `checkInterval = 2000` ms (`:1317`, `:1751-1752`). `checkForCommands` (`:1716`) only acts when `commandData.status === "pending"`.
- Host-version branch: `isAE2025OrLater = parseFloat(app.version) >= 25.0` (`:1285-1286`); on AE 2025+ a warning is shown because dockable panels are unsupported (`:1307-1310`).

**Command dispatch table** — `executeCommand(command, args)` (`src/scripts/mcp-bridge-auto.jsx:1498`) switches over 17 commands (`:1509-1596`):

| Command | Host implementation |
|---------|---------------------|
| `getProjectInfo` | `:1370` |
| `listCompositions` | `:1436` |
| `getLayerInfo` | `:1463` |
| `createComposition` | `:16` |
| `createTextLayer` | `:39` |
| `createShapeLayer` | `:82` |
| `createSolidLayer` | `:414` |
| `setLayerProperties` | `:454` |
| `setLayerKeyframe` | `:753` |
| `setLayerExpression` | `:813` |
| `applyEffect` | `:871` (settings helper `applyEffectSettings` `:965`) |
| `applyEffectTemplate` | `:1006` (9 templates: `gaussian-blur`, `directional-blur`, `color-balance`, `brightness-contrast`, `curves`, `glow`, `drop-shadow`, `cinematic-look`, `text-pop`) |
| `bridgeTestEffects` | `:1207` |
| `createCamera` | `:145` |
| `batchSetLayerProperties` | `:670` |
| `setCompositionProperties` | `:1341` |
| `duplicateLayer` | `:202` |
| `deleteLayer` | `:245` |
| `setLayerMask` | `:287` |

`run-script`'s `allowedScripts` allowlist (`src/index.ts:168-191`) also contains `test-animation`, which has **no** case in the host switch — it is a Node-side-only generator, so queuing it through `run-script` yields `{ error: "Unknown command: test-animation" }` from the panel's `default` branch (`:1596`).

**After Effects scripting interfaces used:** `app.project`, `app.project.item()`, `app.project.items.addComp()`, `CompItem`/`FolderItem`/`FootageItem`/`SolidSource`, `comp.layers.addText/addShape/addSolid/addCamera/addNull`, vector property groups (`ADBE Vector Group`, `ADBE Vector Shape - Rect|Ellipse|Star`, `ADBE Vector Graphic - Fill|Stroke`), `ADBE Text Properties` / `ADBE Text Document`, `layer.Effects.addProperty(matchName)`, `layer.applyPreset(File)`, `prop.setValueAtTime`, `prop.expression`, `ParagraphJustification`, `TimeDisplayType` (`src/scripts/mcp-bridge-auto.jsx` passim).

**Standalone `.jsx` files** (`src/scripts/applyEffect.jsx`, `applyEffectTemplate.jsx`, `createComposition.jsx`, `createShapeLayer.jsx`, `createSolidLayer.jsx`, `createTextLayer.jsx`, `getLayerInfo.jsx`, `getProjectInfo.jsx`, `listCompositions.jsx`, `setLayerProperties.jsx`): standalone copies of the same functions that the panel re-declares inline — the panel's `#include` block is commented out (`src/scripts/mcp-bridge-auto.jsx:6-11`). `getLayerInfo.jsx:9-10` additionally reads `../temp/args.json` via `$.fileName`, a leftover from the removed CLI/args-file execution path. Only `mcp-bridge-auto.jsx` is installed and executed.

## Authentication & Identity

**Auth Provider:**
- None. No credentials, tokens, or accounts are handled anywhere in the codebase.

**Trust boundary:**
- The integration is protected only by local filesystem access plus two After Effects preferences: "Allow Scripts to Write Files and Access Network" (`install-bridge.js:109-113`) and the panel's "Auto-run commands" checkbox. Anyone who can write `~/Documents/ae-mcp-bridge/ae_command.json` can drive the host application.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/App Insights/etc.).

**Logs:**
- Node side: `console.error` to stderr throughout `src/index.ts` (e.g. `src/index.ts:44`, `:56`, `:67`, `:71`, `:117`, `:138`), including the result path it is checking — visible in the MCP client's server log.
- Host side: in-panel timestamped log via `logToPanel` (`src/scripts/mcp-bridge-auto.jsx:1710-1713`), newest line prepended to a multiline read-only `edittext`.
- Errors are surfaced to the client as `{ status: "error", command, message, line, fileName }` written into the result file (`src/scripts/mcp-bridge-auto.jsx:1660-1685`).

## CI/CD & Deployment

**Hosting:**
- Local developer machine only; no hosted deployment.

**CI Pipeline:**
- None. No `.github/workflows`, no Dockerfile, no release automation in the checkout.

## Environment Configuration

**Required env vars:**
- None required. Optional: `TEMP` / `TMP` — used only for the manual `test-animation` script path (`src/index.ts:537`).
- External prerequisites instead of env vars: `node` on `PATH` and an absolute path to `build/index.js` in the client's MCP config (`.mcp.json` currently contains `C:\Users\Daniel\Downloads\after-effects-mcp\build\index.js`, which must be rewritten per machine).

**Secrets location:**
- None. No secrets, keys, or connection strings exist in this project.

## Webhooks & Callbacks

**Incoming:**
- None.

**Outgoing:**
- None. The one callback-like mechanism is the 2-second host-side poll of the command file (`src/scripts/mcp-bridge-auto.jsx:1751`) plus the Node-side result poll (`src/index.ts:78`); there is no network callback.

## Installer Integration

- `install-bridge.js` probes hardcoded Adobe install roots for After Effects 2021–2026 (macOS `/Applications/Adobe After Effects <year>`, Windows `C:\Program Files\Adobe\Adobe After Effects <year>`) at `install-bridge.js:22-40`.
- Copies `build/scripts/mcp-bridge-auto.jsx` into `Scripts/ScriptUI Panels/` (macOS) or `Support Files/Scripts/ScriptUI Panels/` (Windows) at `install-bridge.js:69-72`, elevating with `sudo cp` (macOS) or `Start-Process PowerShell -Verb RunAs` (Windows) at `install-bridge.js:80-103`.
- Exits non-zero with manual-copy instructions when the AE install is not found or the source script is missing (`install-bridge.js:46-64`).

---

*Integration audit: 2026-10-30*
