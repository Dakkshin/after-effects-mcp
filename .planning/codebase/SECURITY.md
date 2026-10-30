# Security Audit — after-effects-mcp

**Last Audit:** 2026-10-30 13:38 UTC
**Target:** `d:\ApplicationDevelopment\Tools\after-effects-mcp`
**Sensitivity:** Internal
**Deployment:** Not yet deployed
**Scope:** Full codebase (first-party code, dependencies, supply chain, CI/CD & infrastructure)
**Methodology:** OWASP-aligned manual review + live OSV.dev advisory correlation

---

## Executive Summary

`after-effects-mcp` is a small, local-only MCP server that drives Adobe After Effects through a file-based IPC bridge (`~/Documents/ae-mcp-bridge/ae_command.json` polled by an ExtendScript panel). It has no network listener, no outbound calls, no telemetry, no credential handling, and no CI/CD or infrastructure surface. The dependency tree is small and entirely permissive-licensed.

**Verdict: LOW overall risk, with two conditions.**

The architecture is fundamentally sound: the ExtendScript `executeCommand()` dispatcher is a strict 20-name `switch` that never evaluates `args`, so the classic "ExtendScript command injection via string interpolation" failure mode is **absent** (verified, see Scope & Methodology). The dominant residual risk is not a memory-safety bug but an **unauthenticated local trust boundary**: any process able to write one JSON file in the current user's Documents folder can drive After Effects through the same 20-command whitelist, including `setLayerExpression` (arbitrary JS execution inside AE) and `applyEffect` (arbitrary preset path).

Dependency advisories are real and current (11 affected packages), but the six MCP SDK advisories are **HTTP/OAuth-transport-only and therefore unreachable in a stdio-only server**; the transitive HTTP stack (hono, express, qs, body-parser, ip-address, proxy-addr, fast-uri, brace-expansion) is present in the lockfile but never loaded at runtime. Only `zod` is on an executing path.

| Metric | Result |
|--------|--------|
| First-party findings | 11 (0 Critical, 0 High, 4 Moderate, 7 Low/Informational) |
| Dependency advisories (installed versions) | 11 packages affected |
| Reachable dependency advisories | 1 partial (`zod`, tool-argument validation) |
| Known public exploits against reachable code | None published |
| Outbound network calls in first-party code | 0 |
| Credential / secret access in first-party code | 0 |
| CI/CD pipelines, IaC, containers | None present |
| Non-permissive licenses | None |

---

## Scope & Methodology

**Reviewed in full**

| File | Size | Result |
|------|------|--------|
| `src/index.ts` | 32,417 B | MCP server: 20 allowlisted commands, file IPC, polling, `test-animation` codegen |
| `install-bridge.js` | 4,826 B | Privileged bridge installer (macOS `sudo`, Windows `RunAs`) |
| `src/scripts/mcp-bridge-auto.jsx` | 77,066 B | ExtendScript bridge: polling loop, `executeCommand` dispatcher, layer/effect/expression ops |
| `package.json` / `package-lock.json` | — | 162 lockfile entries, 3 runtime deps, 4 dev deps |

**Reviewed by symbol/region** — the 10 legacy `src/scripts/*.jsx` files (`applyEffect`, `createComposition`, `createTextLayer`, …). These are inlined duplicates of bridge functions and are **unreachable through the MCP bridge** (the bridge is self-contained; all `#include` directives are commented out at lines 8–14). They represent no additional runtime attack surface; they are a maintenance/duplication concern only.

**Confirmed absent:** `.github/` and any CI config, `Dockerfile`/`docker-compose`, IaC (Terraform/ARM/Bicep), `.env` files, test suite.

### Explicitly tested and DISPROVED — command injection

The starting hypothesis for this audit was "command injection via string interpolation into ExtendScript." It does not hold, and this is a load-bearing negative result:

