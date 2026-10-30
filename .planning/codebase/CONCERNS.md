# Codebase Concerns

**Analysis Date:** 2026-10-30

## Tech Debt

**Duplicated operation implementations (bridge vs standalone scripts):**
- Issue: Every AE operation exists twice — once inlined in `src/scripts/mcp-bridge-auto.jsx` (lines 16–1320) and once as a standalone file in `src/scripts/*.jsx`. The `#include` directives that would have unified them are commented out, and `build` copies *all* `.jsx` files into `build/scripts/`. Nothing in `src/index.ts` invokes the standalone copies, so they can silently diverge while shipping in the package.
- Files: `src/scripts/mcp-bridge-auto.jsx`, `src/scripts/applyEffect.jsx`, `src/scripts/applyEffectTemplate.jsx`, `src/scripts/createComposition.jsx`, `src/scripts/createShapeLayer.jsx`, `src/scripts/createSolidLayer.jsx`, `src/scripts/createTextLayer.jsx`, `src/scripts/getLayerInfo.jsx`, `src/scripts/getProjectInfo.jsx`, `src/scripts/listCompositions.jsx`, `src/scripts/setLayerProperties.jsx`, `package.json` (`build` script)
- Impact: Any bug fix must be made twice or it is made once and left broken in the other copy. The copies already share defects (`layer.Effects` casing at `applyEffect.jsx:50`, `:64` and `mcp-bridge-auto.jsx:917`, `:931`, `:1140`, `:1162`), proving the drift risk is real, not theoretical.
- Fix approach: Delete the standalone scripts (nothing loads them) or restore the `#include` chain and keep the standalone files as the single source of truth. Do not keep both bodies.

**Unused imports and constants:**
- Issue: `execSync` is imported and never used; `TEMP_DIR` is defined and only logged; `SCRIPTS_DIR` is used only for a startup log line.
- Files: `src/index.ts:3`, `:21`, `:22`, `:952`, `:953`
- Impact: Dead code invites "temporary" shell-outs and misleads readers about how the server reaches AE.
- Fix approach: Remove `execSync` and `TEMP_DIR`; keep `SCRIPTS_DIR` only if something loads it.

**Unused dependency:**
- Issue: `node-fetch` is declared as a runtime dependency but is never imported anywhere in `src/`, `install-bridge.js`, or the `.jsx` files. Node 18+ has a global `fetch`.
- Files: `package.json` (`dependencies`)
- Impact: Extra install surface and supply-chain exposure for zero functionality.
- Fix approach: `npm uninstall node-fetch`; add markdown/`.jsx` lint if you want the dead dependency caught automatically.

**Hand-rolled ExtendScript JSON polyfill:**
- Issue: The bridge ships a re-implemented `JSON.stringify`/`JSON.parse` because ES3 has no JSON object. It works but is unmaintained, unevaluated by any test, and its parse path is `eval`.
- Files: `src/scripts/mcp-bridge-auto.jsx` (polyfill block ending at `:1242`–`:1244`)
- Impact: Any escaping edge case (backslashes in Windows paths, quotes inside expressions, non-ASCII) corrupts the wire format between server and AE, and corruption is silent because a failed `JSON.parse` falls through to raw-string handling.
- Fix approach: Replace with a vetted ES3-compatible JSON shim (e.g. `json2.js`) vendored once, and delete the `eval` fallback.

**Window-only reality, cross-platform claim:**
- Issue: The installer hardcodes AE 2021–2026 install paths for both platforms and elevates with `sudo cp` or `Start-Process -Verb RunAs`. Command-file discovery depends on `os.homedir()/Documents` on the server side versus `Folder.myDocuments` on the AE side.
- Files: `install-bridge.js:88`, `:91`, `:96`, `:98`, `src/index.ts:26`, `src/scripts/mcp-bridge-auto.jsx:1321`, `:1331`
- Impact: On Windows with OneDrive "Known Folder Move", `Folder.myDocuments` (AE) and `os.homedir()/Documents` (Node) can resolve to different directories, and the bridge then never sees a command — with no error on either side, just a timeout.
- Fix approach: Resolve the bridge directory once and pass it explicitly (env var or a discovery file), rather than deriving it independently on both sides.

