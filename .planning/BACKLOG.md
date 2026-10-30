# Backlog

Deferred work for this project, things worth doing **later**, not now. Nothing here is scheduled. Items are promoted into a phase or a todo when they earn it.

**Writers:** the user (edits directly) and the agent (appends whenever it defers work).
**Item IDs:** `BL-###`: sequential, stable, never reused, never renumbered.
**Statuses:** `open` | `in-progress` (promoted to a phase/todo) | `done` | `dropped`

## Rules

1. **Append only.** Never reorder, renumber, or delete an existing item, change its `Status:` line instead.
2. **One item per `### BL-###: <title>` heading.** The heading is the reference key; keep it stable.
3. **Next free ID = highest existing ID + 1.** Empty backlog → start at `BL-001`.
4. **Dedupe before adding.** Search existing titles and keywords first. If the item already exists, update that entry, do not add a duplicate.
5. **Promote, do not schedule.** To act on an item, move it into `.planning/phases/` (phase work) or `.planning/todos/pending/` (quick capture), set `Status: in-progress`, and name the destination in the item.
6. **Enough context to act on in six months.** Problem + file paths + approach hint. `TBD` is fine for the approach; a missing problem statement is not.
7. **Agents: append here before you finish a task** whenever you defer work, an out-of-scope bug, a recorded follow-up, or a simplification you deliberately chose not to make.

## Items

<!-- New items go at the END of this list. IDs are the keys; order is convenience only. -->

### BL-001: Server reports queued commands as success without confirming execution
- **Area:** api
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** `run-script`, `create-composition`, `apply-effect`, `apply-effect-template`, `setLayerKeyframe`, `setLayerExpression` and `run-bridge-test` all write the command file and immediately return "has been queued" with `isError: false`. A JSX syntax error or a runtime exception in AE produces a successful-looking MCP response, so the client cannot distinguish success from total failure.
- **Files:** `src/index.ts:163`, `src/index.ts:398`, `src/index.ts:440`, `src/index.ts:636`, `src/index.ts:686`, `src/index.ts:920`
- **Approach:** Have each queueing tool await `waitForBridgeResult` with a server-generated `commandId` and return `isError: true` when the result carries `status: "error"` or the wait times out. See `.planning/codebase/CONCERNS.md` ("Server never learns that AE failed").
- **Resolution:** 2026-10-30 — all 9 tool bodies now `return await runBridgeCommand("<command>", parameters)`; `src/bridge.ts` awaits a result whose `_commandExecuted` matches the command and sets `isError` on timeout/error. Zero `setTimeout` and zero "has been queued" remain in `src/index.ts`.