- `src/scripts/mcp-bridge-auto.jsx:1498` — `executeCommand(command, args)` is a `switch` over exactly 20 literal command names with `default: { error: "Unknown command: " + command }`. No branch builds or evaluates ExtendScript source from `args`.
- The only `eval` call sites are JSON parsing fallbacks: `:1244` (`return eval("(" + text + ")")`, guarded by `typeof JSON.parse !== "function"`) and `:1731` (`eval("(" + content + ")")`, taken only when `JSON.parse` throws).
- `src/index.ts:196` — the MCP layer rejects any `script` name not in a hardcoded `allowedScripts` array before anything is written.

**Therefore `args` reaching the bridge are consumed as data values (`args.x || default`), not as code.** The residual risk moves to *which* operations are reachable (authorization), not *how* they execute (injection).

### Audit tooling limitation (disclosed, not worked around)

`npm audit` **cannot produce data in this environment**. The configured registry is `https://registry.npmmirror.com`, whose advisory endpoint returns `404 [NOT_IMPLEMENTED]` for `/-/npm/v1/security/advisories/bulk`, yielding a non-JSON error envelope (`npm warn au...`). Rather than report "0 vulnerabilities" from an unavailable source (a false negative), the lockfile was enumerated and every installed version was queried directly against **OSV.dev** (`/v1/query`, `/v1/vulns/{id}`) on 2026-10-30. **Every advisory in the matrix below is live OSV data, not recall.**

---

## Dependency Security Matrix

> ⚠️ **Data source:** OSV.dev queried 2026-10-30. `npm audit` is unavailable (npmmirror registry has no advisory endpoint — see above). "Reachable" reflects whether the vulnerable code is loaded by this server at runtime, not merely installed.

### Direct dependencies

| Package | Version | Ecosystem | Known CVEs / Advisories | Severity | Public Exploit | Reachable | Status | Remediation |
|---------|---------|-----------|--------------------------|----------|----------------|-----------|--------|-------------|
| `@modelcontextprotocol/sdk` | 1.28.0 | npm | GHSA-f897-62hf-6gxq (CVE-body/JSON-RPC batch length unbounded on HTTP transports/handlers); GHSA-22jm-h49p-29qw (CVE-2026-111767, experimental tasks not bound to creating session); GHSA-46jr-4wx8-v453 (CVE-2026-111768, single request within limit exhausts memory during validation); GHSA-rvq5-wwqv-78pq (CVE-2026-111771, bearer auth accepted tokens for another service); GHSA-6prh-2h8m-c8cw (CVE-2026-111769, client HTTP/OAuth followed cross-origin redirect re-sending headers/body); GHSA-6qxp-vccf-f47h (CVE-2026-104850, OAuth client sent credentials to server-chosen auth server) | 4 High, 2 Moderate | None published | **No** — all six are HTTP/OAuth-transport only; this server uses `StdioServerTransport` exclusively (no listener, no OAuth, no bearer auth, no sessions) | Open (accepted risk, documented) | Upgrade to `>= 1.32.0` (highest fixed across the six) |
| `zod` | 3.24.2 (declared `^3.22.2`) | npm | GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404, memory exhaustion validating oversized constrained collections) | High | None published | **Partially** — every tool argument passes through zod validation, so a hostile/oversized tool payload is in scope | Open | Upgrade to `zod >= 4.6.6` (major bump; re-run build + tool smoke test) |
| `node-fetch` | 3.3.2 | npm | None | — | — | No | Unused — declared but never imported by `src/` | Remove from `dependencies` |
| `esbuild` (dev) | 0.27.4 | npm | GHSA-g7r4-m6w7-qqqr (arbitrary file read when running the dev server) | Low | None published | **No** — build-only; `esbuild serve` is never used | Open | `>= 0.28.1` on next dev-dep refresh |
| `typescript` (dev) | 5.8.3 | npm | None | — | — | — | OK | — |
| `@types/node` (dev) | 20.17.30 | npm | None | — | — | — | OK | — |
| `copyfiles` (dev) | 2.4.1 | npm | None direct (pulls `brace-expansion`, see below) | — | — | Build-time only | OK | Follows transitive fix |

### Transitive dependencies (installed, not loaded at runtime)

Pulled in by the SDK's optional HTTP/express stack and by `copyfiles`. **None are imported by `src/index.ts` or by the bridge**, so they are installed-but-dead weight for a stdio-only server.