## Known Bugs

**`layer.Effects` (capital E) is not an AE API property:**
- Symptoms: `applyEffect` / `applyEffectTemplate` fail at runtime with "undefined is not an object" whenever an effect is applied by name or match name.
- Files: `src/scripts/mcp-bridge-auto.jsx:917`, `:931`, `:1140`, `:1162`; `src/scripts/applyEffect.jsx:50`, `:64`; `src/scripts/applyEffectTemplate.jsx:138`, `:160`
- Trigger: Queue any `applyEffect` / `applyEffectTemplate` command.
- Workaround: None in code; the error surfaces only in the panel log and in `ae_mcp_result.json`, which the queue-only MCP tools never read back.

**Inconsistent composition lookup semantics:**
- Symptoms: `setLayerKeyframe` and `setLayerExpression` resolve the comp through `app.project.items[compIndex]` (a raw index into *all* project items, including folders and footage), while `applyEffect` / `applyEffectTemplate` use `app.project.item(compIndex)`. The MCP schemas describe the parameter as "Composition index (usually 1)", which is only correct if comp 1 happens to be project item 1.
- Files: `src/scripts/mcp-bridge-auto.jsx:753`, `:813` (and their `app.project.items[...]` bodies) versus `:871`, `:1006`
- Trigger: Any project whose first item is not a composition, or with folders.
- Workaround: The caller must guess which indexing the target command uses.

**`setLayerProperties` / `batchSetLayerProperties` destroy existing Position keyframes:**
- Symptoms: Both functions delete every Position keyframe before applying new values.
- Files: `src/scripts/mcp-bridge-auto.jsx:610` (`if (posProp.numKeys > 0) { while (posProp.numKeys > 0) { posProp.removeKey(1); } }`), `:708`
- Trigger: Calling either tool on an animated layer to change its position.
- Workaround: None. This is irreversible without an AE undo and is not reported to the MCP client.

**`getProjectInfo` silently truncates and reports wrong counts:**
- Symptoms: The item loop stops at `Math.min(project.numItems, 50)` while `itemCounts` is computed from that same truncated loop, so a 200-item project reports counts that look authoritative and are wrong. `numItems` is reported correctly alongside them, which makes the mismatch look like data loss.
- Files: `src/scripts/mcp-bridge-auto.jsx:1390` (`for (var i = 1; i <= Math.min(project.numItems, 50); i++)`)
- Trigger: Any project with more than 50 items.
- Workaround: None; the response carries no truncation flag.

**Server never learns that AE failed:**
- Symptoms: `run-script`, `create-composition`, `apply-effect`, `apply-effect-template`, `setLayerKeyframe`, `setLayerExpression`, `run-bridge-test` all write a command file and immediately return "has been queued" as success. A JSX syntax error, a wrong index, or a runtime exception in AE produces `isError: false` on the MCP side.
- Files: `src/index.ts:163`–`:231` (`run-script`), `:398`–`:430`, `:440`–`:478`, `:484`–`:515`, `:636`–`:673`, `:686`–`:721`, `:920`–`:942`
- Trigger: Any of the above tools against a project state the JSX does not expect.
- Workaround: The caller must separately call `get-results` and parse the text by hand, and `get-results` is not wired into most tool namespaces.

**Bridge "success" logging when the operation returned an error object:**
- Symptoms: Operation functions catch their own errors and *return* `{"status":"error", ...}` instead of throwing, so `executeCommand` proceeds to log "Command completed successfully" and sets command status to `completed`.
- Files: `src/scripts/mcp-bridge-auto.jsx:1498` (`executeCommand`), `:1341`–`:1368` (`setCompositionProperties` returns error JSON), `:1651`–`:1685` (outer catch, only reached on a real throw)
- Trigger: Any operation-level failure that is caught inside the operation.
- Workaround: Inspect `ae_mcp_result.json` directly.