### BL-002: eval() on the AE command file allows arbitrary code execution in After Effects
- **Area:** api
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** The bridge evaluates the raw contents of `ae_command.json`: the poll loop falls back to `eval("(" + content + ")")` and the shipped JSON polyfill is `JSON.parse = function (text) { return eval("(" + text + ")"); }`. Any local process can write that file and get ExtendScript executed inside AE, which the installer has already granted file-write and network access.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:1731`, `src/scripts/mcp-bridge-auto.jsx:1242`, `install-bridge.js:109`
- **Approach:** Remove both `eval` paths, use a real ES3-compatible JSON parser, and refuse to execute a command file that fails to parse.
- **Resolution:** 2026-10-30 — `src/scripts/mcp-bridge-auto.jsx` now ships a strict ES3 recursive-descent parser (installed only when the host lacks `JSON.parse`); the poll loop uses bare `JSON.parse` plus a shape guard that logs and ignores a command file with no string `command` field. No `eval` remains in executable code.

### BL-003: install-bridge.js builds elevated PowerShell/sudo commands by string interpolation
- **Area:** tooling
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** The Windows elevation path interpolates filesystem paths into a PowerShell `-Command` string escaping only backslashes, then runs it via `execSync('powershell -Command "..."')`; the macOS path does the same into `sudo cp`. A path containing a quote, backtick, `$(...)` or `;` breaks out of the argument, and the command runs elevated. The first `copyFileSync` failure is swallowed by a bare `catch {}`.
- **Files:** `install-bridge.js:96`, `install-bridge.js:98`, `install-bridge.js:88`
- **Approach:** Use `execFile`/`spawn` with an argument array (no shell), validate source and destination against expected directories, and only escalate for `EACCES`/`EPERM` while logging the rest.
- **Resolution:** 2026-10-30 — `execSync` and all shell string building deleted; the copy is a plain `fs.copyFileSync(sourceScript, destinationScript)`. `EPERM`/`EACCES` now print elevation guidance plus manual copy steps and exit 1; every other error message is surfaced and exits non-zero.

### BL-004: Timeout and staleness are indistinguishable from valid results
- **Area:** api
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** `waitForBridgeResult` returns `JSON.stringify({ error: ... })` on timeout as ordinary content (no `isError`), and freshness is inferred from `content.length !== lastSize` plus a 30 s staleness window. Two commands with the same name and result length are indistinguishable, and "AE is not running" reaches the caller looking like data.
- **Files:** `src/index.ts:78`, `src/index.ts:41`
- **Approach:** Correlate on a `commandId` echoed back by the panel; return `isError: true` on timeout.
- **Resolution:** 2026-10-30 — correlation is on the panel's existing `_commandExecuted` echo (no protocol change needed), and `waitForBridgeResult` compares full content strings instead of `content.length`, so equal-length results no longer stall the wait. Timeouts return an `error` payload that `isErrorResult` turns into `isError: true`.

### BL-005: Fixed 1000 ms sleep instead of result polling
- **Area:** api
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** The `mcp_aftereffects_applyEffect` and `mcp_aftereffects_applyEffectTemplate` tools await a hardcoded 1 s sleep then read the result file. The panel polls every 2000 ms, so the common case is a guaranteed stale read returned as success.
- **Files:** `src/index.ts:747`, `src/index.ts:800`, `src/scripts/mcp-bridge-auto.jsx:1751`
- **Approach:** Replace with `waitForBridgeResult` keyed on a command id.
- **Resolution:** 2026-10-30 — both `mcp_aftereffects_*` tools now call `runBridgeCommand`, which polls (250 ms) for the matching `_commandExecuted` instead of sleeping 1 s.

### BL-006: AE operations duplicated between the bridge and the standalone scripts
- **Area:** general
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** Every operation exists twice: inlined in `mcp-bridge-auto.jsx` and as a standalone `src/scripts/*.jsx` file. The `#include` directives are commented out, nothing in `src/index.ts` invokes the standalone files, yet the build copies all of them into `build/scripts/`. Defects are already present in both copies (`layer.Effects`).
- **Files:** `src/scripts/mcp-bridge-auto.jsx:16`, `src/scripts/applyEffect.jsx`, `package.json`
- **Approach:** Pick one source of truth: delete the standalone scripts, or restore the `#include` chain and delete the inlined copies.

### BL-007: setLayerProperties and batchSetLayerProperties delete all Position keyframes
- **Area:** api
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** Both functions run `while (posProp.numKeys > 0) { posProp.removeKey(1); }` on the Position property before applying a value, silently destroying existing animation, and the loss is not reported to the MCP client.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:610`, `src/scripts/mcp-bridge-auto.jsx:708`
- **Approach:** Only remove keyframes behind an explicit `replaceKeyframes: true` argument, defaulting to leaving existing animation intact.
- **Resolution:** 2026-10-30 — both functions now inspect `Position.numKeys` first: with keyframes present and no `replaceKeyframes`, the write is skipped entirely and the property is named in `skippedProperties` together with the keyframe count and the flag that would replace them. Replacing is opt-in (`replaceKeyframes: true` at the top level, or per operation in `batchSetLayerProperties`, where the per-operation flag wins), and the number of removed keys is returned as `removedKeyframes`. The `setLayerProperties` help line in `src/index.ts` documents the flag. Live verification: steps S6/S7 of `tests/manual/live-ae-smoke.md`.

### BL-008: layer.Effects (capital E) is not an AE API property
- **Area:** api
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** `applyEffect` and `applyEffectTemplate` call `layer.Effects.addProperty(...)`. The AE API exposes `layer.effects` / `layer.property("Effects")`, so effect application fails at runtime — and the failure only reaches the panel log, never the MCP client.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:917`, `src/scripts/mcp-bridge-auto.jsx:931`, `src/scripts/mcp-bridge-auto.jsx:1140`, `src/scripts/mcp-bridge-auto.jsx:1162`, `src/scripts/applyEffect.jsx:50`, `src/scripts/applyEffectTemplate.jsx:138`
- **Approach:** Use `layer.property("Effects").addProperty(...)` and verify against a live AE instance.
- **Resolution:** 2026-10-30 — every call site now uses `layer.property("ADBE Effect Parade").addProperty(...)`: four in `mcp-bridge-auto.jsx` (`applyEffect` matchName and Effect-menu branches, `applyEffectTemplate` single and multi-effect branches) and the two duplicated copies (`applyEffect.jsx`, `applyEffectTemplate.jsx`). The matchName form was chosen over the localized display name so the lookup survives a non-English UI. A search for `layer.Effects` across `src/scripts/` now returns nothing. Live verification: step S8 of `tests/manual/live-ae-smoke.md` — still manual, because the defect is only observable in a running AE.

### BL-009: Inconsistent composition lookup semantics across commands
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** `setLayerKeyframe` and `setLayerExpression` resolve the comp via `app.project.items[compIndex]` (an index over all project items, folders included) while `applyEffect` and `applyEffectTemplate` use `app.project.item(compIndex)`. The documented "usually 1" only holds when composition 1 is also project item 1.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:753`, `src/scripts/mcp-bridge-auto.jsx:813`, `src/scripts/mcp-bridge-auto.jsx:871`
- **Approach:** Standardize on one resolver (prefer composition-by-name with an active-comp fallback) and document it in the tool schema.

### BL-010: MCP tools pass unvalidated parameter objects into ExtendScript
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** `run-script` accepts `z.record(z.string(), z.unknown())` and forwards it verbatim; the JSX side then reads fields with `||` defaults and no type or range checks. `parseInt(args.width) || 1920` turns invalid input into a silent default instead of an error, and a malformed shape produces a mid-operation AE exception after partial mutation.
- **Files:** `src/index.ts:169`, `src/scripts/mcp-bridge-auto.jsx:19`, `src/scripts/mcp-bridge-auto.jsx:1341`
- **Approach:** Give every command a typed Zod schema (bounded numbers, fixed-length vector tuples, length-capped expression strings) and validate before the command file is written.

### BL-011: presetPath from MCP input reaches the filesystem unchecked
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** `presetPath` is passed straight into `new File(presetPath)` and `layer.applyPreset(...)`, with no allowlist, extension check, or confinement to a presets directory, so any readable path the AE process can reach is accepted.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:902`, `src/scripts/applyEffect.jsx:35`
- **Approach:** Confine to a configured presets root, resolve the path, and reject anything outside it.

### BL-012: Shared command/result files are written non-atomically with no locking or command identity
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** `writeCommandFile`/`clearResultsFile` write the shared files with `fs.writeFileSync` while the AE panel polls and rewrites the same files (including a read-modify-write in `updateCommandStatus`). There is no lock, no temp-file-plus-rename, and no command id — only a `status` field. A torn read is logged by the panel and the command is lost.
- **Files:** `src/index.ts:110`, `src/index.ts:127`, `src/scripts/mcp-bridge-auto.jsx:1687`
- **Approach:** Write to a temp path and rename; carry a server-generated `commandId` in both directions.

### BL-013: No test infrastructure and no test script
- **Area:** testing
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** `package.json` has no `test` script and the repo has no `tests/` directory and no `*.test.*`/`*.spec.*` file. The two dominant bug classes here — a wrong AE property name and a wrong index semantic — would be caught by one smoke test against a live AE instance, and the JSON wire format has no coverage at all.
- **Files:** `package.json`, `src/index.ts`, `src/scripts/mcp-bridge-auto.jsx`
- **Approach:** Add a Node test file that exercises `waitForBridgeResult`/`writeCommandFile` against fixture files in a temp dir (no AE needed), plus one manual smoke script for the AE round trip.
- **Resolution:** 2026-10-30 — `tests/bridge.test.ts` (12 tests, `node:test` + `node:assert/strict`, zero dependencies) plus `npm test` (`node --experimental-strip-types --test tests/*.test.ts`). Baseline: 12 pass / 0 fail in ~1.4 s. Each test points `AE_MCP_BRIDGE_DIR` at a throwaway temp dir, so the real bridge folder is never touched. `npm run build` is green. The AE round trip is now covered by the documented manual procedure in `tests/manual/live-ae-smoke.md` — see BL-024.

### BL-014: Bridge directory resolution diverges between server and AE
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** The server uses `os.homedir()/Documents/ae-mcp-bridge` while the panel uses `Folder.myDocuments + "/ae-mcp-bridge"`. With OneDrive Known Folder Move the two can resolve to different directories, so the panel never sees a command and nothing errors on either side.
- **Files:** `src/index.ts:26`, `src/scripts/mcp-bridge-auto.jsx:1321`, `src/scripts/mcp-bridge-auto.jsx:1331`
- **Approach:** Resolve the directory once and share it explicitly (env var or discovery file) instead of deriving it independently on both sides.

### BL-015: Unused dependency and dead code
- **Area:** general
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** `node-fetch` is a runtime dependency that is never imported (Node 18+ has global `fetch`); `execSync` is imported unused in `src/index.ts` and `install-bridge.js`, and `TEMP_DIR` is only logged. Dead code invites "temporary" shell-outs and misleads readers.
- **Files:** `package.json`, `src/index.ts:3`, `src/index.ts:22`
- **Approach:** `npm uninstall node-fetch`; delete the unused import and constant.
- **Resolution:** 2026-10-30 — `node-fetch` uninstalled (`removed 6 packages`), `TEMP_DIR` and its log line deleted from `src/index.ts`, `copyfiles` replaced by `node -e "require('node:fs').cpSync(...)"` in the `build` script. `execSync` needed no edit: it was already gone from both `src/index.ts` and `install-bridge.js` by the time this item was picked up (BL-003 rewrote the installer around `fs.copyFileSync`). No `node-fetch`/`execSync` references remain in `src/` or `install-bridge.js`. Gates: `npm run build` 24.1kb, `npm test` 12/12.

### BL-016: Loose version ranges and a postinstall build with no type-check
- **Area:** tooling
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** All dependencies use caret ranges, `postinstall` runs `npm run build` for every consumer, and the esbuild-based build never type-checks, so `tsc --noEmit` errors ship undetected. The MCP SDK is pre-2.0 and its minor releases have changed tool-registration APIs.
- **Files:** `package.json`, `tsconfig.json`
- **Approach:** Pin exact versions, move the build to `prepare`/`prepack` or CI, and add `tsc --noEmit` to the build script.

### BL-017: README claims Node >= 14 while the package needs modern ESM Node
- **Area:** docs
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** The README badge and prerequisites state Node v14 or later, but the package is `"type": "module"` with `module`/`moduleResolution: "Node16"` and the MCP SDK needs modern Node. Following the docs lands a new user on a runtime that cannot load the server.
- **Files:** `README.md:3`, `README.md:65`, `package.json`
- **Approach:** State `>=18` (or `>=20` to match the SDK), add an `engines` field, and document the failure mode users will otherwise hit.

### BL-018: test-animation writes an interpolated .jsx file for manual execution
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** The tool builds a script by string-interpolating `compIndex`, `layerIndex` and temp paths, writes it to `%TEMP%/ae_test_<ts>.jsx`, and instructs the user to run it manually via File > Scripts. It also calls blocking `alert()` dialogs, so it cannot be automated.
- **Files:** `src/index.ts:526`, `src/index.ts:536`, `src/index.ts:603`
- **Approach:** Reimplement as a normal bridge command (`setLayerKeyframe`/`setLayerExpression` already exist) and drop the script-generation path.

### BL-019: getProjectInfo silently caps at 50 items and reports wrong counts
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** The item loop stops at `Math.min(project.numItems, 50)` and `itemCounts` is computed from that truncated loop, so a large project reports authoritative-looking counts that are wrong, next to a correct `numItems`.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:1390`
- **Approach:** Scan all items (cheap in-process loop) and paginate the response instead of the scan.

### BL-020: logToPanel grows an unbounded string
- **Area:** ui
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** Every log line is prepended to the panel `edittext` value and never trimmed; `executeCommand` logs roughly ten lines per command, so the string is reallocated constantly and grows without bound over a long session.
- **Files:** `src/scripts/mcp-bridge-auto.jsx:1710`
- **Approach:** Keep the last N lines (e.g. 200) and drop the tail.

### BL-021: Installer hardcodes AE 2021-2026 paths and has no uninstall/rollback
- **Area:** tooling
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** The installer hardcodes an install-path matrix for AE 2021-2026 and copies into the ScriptUI Panels folder with elevation, with no `uninstall-bridge` script, no backup of a file already at the destination, and no integrity check of the source before the elevated copy.
- **Files:** `install-bridge.js:49`, `install-bridge.js:70`
- **Approach:** Discover install roots from a configurable list plus an env var, fail loudly listing searched paths, and add an uninstall script that restores any backed-up panel.

### BL-022: Error reporting loses type and stack
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** Server catches build messages with `` `${String(error)}` `` and the bridge uses `error.toString()`, so error type, stack, and AE's `line`/`fileName` are lost on the server side and the caller cannot tell a schema error from an I/O error from a timeout.
- **Files:** `src/index.ts:230`, `src/index.ts:425`, `src/index.ts:671`, `src/scripts/mcp-bridge-auto.jsx:1651`
- **Approach:** Return a structured error object (`name`, `message`, `code`, `line`, `fileName`) and surface it with `isError: true`.

### BL-023: run-script allowlist contains a command the bridge does not dispatch
- **Area:** api
- **Status:** open
- **Added:** 2026-10-30 by agent
- **Problem:** `test-animation` is in the allowlist, but the bridge `switch` has no `test-animation` case, so queueing it falls to `default:` and writes `{"error":"Unknown command: test-animation"}` — which the queueing tool reports as a successful queue. Nothing keeps the two lists in sync.
- **Files:** `src/index.ts:186`, `src/scripts/mcp-bridge-auto.jsx:1498`
- **Approach:** Derive the allowlist from a single shared command name constant, or assert at startup that both lists are identical.

---

### BL-024: No live-AE smoke test for the round trip
- **Area:** testing
- **Status:** done
- **Added:** 2026-10-30 by agent
- **Problem:** `tests/bridge.test.ts` covers the server side of the file IPC only. Nothing exercises the AE side: a real command written by the server, picked up by `mcp-bridge-auto.jsx`, executed against a live project, and echoed back. The two dominant bug classes here (a wrong AE property name such as `layer.Effects`, and a wrong item-index semantic) are invisible to the current suite.
- **Files:** `tests/bridge.test.ts`, `src/scripts/mcp-bridge-auto.jsx`, `install-bridge.js`
- **Approach:** Add a documented manual smoke procedure (a small `tests/manual/` script plus a README note): open AE, run the panel, execute `listCompositions`, `create-composition`, `setLayerKeyframe`, `apply-effect`, then assert `ae_mcp_result.json` shows the expected command and payload. Keep it manual, out of `npm test`.
- **Resolution:** 2026-10-30 — `tests/manual/live-ae-smoke.md` documents eleven steps (bridge alive, composition and layer creation, transform write, keyframes, keyframe preservation and replacement, effect application, batch write, the built-in effect probe, and a panel-closed timeout check), each with expected AE-side state and pass/fail criteria. A `.md` under `tests/manual/` is not matched by the `tests/*.test.ts` glob, so `npm test` is unaffected. Remaining gap: the procedure is executed by hand — a live-AE run is still required before release, and no CI can cover it.

_Last updated: 2026-10-30_