| Package | Version | Ecosystem | Advisories | Severity | Public Exploit | Reachable | Status | Remediation |
|---------|---------|-----------|-----------|----------|----------------|-----------|--------|-------------|
| `hono` | 4.12.9 | npm | 32 | High | None published | No (HTTP transport unused) | Open | `>= 4.13.11` (or SDK upgrade) |
| `@hono/node-server` | 1.19.11 | npm | 3 | Moderate | None published | No | Open | Via SDK upgrade |
| `body-parser` | 2.2.2 | npm | 2 (GHSA-27r3-jxmh-p828, GHSA-v422-hmwv-36x6) | High | None published | No (no express app instantiated) | Open | `>= 2.4.0` |
| `qs` | 6.15.0 | npm | 4 (incl. GHSA-4mjr-xmp4-gh2g, GHSA-x5fp-wj9c-mxmx) | Moderate | None published | No | Open | `>= 6.16.1` |
| `ip-address` | 10.1.0 | npm | 6 | High | None published | No | Open | `>= 10.7.4` |
| `proxy-addr` | 2.0.7 | npm | 1 (GHSA-jqcg-44mw-7w3h) | Critical (as rated) | None published | No (express `trust proxy` never configured) | Open | `>= 2.0.8` |
| `fast-uri` | 3.1.0 | npm | 12 | High | None published | No (ajv/URI validation on unused HTTP path) | Open | `>= 4.2.3` |
| `brace-expansion` | 1.1.13 | npm | 6 | High | None published | Build-time only (`copyfiles` → `glob`) | Open | `>= 5.0.12` (dev chain) |

**License review:** 136 locked packages enumerated — MIT, ISC, BSD-2/3-Clause, Apache-2.0 only. No copyleft, no non-permissive, no unknown licenses.

**Severity calibration note:** the `proxy-addr` rating is Critical *in an express deployment that trusts proxy headers*. This project never instantiates express and never sets `trust proxy`, so the practical exposure is nil. It is listed at its published rating for honesty, not because it is exploitable here.

---

## Findings Summary Table

| ID | Title | Severity | Confidence | Category | Status |
|----|-------|----------|-----------|----------|--------|
| SEC-001 | Unauthenticated local file-IPC trust boundary drives After Effects | Moderate | High | Authorization / Trust Boundary | Open |
| SEC-002 | `setLayerExpression` executes arbitrary JS inside After Effects | Moderate | High | Code Execution (by design) | Open |
| SEC-003 | `applyEffect` accepts an arbitrary `presetPath` | Low–Moderate | High | Path Handling | Open |
| SEC-004 | Bridge performs no schema validation on `parameters` | Low–Moderate | High | Input Validation | Open |
| SEC-005 | Bridge-controlled strings surfaced verbatim into LLM context | Low–Moderate | High | Prompt Injection | Open |
| SEC-006 | `eval()` used as JSON.parse fallback on file content | Low | High | Unsafe Eval | Open |
| SEC-007 | Predictable temp filenames, no exclusive create, no cleanup | Low | Medium | Temp File Handling | Open |
| SEC-008 | Bridge installer runs privileged commands and widens AE script permissions | Low | High | Privilege / Configuration | Accepted (by design) |
| SEC-009 | `postinstall` executes a build at install time | Informational | High | Supply Chain | Accepted |
| SEC-010 | 11 packages with published advisories; `zod` reachable | Informational→Moderate | High | Dependency Risk | Open |
| SEC-011 | Dead/mismatched code: unused `execSync`, unused `node-fetch`, unimplemented allowlisted command | Informational | High | Correctness | Open |

---

## Detailed Findings

### SEC-001 — Unauthenticated local file-IPC trust boundary