## Security Considerations

**`eval()` on the command file is a remote-code-execution path into the AE process:**
- Risk: `checkForCommands` reads `~/Documents/ae-mcp-bridge/ae_command.json` and, when `JSON.parse` is unavailable, evaluates its raw contents with `eval("(" + content + ")")`. The JSON polyfill used elsewhere in the same file is itself `JSON.parse = function (text) { return eval("(" + text + ")"); }`. Either path executes arbitrary ExtendScript inside After Effects with whatever privileges AE has — including `system()`/`File` write access, which the installer explicitly asks the user to grant ("Allow Scripts to Write Files and Access Network", `install-bridge.js:109`).
- Files: `src/scripts/mcp-bridge-auto.jsx:1731` (poll-loop `eval`), `:1242`–`:1244` (polyfill `eval`), `install-bridge.js:109`
- Current mitigation: A comment asserts the input is "our own command file". That is an assumption about filesystem integrity, not a control: the directory is user-writable, unsandboxed, and shared with any other process running as the same user. The `status === "pending"` check precedes execution but does not sanitize content, and the status field is client-writable.
- Recommendations: Delete both `eval` paths and use a real JSON parser; refuse to execute a command file that fails to parse. Treat the bridge directory as untrusted input, and have the panel verify a nonce that the server generated for that specific command.

**`install-bridge.js` builds a PowerShell command by string interpolation:**
- Risk: The Windows elevation path concatenates filesystem paths into a PowerShell `-Command` string, escaping only backslashes (`sourceScript.replace(/\\/g, '\\\\')`), then passes the result to `execSync('powershell -Command "..."')`. A path containing `"`, a backtick, `$(...)`, or `;` breaks out of the argument. The macOS path does the same with `sudo cp "${sourceScript}" "${destinationScript}"`. In practice the paths are derived from `__dirname` and a hardcoded Adobe path — but the copy is run as Administrator, so any injectable component is elevated, and `__dirname` follows wherever the package is installed or extracted (a cloned/extracted archive in a user-writable directory supplies a path the attacker controls).
- Files: `install-bridge.js:96`, `:98` (Windows), `:88`–`:91` (macOS), `:3` (unused `execSync` import)
- Current mitigation: Only the regex escape described above; no allowlist, no quoting discipline, no `execFile`/`spawn` with an argument array.
- Recommendations: Use `execFile('powershell', ['-Command', ...])` or, better, avoid the shell entirely: `fs.copyFileSync` with a pre-flight write check, and fall back to elevation only via a fixed, non-interpolated command. Validate the source and destination against an allowlist of expected directories before invoking anything elevated.

**Silent failure on the primary copy path hides a failed install:**
- Risk: On macOS the first `fs.copyFileSync` is wrapped in `try { ... } catch { }` with a comment; any failure other than permissions falls through to `sudo cp`, which can fail differently, and on Windows the error `message` is read off an untyped JS error.
- Files: `install-bridge.js:88`–`:91`, `:112`–`:115`
- Current mitigation: None. Failures surface only as whatever `execSync` prints.
- Recommendations: Log the caught error and only escalate to elevation for the specific permission error code (`EACCES`/`EPERM`).

**Unsanitized `presetPath` reaches the filesystem from MCP input:**
- Risk: `presetPath` is passed straight into `new File(presetPath)` and `layer.applyPreset(...)`. Any path the AE process can read is accepted — there is no allowlist, no extension check, and no confinement to a presets directory.
- Files: `src/scripts/mcp-bridge-auto.jsx:902` (`var presetFile = new File(presetPath);`), `src/scripts/applyEffect.jsx:35`
- Current mitigation: Zod declares it as a string in the tool schema; nothing validates the value.
- Recommendations: Confine to a configured presets root, resolve, and reject paths outside it.