- **Severity:** Moderate  •  **Confidence:** High  •  **Category:** Authorization / Trust Boundary
- **Affected Components:** `src/scripts/mcp-bridge-auto.jsx`, `src/index.ts`
- **Evidence:**
  - `src/scripts/mcp-bridge-auto.jsx:1327` — command path is a fixed location: `bridgeFolder.fsName + "/ae_command.json"` (folder resolved by `getCommandFilePath()` at `:1321`; results path by `getResultFilePath()` at `:1331`).
  - `src/scripts/mcp-bridge-auto.jsx:1710–1745` — `checkForCommands()` reads the file, parses it, and executes **any** payload whose `status === "pending"`; `:1752` runs it on an `app.scheduleTask(..., checkInterval, true)` timer.
  - `src/index.ts:173–201` — the only gate is an `allowedScripts` name whitelist applied by the *writer*, not by the reader.
- **Abuse Path:** Any process running as the same user (or any code the user runs, including a malicious npm package with a `postinstall` script, or a compromised browser download helper) writes `ae_command.json` with `status: "pending"` and a whitelisted command. After Effects executes it with the user's full privileges: create/delete layers and comps, apply presets, set expressions, overwrite render outputs. No authentication, no signature, no nonce, no origin check, no size/rate limit, no audit log.
- **Regulations:** ISO 27001 A.8.2 (privileged access), A.12.1.4 (separation of environments), NIST SSDF PW.4.4.
- **Recommended Fix:** Add a per-session shared secret written by the MCP server into the bridge folder (mode-restricted) and required in the command envelope; reject payloads whose token does not match or whose `createdAt` is older than N seconds (replay window). Include a monotonically increasing sequence number to reject replays. Keep the existing whitelist — it is the reason this finding is Moderate and not Critical.
- **Gate Status:** Deferred (subagent mode: `gsd-challenge` → `gsd-consensus` not executable in this context). Open question for the gate: *is a shared secret meaningful when the attacker shares the user account, or should the fix instead be "document that AE scripting is same-user trust only and add an audit log"?*

### SEC-002 — `setLayerExpression` executes arbitrary JavaScript inside After Effects

- **Severity:** Moderate  •  **Confidence:** High  •  **Category:** Code Execution (by design)
- **Affected Components:** `src/scripts/mcp-bridge-auto.jsx:808–870`
- **Evidence:** `src/scripts/mcp-bridge-auto.jsx:861` — `property.expression = expressionString;` where `expressionString` arrives from the caller unvalidated.
- **Abuse Path:** AE expressions are JavaScript evaluated inside After Effects. A hostile expression can read project structure, write files via AE's `File`/`Folder` APIs, and (with "Allow Scripts to Write Files and Access Network" enabled as `install-bridge.js` instructs) perform network requests. Combined with SEC-001, this is the *impact amplifier*: file-IPC access alone is whitelisted, but one whitelisted command is effectively arbitrary code.
- **Regulations:** NIST SSDF PW.5.1, OWASP ASVS 5.3.
- **Recommended Fix:** Document `setLayerExpression` as an intentional code-execution primitive in `README.md` so operators do not treat the tool as sandboxed; optionally add a static denylist for `File`, `Folder`, `$.evalFile`, `eval`, `app.executeCommand` inside expression strings and reject matches.
- **Gate Status:** Deferred. Open question: *does a denylist add real security, or only theater (expression JS can obfuscate trivially)? A warning at tool-call time may be the honest control.*

### SEC-003 — `applyEffect` accepts an arbitrary preset path

- **Severity:** Low–Moderate  •  **Confidence:** High  •  **Category:** Path Handling
- **Affected Components:** `src/scripts/mcp-bridge-auto.jsx:872–920`
- **Evidence:** `src/scripts/mcp-bridge-auto.jsx:908` — `var presetFile = new File(presetPath); layer.applyPreset(presetFile);` with no existence check, no extension check, and no directory confinement.
- **Abuse Path:** A caller supplies any absolute or UNC path (`\\attacker\share\x.ffx`). AE reads and applies it, which both confirms/denies file existence (oracle) and, on a network path, can make AE block on a slow/unreachable SMB share (availability). Malformed presets abort the operation and leave partial state.
- **Recommended Fix:** Validate in the bridge: file must exist, must have a `.ffx` extension, and must resolve inside an operator-configured preset root; otherwise return `{ error }`. Cheap, and the fix belongs in the bridge (single choke point) rather than the MCP layer.
- **Gate Status:** Deferred.

### SEC-004 — No schema validation of `parameters` at the bridge

- **Severity:** Low–Moderate  •  **Confidence:** High  •  **Category:** Input Validation
- **Affected Components:** `src/index.ts:169`, `src/scripts/mcp-bridge-auto.jsx` (`executeCommand` branches)
- **Evidence:** `src/index.ts:169` — `parameters: z.record(z.string(), z.unknown())` accepts an arbitrary key/value map; every bridge branch then reads `args.x || default` with no type or range check, no unknown-key rejection.
- **Abuse Path:** Wrong-typed values (string where a number is expected, e.g. a huge `compIndex` or a negative duration) produce unhandled ExtendScript errors, partial AE state, or AE modal dialogs. AE errors mid-operation are not transactional.
- **Recommended Fix:** Replace the loose record with a per-command discriminated zod schema (`z.discriminatedUnion('script', [...])`) so each command's parameters are typed, bounded and unknown-key-strict. This is the single highest-value defensive change on the MCP side, and it also removes most of SEC-010's `zod` exposure benefit narrative.
- **Gate Status:** Deferred.

### SEC-005 — Bridge output surfaced verbatim into LLM context

- **Severity:** Low–Moderate  •  **Confidence:** High  •  **Category:** Prompt Injection
- **Affected Components:** `src/index.ts` (`get-results` / `readResultsFromTempFile`)
- **Evidence:** `src/index.ts:241` allowlists `get-results`; the handler returns the bridge result file's raw text into the tool result, which lands in the model's context. Content includes AE project names, layer names, and error strings.
- **Abuse Path:** A crafted layer/comp name in a downloaded `.aep` (e.g. an instruction-shaped string) is echoed into the model's context and can influence subsequent tool calls. Same class as any tool that returns third-party text; here the text originates from an ingested project file.
- **Recommended Fix:** Wrap returned bridge text in an explicit untrusted-data envelope in the MCP response (e.g. prefix/suffix markers plus a one-line note that content is project-supplied data and must not be treated as instructions). Document in the tool description.
- **Gate Status:** Deferred.

### SEC-006 — `eval()` used as a JSON.parse fallback

- **Severity:** Low  •  **Confidence:** High  •  **Category:** Unsafe Eval
- **Affected Components:** `src/scripts/mcp-bridge-auto.jsx:1244`, `:1731`
- **Evidence:** `:1244` — `return eval("(" + text + ")")` (polyfill, guarded by `typeof JSON.parse !== "function"`). `:1731` — `: eval("(" + content + ")")` as the fallback branch when `JSON.parse(content)` throws.
- **Abuse Path:** Both eval sites consume the contents of an attacker-writable file (SEC-001). The `:1731` fallback is the realistic one: send **malformed** JSON and the bridge evaluates it as ExtendScript instead. Exploitation requires an old/limited ExtendScript JSON implementation or a parse failure, which is why this is Low and not High — but it converts "data file write" into "arbitrary code write" on affected hosts.
- **Recommended Fix:** Delete both `eval` paths. AE 2021–2026 (the versions `install-bridge.js` supports) all ship a native `JSON.parse`; a malformed payload should return `{ error: "Invalid JSON" }` and be discarded, not evaluated.
- **Gate Status:** Deferred.

### SEC-007 — Predictable temp filenames, no exclusive create, no cleanup

- **Severity:** Low  •  **Confidence:** Medium  •  **Category:** Temp File Handling
- **Affected Components:** `src/index.ts:524–600`
- **Evidence:** `src/index.ts:537` — `path.join(TEMP, \`ae_test_${timestamp}.jsx\`)`; `:555`/`:563`/`:584`/`:592` — fixed `ae_test_result.txt` and `ae_test_error.txt` in the shared temp dir, path-escaped for ExtendScript but with no `flags: 'wx'`, no `mode`, and no deletion afterwards. The generated script also calls `alert()` (`:560` region), which blocks the AE UI.
- **Abuse Path:** A local attacker pre-creates `ae_test_result.txt` as a symlink/hardlink to another user-writable file, or races the write; the timestamp-based `.jsx` name is guessable. Impact requires local code execution as the same user — which is already SEC-001 — so this is a hardening issue, not a new boundary.
- **Recommended Fix:** Use `fs.mkdtempSync` for a per-invocation directory, write with `{ flag: 'wx' }`, remove the directory in a `finally` block, and drop the `alert()` call (report through the result file instead).
- **Gate Status:** Deferred.