**Arbitrary argument passthrough into ExtendScript:**
- Risk: `run-script` accepts `parameters: z.record(z.string(), z.unknown())` and forwards the object verbatim into `executeCommand`. Every downstream JSX function then reads fields off it with `||` defaults and no type or range checks — `args.position`, `args.scale`, `args.maskPath` points, `args.expressionString` (arbitrary JS executed by AE's expression engine), `args.duration`, `args.frameRate`, `args.width`/`args.height`. A malformed shape produces a mid-operation AE exception after partial mutation, not a rejected request.
- Files: `src/index.ts:169` (`z.record`), `src/scripts/mcp-bridge-auto.jsx:16`–`:1320` (all operation bodies), `:1341`–`:1368`
- Current mitigation: `parseInt(args.width) || 1920` style coercion (`src/scripts/mcp-bridge-auto.jsx:19`, `:20`), which turns `"abc"` into a silent 1920 rather than an error.
- Recommendations: Give each command a real Zod schema (numbers bounded, vectors as fixed-length tuples, expression strings length-capped) and validate before writing the command file, not inside AE.

**Non-atomic, unlocked shared files between two processes:**
- Risk: `writeCommandFile` and `clearResultsFile` use `fs.writeFileSync` directly on the shared path while the AE panel polls and rewrites the same files (`updateCommandStatus` does a read-modify-write). There is no lock, no temp-file-plus-rename, and no per-command identity beyond `status`.
- Files: `src/index.ts:110`–`:121`, `:127`–`:139`; `src/scripts/mcp-bridge-auto.jsx:1687`–`:1708`
- Current mitigation: A `status` field (`pending`/`running`/`completed`/`error`) and a 2000 ms poll interval. A torn read is caught by the panel's `try/catch` and logged, then the command is simply lost.
- Recommendations: Write to `ae_command.json.tmp` and rename; include a server-generated `commandId` and have the panel echo it back so results can be correlated instead of inferred.

## Performance Bottlenecks

**Fixed 1000 ms sleep instead of polling for the real result:**
- Problem: The `mcp_aftereffects_applyEffect` / `applyEffectTemplate` tools write a command, `await new Promise(resolve => setTimeout(resolve, 1000))`, then read whatever is in the result file. One second is both too short (panel polls every 2000 ms, so the command may not even have been picked up) and arbitrary.
- Files: `src/index.ts:747`, `:800`; poll interval at `src/scripts/mcp-bridge-auto.jsx:1751`–`:1753` (`app.scheduleTask("checkForCommands()", checkInterval, true)` with `checkInterval = 2000` at `:1319`)
- Cause: The panel's poll interval (2 s) is longer than the client's sleep (1 s), so the common case is a guaranteed stale read.
- Improvement path: Use `waitForBridgeResult` with a `commandId` match, and make the panel wake on file change rather than on a fixed timer.

**`logToPanel` grows an unbounded string:**
- Problem: Every log line is prepended to the ScriptUI `edittext` value: `logText.text = timestamp + ": " + message + "\n" + logText.text`. `executeCommand` logs ~10 lines per command. The string is reallocated on every append and never trimmed.
- Files: `src/scripts/mcp-bridge-auto.jsx:1710`–`:1714`
- Cause: No cap, no ring buffer.
- Improvement path: Keep the last N lines (e.g. 200) and drop the tail.

## Fragile Areas

**The wire contract is a bare `status` field on a file:**
- Files: `src/index.ts:110`–`:139`, `src/scripts/mcp-bridge-auto.jsx:1498`, `:1687`, `:1716`
- Why fragile: Command identity is inferred from `_commandExecuted` and `content.length !== lastSize` (`src/index.ts:78`–`:107`) rather than from a unique id. Two commands with the same name and same result length are indistinguishable; a stale file within the staleness window passes as fresh.
- Safe modification: Add a `commandId` (monotonic or UUID) written by the server, echoed into the result, and matched by the waiter. Never infer freshness from size or timestamps.
- Test coverage: None. No test asserts the round-trip contract at all.

**Result staleness heuristic is time-based, not identity-based:**
- Files: `src/index.ts:41`–`:75` (`readResultsFromTempFile`, 30 s window), `:78`–`:107` (`waitForBridgeResult` timeout returns `JSON.stringify({ error: ... })` as ordinary content)
- Why fragile: A timeout is indistinguishable from a valid result for the caller (`isError` is not set), so "AE is not running" and "here are your compositions" travel the same path.
- Safe modification: Return `isError: true` on timeout, and include the error object in the response rather than in a JSON string.
- Test coverage: None.

**Panel bootstrap ordering:**
- Files: `src/scripts/mcp-bridge-auto.jsx:1677` (`panel.show()` is the last statement), `:1756` (`startCommandChecker()`), `:1710` (`logToPanel` defined after its first use in the file's execution order)
- Why fragile: The whole script is one flat top-level program that builds UI, defines functions, and starts a timer. `app.scheduleTask` fires on AE's main thread, so a slow command blocks the UI, and any top-level exception after the panel is built leaves a visible panel with a dead poller.
- Safe modification: Wrap the top-level execution in a single `try/catch` that reports to the panel, and start the poller only after `panel.show()` returns.
- Test coverage: None.

**Hardcoded AE install-path matrix:**
- Files: `install-bridge.js` (2021–2026 path arrays), `src/scripts/mcp-bridge-auto.jsx` (version gate `parseFloat(app.version) >= 25.0` for the AE 2025 dockable-panel warning)
- Why fragile: Each AE release shifts the accepted range; an unlisted version silently gets no install and no warning beyond the generic catch.
- Safe modification: Discover install roots from a configurable list plus an env var, and fail loudly listing the searched paths (the installer already prints them at `install-bridge.js:49`, `:51` — make that the failure path too).
- Test coverage: None.

## Scaling Limits

**Single shared command slot:**
- Current capacity: Exactly one in-flight command. `writeCommandFile` overwrites `ae_command.json` unconditionally.
- Limit: Two MCP clients (or two tools called in parallel) clobber each other; the second write wins and the first command is never executed, with both callers told "queued".
- Scaling path: Use a per-command file in a directory (`commands/<id>.json`) and a `results/<id>.json`, or a single append-only queue file.

**50-item project introspection cap:**
- Current capacity: 50 items in `getProjectInfo`.
- Limit: Projects larger than that get truncated counts with no signal (`src/scripts/mcp-bridge-auto.jsx:1390`).
- Scaling path: Iterate all items (it is a cheap in-process loop) and paginate the *response*, not the scan.

**2000 ms poll with a blocking UI thread:**
- Current capacity: One command per ~2 s, and only while AE is idle enough to run the scheduled task.
- Limit: Long operations (build, render, large batch) starve the poller; queued commands are silently delayed.
- Scaling path: Report a `running` heartbeat with progress, and let the server's waiter distinguish "not started" from "still running".

## Dependencies at Risk

**`@modelcontextprotocol/sdk` (caret `^1.28.0`, locked 1.28.0):**
- Risk: Pre-1.0 SDK surface; minor releases have made breaking changes to tool registration and transport APIs. `^1.28.0` allows any 1.x.
- Impact: `npm install` on a fresh clone can resolve a version whose `server.tool(...)` overloads differ, breaking every tool definition at load time.
- Migration plan: Pin exactly (`"1.28.0"`), commit `package-lock.json`, and add a smoke test that boots the server and lists tools.

**`zod` (caret `^3.22.2`, locked 3.24.2):**
- Risk: `^3` is safe within v3, but a future zod v4 major reaches the tree transitively via the MCP SDK regardless of this pin.
- Impact: `z.record(z.string(), z.unknown())` and the `.describe()` chains rely on v3 semantics.
- Migration plan: Pin exactly; validate major upgrades against the SDK's own zod range.

**`esbuild` (`^0.27.4`) and `copyfiles` (`^2.4.1`) as devDependencies with `postinstall: npm run build`:**
- Risk: `postinstall` builds with whatever caret range resolves, on every install, including for consumers who only wanted the package. There is no TypeScript type-check in the build (`esbuild` does not type-check).
- Impact: A broken or malicious minor of a build dep executes automatically; type errors ship undetected because `tsc --noEmit` is never run.
- Migration plan: Move the build to `prepare`/`prepack` or a CI step, pin the versions, and add `tsc --noEmit` to the build script.

**Docs/runtime version claims are wrong:**
- Risk: `README.md` advertises Node >= 14 (`README.md:3`, `:65`), but the package is `"type": "module"` with `module`/`moduleResolution: "Node16"`, and the MCP SDK requires modern Node (18+ realistically). Following the README lands the user on a runtime that cannot load the server.
- Impact: Every new user's first experience is an `ERR_UNKNOWN_FILE_EXTENSION`/ESM failure that the README does not explain.
- Migration plan: State `>=18` (or `>=20`, matching the SDK), add an `engines` field, and let npm enforce it.

## Missing Critical Features

**No health/readiness signal:**
- Problem: The server cannot tell whether the AE panel is installed, open, auto-running, or dead. Every failure mode is a 5–6 s timeout that is then reported as content.
- Blocks: Any reliable automation; any tool call that needs to know the bridge is live before mutating a project.

**No verification that a queued command executed:**
- Problem: `run-script` and friends return "has been queued" and stop. Nothing confirms execution, and the allowlisted command name is not validated against what the panel actually dispatches (`src/index.ts:172`–`:193` versus the `switch` at `src/scripts/mcp-bridge-auto.jsx:1498` — the allowlist contains `test-animation`, which is *not* a bridge command and dispatches to `default:` returning `{"error":"Unknown command: test-animation"}`).
- Blocks: Deterministic client behavior; retries; error surfaces in MCP clients.

**No uninstall / rollback path:**
- Problem: `install-bridge.js` copies into AE's ScriptUI Panels folder and escalates privileges, but there is no `npm run uninstall-bridge`, no backup of a pre-existing file at the destination, and no integrity check of the source before an elevated copy.
- Blocks: Clean removal when a user stops using the tool; safe reinstall over a hand-edited panel.

**No session/auth model for the command channel:**
- Problem: Any local process can write `ae_command.json` and have AE execute a command under the user's identity. There is no nonce, no signing, no filesystem permission restriction on the bridge directory.
- Blocks: Any use of this server on a shared or multi-user machine.

## Test Coverage Gaps

**Everything — there is no test infrastructure at all:**
- What's not tested: The command/result round trip, the JSON polyfill, every `src/scripts/*.jsx` operation, the Zod schemas, `install-bridge.js` path resolution.
- Files: `package.json` has no `test` script; no `tests/`, no `*.test.*`, no `*.spec.*` anywhere in the repository.
- Risk: The two classes of bug that dominate this codebase — a wrong AE property name (`layer.Effects`) and a wrong comp-index semantic — are exactly what a single smoke test against a real AE instance would catch, and nothing else will. The JSON polyfill has no coverage at all despite being the wire format.
- Priority: High

**Server-side queueing/polling logic (testable without AE):**
- What's not tested: `waitForBridgeResult` timeout and staleness behavior, `writeCommandFile`/`clearResultsFile` failure handling, allowlist/dispatch-name agreement. All of this is plain filesystem code and can be tested by writing fixture files to a temp dir — no AE required.
- Files: `src/index.ts:26`–`:139`, `:163`–`:231`
- Risk: The timeout-returns-success bug and the length-based freshness check have survived precisely because nothing exercises them.
- Priority: High

**Install script:**
- What's not tested: Platform branch selection, destination directory creation, error escalation.
- Files: `install-bridge.js`
- Risk: Runs with elevated privileges and is the only thing standing between the user and a broken AE install.
- Priority: Medium

---

*Concerns audit: 2026-10-30*