### SEC-008 — Bridge installer runs privileged commands and widens AE script permissions

- **Severity:** Low  •  **Confidence:** High  •  **Category:** Privilege / Configuration
- **Evidence:** `install-bridge.js` — macOS branch `execSync('sudo cp ...')`; Windows branch `execSync('powershell -Command "Start-Process PowerShell -Verb RunAs ... Copy-Item ..."')`. Both interpolate **fixed** paths derived from `__dirname` and hardcoded AE 2021–2026 locations — not user input. The script also instructs the operator to enable AE's *Allow Scripts to Write Files and Access Network*.
- **Assessment:** No injection: path components are constants, not attacker-controlled. The real note is operational — that AE preference is effectively "trust all scripts", which is what makes SEC-002 consequential, and `sudo`/`RunAs` prompts train operators to approve elevation without reading.
- **Recommended Fix:** Document the permission widening as an explicit, informed risk in `README.md` with the exact AE preference and how to disable it when the bridge is not in use. Do not elevate for a per-user ScriptUI panel if a user-scope path works.
- **Gate Status:** Accepted — by design, no code change recommended.

### SEC-009 — `postinstall` executes a build at install time

- **Severity:** Informational  •  **Confidence:** High  •  **Category:** Supply Chain
- **Evidence:** `package.json` — `"postinstall": "npm run build"` → `esbuild ... && copyfiles ...`.
- **Assessment:** Installing this package on a machine runs a bundler and a file copy. That is normal but non-obvious; it means `npm install` is not a passive operation. Combined with `npm ci --ignore-scripts` for review-only environments, this is acceptable.
- **Recommended Fix:** Keep, but document in `README.md` that `npm i` builds, and recommend `--ignore-scripts` for audit/CI environments.

### SEC-010 — Dependency advisories with one reachable package

- **Severity:** Informational (aggregate), Moderate for `zod`  •  **Confidence:** High  •  **Category:** Dependency Risk
- **Evidence:** See Dependency Security Matrix. Live OSV.dev data, 2026-10-30: 11 packages, 68 advisories total. `npm audit` unavailable (npmmirror).
- **Assessment:** The MCP SDK's six advisories are transport-specific (HTTP body limits, OAuth redirect/auth-server confusion, cross-service bearer tokens, session binding). This server never constructs an HTTP transport, never enables OAuth, and never validates bearer tokens — `StdioServerTransport` is the only transport used. Reporting them as exploitable would be dishonest. `zod` is the one advisory on an executing path (tool-argument validation), and it is a memory-exhaustion class that requires the caller to send a hostile oversized payload — for a locally-run editor-driven MCP server, the caller *is* the local agent.
- **Recommended Fix:** Upgrade `@modelcontextprotocol/sdk` to `>= 1.32.0` and `zod` to `>= 4.6.6` (major; verify build + one tool round-trip), then re-run the OSV sweep. Prune the unused `node-fetch`. Prefer regenerating the lockfile against a registry that supports advisories so `npm audit` works in future.
- **Gate Status:** Deferred.

### SEC-011 — Dead and mismatched code

- **Severity:** Informational  •  **Confidence:** High  •  **Category:** Correctness
- **Evidence:**
  - `src/index.ts:3` — `import { execSync } from "child_process"` never used (a process-execution capability imported for no reason; removing it shrinks the reviewed surface).
  - `node-fetch` declared as a runtime dependency but never imported anywhere in `src/`.
  - `src/index.ts:173` allowlists `"test-animation"` in `allowedScripts`, but the bridge's 20-case `switch` (`:1498`) has no such case → every call returns `{ error: "Unknown command" }`. A silent, permanent failure that looks like a bridge fault.
- **Recommended Fix:** Remove the unused import and the unused dependency; remove `"test-animation"` from the allowlist (or implement it in the bridge). Three-line cleanup.
- **Gate Status:** Accepted — cleanup, no security gate needed.

### SEC-012 — Fixed 1000 ms sleeps instead of result polling

- **Severity:** Informational  •  **Confidence:** Medium  •  **Category:** Reliability (security-adjacent)
- **Evidence:** Effect tools write the command, `await new Promise(r => setTimeout(r, 1000))`, then read the result file — a timing assumption, not a signal. The server does have a proper `waitForBridgeResult()` poller (`src/index.ts:102`) used by other paths.
- **Assessment:** Not a vulnerability. It is a correctness/robustness defect that can surface stale results (from a previous command) as if they were the current command's output, which is a trust problem in a tool whose output drives further actions.
- **Recommended Fix:** Route every command through the existing `waitForBridgeResult()` poller so results are correlated by command id, not by elapsed time.
- **Gate Status:** Deferred.

---

## Outbound Communication Matrix

| Destination | Purpose | Data Sent | Trigger | Verdict |
|-------------|---------|-----------|---------|---------|
| *(none)* | — | — | — | **No outbound network calls found in first-party code** |

Verified negative: `fetch`/`http`/`https`/`net`/`dns`/`XMLHttpRequest` are not used in `src/index.ts` or any `src/scripts/*.jsx`; `node-fetch` is declared but never imported; `child_process` is imported in `src/index.ts` but unused, and used in `install-bridge.js` only for local `sudo`/`RunAs` file copies with constant paths. All IPC is through two local JSON files plus stdout/stderr for MCP framing.

## Suspicious Behavior Matrix

| Pattern | Result | Evidence |
|---------|--------|----------|
| Credential / keychain / browser-profile access | **Not found** | No reads of `.ssh`, `.aws`, keychains, browser data, `~/.npmrc` |
| Environment-variable secret harvesting | **Not found** | `process.env` reads limited to `TEMP`/`TMP` (temp dir) |
| Obfuscation / packed payloads / encoded blobs | **Not found** | No base64/hex decode-then-execute; no minified first-party source |
| Dynamic code loading (`require`/`import` of remote or generated modules) | **Not found** | Static imports only; generated `.jsx` is a fixed template |
| Persistence beyond the AE panel (services, scheduled tasks, registry Run keys, cron) | **Not found** | `install-bridge.js` copies a panel file only |
| Telemetry / analytics / phone-home | **Not found** | No outbound calls (see above) |
| Process execution | **Local only, constant paths** | `install-bridge.js` `sudo cp` / `RunAs Copy-Item`; `src/index.ts:3` import unused |
| `eval` / `Function` / `setTimeout(string)` | **2 `eval` sites, JSON fallbacks only** | `mcp-bridge-auto.jsx:1244`, `:1731` (SEC-006) |
| Filesystem writes outside temp/bridge dirs | **Not found** | Writes confined to `~/Documents/ae-mcp-bridge/` and `TEMP` |
| Prompt-injection surface (untrusted text into model context) | **Found** | `get-results` returns bridge text verbatim (SEC-005) |

## Supply Chain Review

| Aspect | Finding |
|--------|---------|
| Dependency count | 3 runtime, 4 dev direct; 162 lockfile entries |
| Lockfile committed | Yes (`package-lock.json`) — reproducible installs |
| Registry | `https://registry.npmmirror.com` (mirror) — **no advisory endpoint**, so `npm audit` is inert |
| Integrity metadata | Standard `resolved`/`integrity` fields present in the lockfile |
| Install-time execution | `postinstall` → `npm run build` (esbuild + copyfiles) — SEC-009 |
| Unused declared dependency | `node-fetch@3.3.2` — SEC-011 |
| Licenses | MIT / ISC / BSD / Apache-2.0 only; no copyleft, no unknown |
| Typosquat / dependency-confusion indicators | None — all names are canonical, no internal-scope names in public registry |
| Vendored binaries / prebuilt blobs | None in repo |

## CI/CD & Infrastructure Review

**None present, so none misconfigured.**

- No `.github/workflows/`, no other CI configuration (GitLab/Azure/Jenkins) — no pipeline secrets to leak, and also **no automated dependency scanning** as compensating control.
- No `Dockerfile` / container config, no IaC (Terraform, ARM, Bicep, CloudFormation).
- No `.env`, no committed secrets, no deployment scripts.
- Distribution is a local npm project plus a manually installed AE ScriptUI panel; the trust boundary is the operator's workstation, not a server.

**Recommendation for when this is distributed:** add a minimal CI job that (1) runs `npm ci --ignore-scripts`, (2) runs an advisory scan against a registry that supports it (or an OSV scanner), and (3) fails on High. Ties to SEC-010.

---

## Remediation Roadmap

### Immediate (before any distribution)
1. **SEC-010** — Upgrade `@modelcontextprotocol/sdk` to `>= 1.32.0`; upgrade `zod` to `>= 4.6.6`; remove `node-fetch`. Re-run OSV sweep, rebuild, smoke-test one tool round-trip.
2. **SEC-006** — Delete both `eval` JSON fallbacks; return `{ error: "Invalid JSON" }` on parse failure.

### Near-Term (next change window)
3. **SEC-003** — Confine `presetPath` to a preset root with `.ffx` extension + existence check in the bridge.
4. **SEC-004** — Replace `z.record(z.string(), z.unknown())` with per-command discriminated schemas.
5. **SEC-005** — Envelope bridge output as untrusted data in tool responses.
6. **SEC-012** — Route effect tools through `waitForBridgeResult()` instead of 1000 ms sleeps.
7. **SEC-007** — `mkdtemp` + `wx` + `finally` cleanup; drop `alert()`.

### Medium-Term
8. **SEC-001** — Shared-secret + nonce + monotonic sequence in the bridge command envelope, with a short replay window; document the residual same-user trust.
9. **SEC-002** — Document `setLayerExpression` as an intentional code-execution primitive; consider (and honestly evaluate) a denylist.
10. **SEC-011** — Remove unused `execSync` import; reconcile the `"test-animation"` allowlist/bridge mismatch.

### Strategic
11. Add CI with advisory scanning (`npm ci --ignore-scripts` + OSV) and a `High` fail gate.
12. Point the project at a registry that serves advisories, or vendor an OSV scan script, so `npm audit` is never again a silent hole.
13. Consolidate the 10 legacy `src/scripts/*.jsx` files, which duplicate bridge logic and will drift from it.

---

## Final Audit Verdict

**Sensitivity: Internal. Deployment: not yet deployed. Overall risk: LOW, conditional.**

- **No Critical or High first-party vulnerabilities.** The most dangerous candidate — ExtendScript command injection through string interpolation — was tested and disproved: the bridge dispatcher is a strict whitelist switch that never evaluates `args`.
- **The real exposure is authorization, not injection:** an unauthenticated same-user file-IPC channel (SEC-001) that can drive AE, amplified by an intentional arbitrary-expression primitive (SEC-002).
- **Dependency risk is real but mostly unreachable:** 11 packages carry advisories; the MCP SDK's six are HTTP/OAuth-only and cannot be reached by a stdio-only server. Only `zod` is on an executing path.
- **No exfiltration, no phone-home, no credential access, no secrets, no CI/CD or infra to break.**

**Blocking conditions before external distribution:** SEC-010 upgrades and SEC-006 `eval` removal. Everything else is hardening that can follow.

**Audit integrity notes:** (1) `npm audit` could not be used — the configured npmmirror registry has no advisory endpoint — so all dependency data is live OSV.dev, dated 2026-10-30. (2) Phase 9B gates (`gsd-challenge` → `gsd-consensus`, sequential, never parallel) were **not executed** in this context; every proposed fix carries `Gate Status: Deferred` with its open question rather than an "Approved" label.

---

## Audit Execution Log

| # | Date | Time (UTC) | Auditor | Trigger | Findings | Critical/High |
|---|------|-----------|---------|---------|----------|---------------|
| 1 | 2026-10-30 | 13:38 | GSD Agent | `/gsd-map-codebase auto-spawn` | 12 | 0 |
