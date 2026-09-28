# Footage Commands — Interface Contract

Status: **BINDING** for Backend Developer (BE), QA Engineer (QA), Tech Lead (TL). Where this contract and the requirements file (`after-effects-mcp-requirements.md`) disagree, this contract wins (the four user decisions below are implemented exactly).

User decisions (binding):
1. Stills: if `sourceOutPoint` is omitted, display duration is a fixed **5 s**. Stills skip the "≤ source duration" check. `outPoint > comp.duration` is allowed, with a warning.
2. Time Remap: if the command turns remap ON, AE's two auto-created keyframes are removed. If remap was already on, caller keys are **merged** (a key at an existing time replaces it).
3. `importFootage` always imports (no de-duplication); result reports `alreadyInProject`.
4. The three new MCP tools **wait** for the bridge result (20 s import, 8 s others); on timeout they return a non-error "use `get-results`" message.

Both `src/index.ts` and `src/scripts/mcp-bridge-auto.jsx` use **CRLF** line endings — keep CRLF; tests reading these files must handle `\r\n`.

---

## 0. Deliverables

| # | Item | Owner |
|---|------|-------|
| 1 | Pure block (3 pure functions + 2 parse helpers + 2 constants) inside `mcp-bridge-auto.jsx` between markers | BE |
| 2 | ExtendScript commands `importFootage`, `addFootageLayer`, `setLayerTimeRemap` + private AE helpers + 3 `case` branches | BE |
| 3 | 3 MCP tools in `src/index.ts`, helper `queueCommandAndWait`, 3 names in `allowedScripts` | BE |
| 4 | `package.json` scripts `test` / `pretest` | BE |
| 5 | `test/**` (pure-function tables, static checks, MCP integration test with a fake bridge) | QA |
| 6 | README, `get-help` text, one-line pointer in `mcp_aftereffects_get_effects_help` | TL |

---

## 1. Pure block — markers and placement

### 1.1 Exact marker lines
Each appears **exactly once**, on its own line, no leading whitespace (trailing `\r` allowed):
```
// PURE-BLOCK-BEGIN footage-timing
// PURE-BLOCK-END footage-timing
```

### 1.2 Placement
In `mcp-bridge-auto.jsx`, after the closing `}` of `bridgeTestEffects` (~line 1235) and before `// JSON polyfill for ExtendScript (when JSON is undefined)` (~line 1237). Order: pure block → (outside markers) private AE helpers `_mcp*` → `importFootage`, `addFootageLayer`, `setLayerTimeRemap`.

### 1.3 Rules for the text between markers (QA enforces)
- Top level contains only:
  `var FOOTAGE_TIMING_EPSILON = 0.001;` · `var STILL_DEFAULT_DURATION = 5;` · `function parseNumericInput(value)` · `function parsePositiveIntInput(value)` · `function computeFootagePlacement(opts)` · `function validateTimeRemapKeyframes(keyframes, sourceDuration)` · `function planTimeRemapKeyframes(existingKeyTimes, keyframes, remapWasEnabled)` · optional extra helpers named `_pf*` declared with `function`.
- **ES3 only.** Forbidden: `let`, `const`, `=>`, template literals, trailing commas in literals, getters/setters, `Array.isArray`, `Array.prototype.forEach/map/filter/reduce/some/every/indexOf`, `String.prototype.trim`, `Number.isFinite`, `Number.isNaN`, `Object.keys`, `Object.create`, `Date.now`, `JSON`.
- **No AE globals**: no `app`, `$`, `File`, `Folder`, `CompItem`, `FootageItem`, `logToPanel`, or anything defined outside the block.
- **Cross-realm array detection**: `Object.prototype.toString.call(x) === "[object Array]"` — never `instanceof Array` (QA passes Node-realm arrays into a `vm` context).
- Allowed built-ins: `Math.*`, `isFinite`, `isNaN`, `parseFloat`, `Number()`, `String()`, `RegExp`, `Array.prototype.push/sort/slice/join`, `Object.prototype.toString/hasOwnProperty`.
- **Never throw** — always return a result object.
- **No `undefined`-valued properties** in outputs; use `null`. (QA compares after a `JSON.parse(JSON.stringify(x))` round-trip.)
- **Never mutate inputs**; return new objects/arrays.

---

## 2. Parse helpers (pure)

### `parseNumericInput(value)`
| Input | Result |
|---|---|
| `undefined` / `null` | `{ ok: false, reason: "missing" }` |
| `typeof value === "number"` and `isFinite(value)` | `{ ok: true, value: value }` |
| number that is NaN/±Infinity | `{ ok: false, reason: "invalid" }` |
| string matching `/^\s*[+-]?(\d+(\.\d*)?\|\.\d+)([eE][+-]?\d+)?\s*$/` whose `parseFloat` is finite | `{ ok: true, value: parseFloat(value) }` |
| numeric string that overflows to ±Infinity (e.g. `"1e999"`) | `{ ok: false, reason: "invalid" }` |
| any other string (`""`, `"abc"`, `"1.5s"`, `"0x10"`, `"Infinity"`) | `{ ok: false, reason: "invalid" }` |
| boolean, object, array, function | `{ ok: false, reason: "invalid" }` |

Decision: numeric strings **are** accepted (whole-string only), because `run-script` bypasses zod.

### `parsePositiveIntInput(value)`
Accepts a number `n` with `isFinite(n) && n >= 1 && Math.floor(n) === n`, or a string matching `/^\s*\d+\s*$/` whose value is ≥ 1 → `{ ok: true, value: <number> }`. `undefined`/`null` → `{ ok: false, reason: "missing" }`. Everything else (incl. `0`, `1.5`, `"-1"`, `"1.0"`) → `{ ok: false, reason: "invalid" }`.

---

## 3. `computeFootagePlacement(opts)`

### 3.1 Input (`opts` must be a non-null, non-array object)
| Field | Required | Type | Default | Constraint |
|---|---|---|---|---|
| `compStartTime` | yes | numeric | — | any finite (may be negative) |
| `sourceDuration` | yes if `!isStill`; **ignored entirely** if `isStill` | numeric | — | `>= 0` |
| `sourceInPoint` | no | numeric | `0` | `>= 0` |
| `sourceOutPoint` | no | numeric | non-still: `sourceDuration`; still: `sourceInPoint + STILL_DEFAULT_DURATION` (5) | `>= 0` |
| `isStill` | no | boolean | `false` (also when `null`) | must be boolean if present |
| `frameDuration` | no | numeric | none (no rounding) | `> 0` |
| `compDuration` | no | numeric | none (no warning check) | `> 0` |

"numeric" = parsed with `parseNumericInput`; `undefined` and `null` both mean "omitted".

### 3.2 Constants
`EPS = FOOTAGE_TIMING_EPSILON = 0.001` s (fixed 1 ms, not frame-based: source and comp fps may differ). `STILL_DEFAULT_DURATION = 5`.

### 3.3 Algorithm (first failure returns)
1. `opts` not a non-null non-array object → `INVALID_INPUT`, `field: null`.
2. `isStill` present (not undefined/null) and not boolean → `INVALID_INPUT`, `field: "isStill"`.
3. `compStartTime`: missing → `MISSING_VALUE`; invalid → `INVALID_NUMBER`.
4. `sourceDuration` (only if `!isStill`): missing → `MISSING_VALUE`; invalid → `INVALID_NUMBER`; `< 0` → `NEGATIVE_VALUE`.
5. `sourceInPoint`: missing → 0; invalid → `INVALID_NUMBER`; `< 0` → `NEGATIVE_VALUE`.
6. `sourceOutPoint`: missing → default (3.1); invalid → `INVALID_NUMBER`; `< 0` → `NEGATIVE_VALUE`.
7. `frameDuration`: invalid → `INVALID_NUMBER`; `<= 0` → `NON_POSITIVE_VALUE`.
8. `compDuration`: invalid → `INVALID_NUMBER`; `<= 0` → `NON_POSITIVE_VALUE`.
9. Only if `!isStill`: if `sOut > D + EPS` → `OUT_EXCEEDS_DURATION` (field `sourceOutPoint`); else if `sOut > D` → `sOut = D` (silent clamp). Stills skip this step.
10. If `sOut <= sIn` → `IN_NOT_BEFORE_OUT` (field `sourceOutPoint`). Exact comparison, before rounding.
11. Timing. Validation (9–10) uses raw values; rounding affects only comp-time outputs.
    - Without `frameDuration`:
      ```
      inPoint = cst;  duration = sOut - sIn;  outPoint = cst + duration
      startTime = cst - sIn;  sourceOutPoint = sOut
      ```
    - With `frameDuration` (`fd`), JS `Math.round` (so −1.5 → −1):
      ```
      inFrame  = Math.round(cst / fd);         inPoint = inFrame * fd
      frames   = Math.round((sOut - sIn) / fd)
      if (!isStill && sIn + frames*fd > D + EPS) frames = frames - 1   // at most once
      if (frames < 1) -> error RANGE_TOO_SHORT, field "sourceOutPoint"
      duration = frames * fd;  outPoint = inPoint + duration
      startTime = inPoint - sIn;  sourceOutPoint = sIn + duration
      ```
12. Warnings, appended in this order: `IN_BEFORE_COMP_START` if `inPoint < -EPS`; `OUT_BEYOND_COMP_END` if `compDuration` given and `outPoint > compDuration + EPS`. Both are allowed (not errors).

### 3.4 Output
```js
// success
{ ok: true,
  startTime, inPoint, outPoint, duration,        // numbers
  sourceInPoint,    // effective sIn (never changed by rounding)
  sourceOutPoint,   // effective source time at outPoint (after clamp/rounding)
  isStill: <boolean>, frameRounded: <boolean>,   // frameRounded === (frameDuration given)
  warnings: [ { code, message } ] }              // [] when none
// failure
{ ok: false, error: { code, field: <string|null>, message } }
```

### 3.5 Error codes
| Code | `field` | Message guidance (QA does not assert wording) |
|---|---|---|
| `INVALID_INPUT` | `null` or `"isStill"` | `options must be an object` / `isStill must be a boolean` |
| `MISSING_VALUE` | field name | `<field> is required` |
| `INVALID_NUMBER` | field name | `<field> must be a finite number (got: <String(v)>)` |
| `NEGATIVE_VALUE` | field name | `<field> must be >= 0 (got: <v>)` |
| `NON_POSITIVE_VALUE` | `frameDuration` / `compDuration` | `<field> must be > 0 (got: <v>)` |
| `OUT_EXCEEDS_DURATION` | `sourceOutPoint` | `sourceOutPoint (<x> s) exceeds the source duration (<D> s)` |
| `IN_NOT_BEFORE_OUT` | `sourceOutPoint` | `sourceInPoint (<a> s) must be less than sourceOutPoint (<b> s)` |
| `RANGE_TOO_SHORT` | `sourceOutPoint` | `Trimmed range is shorter than one comp frame (<fd> s)` |

Warning codes: `IN_BEFORE_COMP_START`, `OUT_BEYOND_COMP_END`.

---

## 4. `validateTimeRemapKeyframes(keyframes, sourceDuration)`

### 4.1 Rules (first failure returns; `EPS = 0.001`)
1. `keyframes` not an array (cross-realm test) → `INVALID_INPUT`, field `"keyframes"`.
2. `keyframes.length === 0` → `EMPTY_KEYFRAMES`, field `"keyframes"`.
3. `sourceDuration` via `parseNumericInput`: missing/invalid/`<= 0` → `INVALID_SOURCE_DURATION`, field `"sourceDuration"`.
4. For each element `i` in input order:
   - not a non-null non-array object → `INVALID_KEYFRAME` (index `i`, field `null`);
   - `timeInSeconds`: missing → `MISSING_VALUE`; invalid → `INVALID_NUMBER`. **Negative times allowed.**
   - `sourceTimeInSeconds`: missing → `MISSING_VALUE`; invalid → `INVALID_NUMBER`;
   - `s < -EPS || s > D + EPS` → `SOURCE_TIME_OUT_OF_RANGE` (field `"sourceTimeInSeconds"`, index `i`); else clamp `s` to `[0, D]`.
5. Duplicates (only after all per-element checks pass): for `i = 1..n-1`, `j = 0..i-1`, if `Math.abs(t_i - t_j) < EPS` → `DUPLICATE_TIME` (field `"timeInSeconds"`, index `i`).
6. Sort ascending by `timeInSeconds`.

### 4.2 Output
Output keyframes contain exactly two numeric keys; extra input properties dropped; input not mutated.
```js
{ ok: true, keyframes: [ { timeInSeconds, sourceTimeInSeconds } ] }
{ ok: false, error: { code, index: <number|null>, field: <string|null>, message } }
```
`index` = 0-based position in the **input** array, or `null` for non-element errors.
Codes: `INVALID_INPUT`, `EMPTY_KEYFRAMES`, `INVALID_SOURCE_DURATION`, `INVALID_KEYFRAME`, `MISSING_VALUE`, `INVALID_NUMBER`, `SOURCE_TIME_OUT_OF_RANGE`, `DUPLICATE_TIME`.

---

## 5. `planTimeRemapKeyframes(existingKeyTimes, keyframes, remapWasEnabled)`

Implements user decision 2 as testable pure logic.

- `existingKeyTimes`: array of numbers — key times on the Time Remap property read **after** enabling (so, when this command enabled remap, these are AE's auto keys).
- `keyframes`: the `.keyframes` output of `validateTimeRemapKeyframes` (valid, sorted).
- `remapWasEnabled`: boolean — state **before** the command.

Invalid input: `existingKeyTimes` or `keyframes` not an array → `INVALID_INPUT` with that field name; a non-finite entry in `existingKeyTimes` or a malformed keyframe object → `INVALID_INPUT` with that field name (defensive; unreachable when fed by §4); `remapWasEnabled` not boolean → `INVALID_INPUT`, field `"remapWasEnabled"`. Error shape as §4 (`index: null`).

Algorithm:
1. For each key `k` (in order), find the **unclaimed** existing time `e` minimising `|e - k.t|` with `|e - k.t| < EPS` (ties → earliest position in `existingKeyTimes`). If found: claim it, `time = e`, `replacedCount++`. Else `time = k.t`, `addedCount++`.
2. `times[i]` = chosen time, `values[i] = k.sourceTimeInSeconds` (order follows `keyframes`).
3. `removeTimes` = if `remapWasEnabled === false`: all **unclaimed** existing times (in `existingKeyTimes` order); else `[]` (merge).

Output: `{ ok: true, times, values, removeTimes, replacedCount, addedCount }`.

---

## 6. Worked examples (QA builds tables from these)

Numeric comparison: absolute tolerance `1e-9`. `fd24 = 1001/24000`, `fd30 = 1001/30000`.
Abbreviations: `cst` compStartTime, `sIn`, `sOut`, `D` sourceDuration. Output = `start / in / out / dur / sOut_eff`. Unless noted: `warnings = []`, `isStill = false`, `frameRounded = false`, `sourceInPoint` = effective `sIn`.

### 6.1 `computeFootagePlacement`
| # | Input | Expected |
|---|---|---|
| P1 | `{cst:0, D:10}` | ok 0 / 0 / 10 / 10 / 10 |
| P2 | `{cst:5, sIn:2, sOut:6, D:10}` | ok 3 / 5 / 9 / 4 / 6 |
| P3 | `{cst:1, sIn:4, sOut:7, D:10}` negative startTime | ok −3 / 1 / 4 / 3 / 7 |
| P4 | `{cst:-2, sIn:0, sOut:3, D:10}` | ok −2 / −2 / 1 / 3 / 3, warnings `[IN_BEFORE_COMP_START]` |
| P5 | `{cst:0, sIn:8, sOut:10, D:10}` out == duration | ok −8 / 0 / 2 / 2 / 10 |
| P6 | `{cst:0, sOut:10.0005, D:10}` within EPS | ok 0 / 0 / 10 / 10 / 10 (clamped) |
| P7 | `{cst:0, sOut:10.001, D:10}` exact boundary (`10+0.001===10.001` in JS) | ok, clamped: out 10, sOut_eff 10 |
| P8 | `{cst:0, sOut:10.002, D:10}` | `OUT_EXCEEDS_DURATION`, field `sourceOutPoint` |
| P9 | `{cst:0, sOut:12, D:10}` | `OUT_EXCEEDS_DURATION` |
| P10 | `{cst:0, sIn:3, sOut:3, D:10}` | `IN_NOT_BEFORE_OUT`, `sourceOutPoint` |
| P11 | `{cst:0, sIn:5, sOut:4, D:10}` | `IN_NOT_BEFORE_OUT` |
| P12 | `{cst:0, sIn:12, D:10}` (out defaults to 10) | `IN_NOT_BEFORE_OUT` |
| P13 | `{cst:0, sIn:15, sOut:12, D:10}` | `OUT_EXCEEDS_DURATION` (step 9 before 10) |
| P14 | `{cst:0, sIn:-1, D:10}` | `NEGATIVE_VALUE`, `sourceInPoint` |
| P15 | `{cst:0, sOut:-1, D:10}` | `NEGATIVE_VALUE`, `sourceOutPoint` |
| P16 | `{cst:0, sIn:-1, sOut:20, D:10}` | `NEGATIVE_VALUE`, `sourceInPoint` (field checks before range checks) |
| P17 | `{cst:NaN, D:10}` | `INVALID_NUMBER`, `compStartTime` |
| P18 | `{cst:0, sOut:Infinity, D:10}` | `INVALID_NUMBER`, `sourceOutPoint` |
| P19 | `{cst:true, D:10}` | `INVALID_NUMBER`, `compStartTime` |
| P20 | `{cst:"abc", sIn:-1, D:10}` | `INVALID_NUMBER`, `compStartTime` (order) |
| P21 | `{cst:"1.5", sIn:"0.5", sOut:"2.5", D:"10"}` | ok 1 / 1.5 / 3.5 / 2 / 2.5; all outputs `typeof "number"` |
| P22 | `{cst:" 2 ", sIn:".5", sOut:"1e0", D:"+3"}` | ok 1.5 / 2 / 2.5 / 0.5 / 1 |
| P23 | `{cst:0, sIn:"abc", D:10}`; also `sIn:""`, `sIn:"1.5s"` | `INVALID_NUMBER`, `sourceInPoint` |
| P24 | `{cst:2, sIn:null, sOut:undefined, D:4}` | ok 2 / 2 / 6 / 4 / 4 |
| P25 | `{D:10}`; also `{cst:null, D:10}` | `MISSING_VALUE`, `compStartTime` |
| P26 | `{cst:0}` | `MISSING_VALUE`, `sourceDuration` |
| P27 | `{cst:0, D:-1}` | `NEGATIVE_VALUE`, `sourceDuration` |
| P28 | `null`, `"x"`, `[]`, `undefined` | `INVALID_INPUT`, field `null` |
| P29 | `{cst:0, D:10, isStill:"yes"}` | `INVALID_INPUT`, field `isStill` |
| P30 | `{cst:3, isStill:true, D:0}` still default | ok 3 / 3 / 8 / 5 / 5, `isStill:true` |
| P31 | `{cst:3, isStill:true, sIn:2}` | ok 1 / 3 / 8 / 5 / 7 |
| P32 | `{cst:0, isStill:true, D:0, sOut:20}` | ok 0 / 0 / 20 / 20 / 20 (no duration check) |
| P33 | `{cst:0, isStill:true, D:"abc"}` | ok 0 / 0 / 5 / 5 / 5 (`D` ignored for stills) |
| P34 | `{cst:8, isStill:true, compDuration:10}` | ok, out 13, warnings `[OUT_BEYOND_COMP_END]` |
| P35 | `{cst:5, D:10, compDuration:10}` | ok, out 15, warnings `[OUT_BEYOND_COMP_END]` |
| P36 | `{cst:0, D:10, compDuration:10}` | ok, out 10, warnings `[]` |
| P37 | `{cst:0, D:10, compDuration:0}` | `NON_POSITIVE_VALUE`, `compDuration` |
| P38 | `{cst:0, D:10, frameDuration:0}`; also `-0.04` | `NON_POSITIVE_VALUE`, `frameDuration` |
| P39 | `{cst:1, sIn:0.5, sOut:2.5, D:10, fd:fd24}` 23.976 | ok 0.501 / 1.001 / 3.003 / 2.002 / 2.502, `frameRounded:true` |
| P40 | `{cst:2, sIn:1, sOut:4, D:10, fd:fd30}` 29.97 | ok 1.002 / 2.002 / 5.005 / 3.003 / 4.003 |
| P41 | `{cst:0, sIn:0, sOut:10, D:10, fd:fd30}` step-down 300→299 | ok 0 / 0 / 9.976633333333334 / same / same |
| P42 | `{cst:0, sIn:0, sOut:2, D:5, fd:0.04}` zero cst, 25 fps | ok 0 / 0 / 2 / 2 / 2 |
| P43 | `{cst:-0.05, sIn:0, sOut:1, D:5, fd:0.04}` | ok −0.04 / −0.04 / 0.96 / 1 / 1, warnings `[IN_BEFORE_COMP_START]` |
| P44 | `{cst:0.02, sIn:0, sOut:9.99, D:10, fd:1/30}` | ok 1/30 / 1/30 / 10.0333333 / 10 / 10 |
| P45 | `{cst:0, sIn:1, sOut:1.01, D:10, fd:0.04}` | `RANGE_TOO_SHORT`, `sourceOutPoint` |
| P46 | `{cst:0.01, isStill:true, fd:0.04}` | ok 0 / 0 / 5 / 5 / 5 (no step-down for stills) |

(`fd` in the table = `frameDuration`.)

### 6.2 `validateTimeRemapKeyframes` (`t` = timeInSeconds, `s` = sourceTimeInSeconds, `D = 10` unless stated)
| # | Input | Expected |
|---|---|---|
| K1 | `[]` | `EMPTY_KEYFRAMES`, index `null` |
| K2 | `null`; `{}`; `"x"` | `INVALID_INPUT`, field `keyframes` |
| K3 | `[{t:1,s:0.5}]` | ok `[{1,0.5}]` |
| K4 | `[{t:2,s:4},{t:0,s:0},{t:1,s:1}]` | ok sorted `[{0,0},{1,1},{2,4}]`; input unchanged |
| K5 | `[{t:1,s:0},{t:1,s:2}]` | `DUPLICATE_TIME`, index 1 |
| K6 | `[{t:1,s:0},{t:1.0004,s:2}]` | `DUPLICATE_TIME`, index 1 |
| K7 | `[{t:1,s:0},{t:1.002,s:2}]` | ok |
| K8 | `[{t:0,s:11}]` | `SOURCE_TIME_OUT_OF_RANGE`, index 0 |
| K9 | `[{t:0,s:-0.5}]` | `SOURCE_TIME_OUT_OF_RANGE` |
| K10 | `[{t:0,s:-0.0005},{t:1,s:10.0005}]` | ok `[{0,0},{1,10}]` (clamped) |
| K11 | `[{t:0,s:10}]` | ok |
| K12 | `[{t:-1,s:0},{t:1,s:2}]` | ok (negative time allowed) |
| K13 | `[{t:NaN,s:0}]` | `INVALID_NUMBER`, field `timeInSeconds`, index 0 |
| K14 | `[{t:0}]` | `MISSING_VALUE`, field `sourceTimeInSeconds` |
| K15 | `[{t:0,s:0}, null]` (also `5`, `[1,2]` as 2nd) | `INVALID_KEYFRAME`, index 1 |
| K16 | `[{t:"1.5",s:"2"}]` | ok `[{1.5,2}]` (numbers) |
| K17 | `D` = 0, `"abc"`, `undefined`, −1 with `[{t:0,s:0}]` | `INVALID_SOURCE_DURATION` |
| K18 | `[]` with `D = NaN` | `EMPTY_KEYFRAMES` (checked before D) |
| K19 | `[{t:1,s:0},{t:1,s:0},{t:"x",s:0}]` | `INVALID_NUMBER`, index 2 (element checks before duplicates) |
| K20 | `[{t:1,s:2,foo:9}]` | output keyframe has exactly keys `timeInSeconds`, `sourceTimeInSeconds` |

### 6.3 `planTimeRemapKeyframes` (keyframes as `{t,s}`)
| # | existing | keyframes | wasEnabled | Expected times / values / removeTimes / replaced / added |
|---|---|---|---|---|
| T1 | `[0, 9.966]` | `[{1,0},{3,5}]` | false | `[1,3]` / `[0,5]` / `[0,9.966]` / 0 / 2 |
| T2 | `[0, 9.966]` | `[{0,2},{4,6}]` | false | `[0,4]` / `[2,6]` / `[9.966]` / 1 / 1 |
| T3 | `[0,2,5]` | `[{2.0004,1},{3,4}]` | true | `[2,3]` / `[1,4]` / `[]` / 1 / 1 |
| T4 | `[]` | `[{1,1}]` | true | `[1]` / `[1]` / `[]` / 0 / 1 |
| T5 | `[1.0006]` | `[{1.0,7},{1.0011,8}]` | false | `[1.0006,1.0011]` / `[7,8]` / `[]` / 1 / 1 (claim at most once) |
| T6 | `[0,2]` | `[{0,0},{2,2}]` | false | `[0,2]` / `[0,2]` / `[]` / 2 / 0 |
| T7 | `"x"` | `[]` | false | `INVALID_INPUT`, field `existingKeyTimes` |
| T8 | `[]` | `[{1,1}]` | `"no"` | `INVALID_INPUT`, field `remapWasEnabled` |

---

## 7. ExtendScript commands (`mcp-bridge-auto.jsx`)

### 7.1 Shared conventions
- Signatures: `function importFootage(args)`, `function addFootageLayer(args)`, `function setLayerTimeRemap(args)`; each returns `JSON.stringify(obj, null, 2)`.
- Error JSON (every error from new commands): `{ status: "error", code: "<CODE>", message: "<text>", field?: "<name>", index?: <n> }` — `field`/`index` passed through from pure functions when present; `code` always present.
- **Never throw.** Full-body `try/catch` → `{status:"error", code:"AE_ERROR", message: e.toString() + (e.line ? " (line " + e.line + ")" : "")}`. (`executeCommand`'s outer catch writes a result *without* `_commandExecuted`, which the waiting tool would see as a timeout.)
- **Undo**: all validation happens before opening the undo group.
  ```
  var undoOpen = false;
  app.beginUndoGroup("MCP: <Name>"); undoOpen = true;
  ...
  app.endUndoGroup(); undoOpen = false;
  ```
  In catch: `if (undoOpen) { try { app.endUndoGroup(); } catch (e2) {} }`. Names: `"MCP: Import Footage"`, `"MCP: Add Footage Layer"`, `"MCP: Set Time Remap"`.
- **No NaN/Infinity in output JSON** — the polyfill (~line 1257) emits them literally → invalid JSON → Node timeout. Pass every AE-read number through `_mcpNum(v)` = `(typeof v === "number" && isFinite(v)) ? v : null`.
- ES3 everywhere (rules of §1.3 minus the no-AE rule). No `Array.indexOf`, no `String.trim`.
- `app.project.item(i)` only after checking `1 <= i <= app.project.numItems` (it throws when out of range).
- Private helpers (outside pure block, `_mcp` prefix): `_mcpNum`, `_mcpError(code, message, extra)`, `_mcpResolveComp(raw)` → `{comp, index}` or error object, `_mcpResolveLayer(comp, raw)`, `_mcpResolveFootage(args)`, `_mcpNormPath(p)` (lowercase when `File.fs === "Windows"`), `_mcpFindOrCreateRootFolder(name)`, `_mcpItemTypeName(item)` → `"CompItem" | "FolderItem" | "FootageItem" | "Item"`.

Comp resolution (`compIndex` = 1-based project item index), in order:
| Condition | Code | Message |
|---|---|---|
| `parsePositiveIntInput` fails | `INVALID_ARGS` | `compIndex must be a positive integer (got: <v>)` |
| `> numItems` | `COMP_NOT_FOUND` | `Composition not found at index <n> (project has <m> items)` |
| not `instanceof CompItem` | `NOT_A_COMP` | `Item at index <n> is not a composition (it is a <Type>)` |

Layer resolution:
| Condition | Code | Message |
|---|---|---|
| parse fails | `INVALID_ARGS` | `layerIndex must be a positive integer (got: <v>)` |
| `> comp.numLayers` | `LAYER_NOT_FOUND` | `Layer not found at index <n> in composition '<name>' (it has <m> layers)` |

### 7.2 `importFootage(args)` — `{ filePath: string, folderName?: string }`
Validation order:
| # | Check | Code | Message |
|---|---|---|---|
| 1 | `filePath` non-empty string | `INVALID_ARGS` | `filePath must be a non-empty string` |
| 2 | `folderName` (if not undefined/null) non-empty string | `INVALID_ARGS` | `folderName must be a non-empty string when provided` |
| 2a | `filePath` is absolute (`/^([A-Za-z]:[\\\/]\|\/\|~\/)/`) and not UNC (does not start with `\\` or `//`) — checked before any `File`/AE call | `INVALID_ARGS` | `filePath must be an absolute local path: <filePath>` |
| 3 | `f = new File(filePath)`; `!f.exists` | `FILE_NOT_FOUND` | `File not found: <filePath>` |
| 4 | `f instanceof Folder` | `NOT_A_FILE` | `Path is a folder, not a file: <filePath>` |
| 5 | `io = new ImportOptions(f)` (in try); throws or `!io.canImportAs(ImportAsType.FOOTAGE)` | `CANNOT_IMPORT` | `After Effects cannot import this file as footage: <filePath>` (+ exception text if thrown) |

Implementation:
1. `io.importAs = ImportAsType.FOOTAGE; io.sequence = false;`
2. `alreadyInProject` computed **before** import: loop `i = 1..numItems`, collect `item.id` into `existingItemIds` for each `item instanceof FootageItem && item.file && _mcpNormPath(item.file.fsName) === _mcpNormPath(f.fsName)`; `alreadyInProject = existingItemIds.length > 0`.
3. Always import (decision 3): open undo group, `item = app.project.importFile(io)`.
4. If `folderName`: find the first (lowest index) `FolderItem` with `name === folderName` and `parentFolder.id === app.project.rootFolder.id` (compare ids, not object identity); if none, `app.project.items.addFolder(folderName)` (`created = true`); then `item.parentFolder = folder`.
5. If anything throws after `importFile` succeeded: `try { item.remove(); } catch (e) {}` before returning the error.

Success JSON:
```js
{ status: "success", message: "Footage imported successfully",
  footage: { id, name, filePath /* item.file.fsName */,
             width, height,        // null when !hasVideo
             duration,             // item.duration (0 for stills)
             frameRate,            // null when isStill || !hasVideo
             pixelAspect,          // null when !hasVideo
             isStill,              // item.mainSource.isStill === true || item.duration === 0
             hasVideo, hasAudio,
             parentFolder: { id, name } },
  alreadyInProject: <boolean>,
  existingItemIds: [<id>...],       // [] if none
  folder: { id, name, created: <boolean> } | null }   // null when folderName not given
```

### 7.3 `addFootageLayer(args)` — `{ compIndex, footageId?, footageName?, compStartTime, sourceInPoint?, sourceOutPoint?, position? }`
Validation order:
1. Comp resolution (§7.1).
2. Footage resolution ("present" = not undefined/null, and for `footageName` not `""`):
   | Condition | Code | Message |
   |---|---|---|
   | both present or neither | `INVALID_ARGS` | `Provide exactly one of footageId or footageName` |
   | `footageId` fails `parsePositiveIntInput` | `INVALID_ARGS` | `footageId must be a positive integer (got: <v>)` |
   | id lookup finds nothing | `FOOTAGE_NOT_FOUND` | `No project item found with id <id>` |
   | found item not `instanceof FootageItem` | `NOT_FOOTAGE` | `Project item <id> ('<name>') is not a FootageItem (it is a <Type>)` |
   | name lookup: no `FootageItem` with `name === footageName` | `FOOTAGE_NOT_FOUND` | `No footage item named '<name>' found in the project` |
   | name lookup: more than one | `AMBIGUOUS_FOOTAGE_NAME` | `Multiple footage items are named '<name>' (ids: 3, 7). Use footageId instead.` |

   Id lookup: `if (typeof app.project.itemByID === "function") { try { item = app.project.itemByID(id) } catch(e) { item = null } }`; if still nothing, loop all items comparing `item.id === id`.
3. `position` (if present): array of length 2 or 3 of finite numbers, else `INVALID_ARGS` `position must be an array of 2 or 3 finite numbers`.
4. Placement: `isStill = footage.mainSource.isStill === true || footage.duration === 0`;
   ```
   p = computeFootagePlacement({compStartTime: args.compStartTime,
       sourceInPoint: args.sourceInPoint, sourceOutPoint: args.sourceOutPoint,
       sourceDuration: footage.duration, isStill: isStill,
       frameDuration: comp.frameDuration, compDuration: comp.duration})
   ```
   `!p.ok` → error with `code/field/message` from `p.error`.

Implementation (inside undo group):
1. `layer = comp.layers.add(footage)`.
2. `layer.startTime = p.startTime`.
3. If `p.inPoint >= layer.outPoint`: set `layer.outPoint = p.outPoint` then `layer.inPoint = p.inPoint`; else `layer.inPoint = p.inPoint` then `layer.outPoint = p.outPoint`. (Guards stills whose default length is shorter than the requested in-point.)
4. `position`: if `footage.hasVideo` and `layer.property("ADBE Transform Group")` exists → `.property("ADBE Position").setValue(position)`; if `!footage.hasVideo` → warning `POSITION_IGNORED_AUDIO_ONLY`; if `hasVideo` but the Transform/Position lookup fails → warning `POSITION_NOT_SET`. The reported `layer.position` is the value read back from AE (`[x, y, z]`), or `null` when there is no Transform group.
5. Read back `layer.startTime/inPoint/outPoint`; if any differs from `p` by more than `EPS` → warning `AE_ADJUSTED_TIMES` (message lists computed vs actual).
6. On any throw after step 1: `try { layer.remove(); } catch (e) {}`.

Success JSON:
```js
{ status: "success", message: "Footage layer added successfully",
  layer: { index, name, startTime, inPoint, outPoint, duration /* outPoint-inPoint */,
           position /* array or null */, hasVideo, hasAudio },
  footage: { id, name, isStill },
  composition: { index /* compIndex */, id, name, frameRate, duration },
  computed: { startTime, inPoint, outPoint, sourceInPoint, sourceOutPoint },  // from p
  warnings: [ { code, message } ],   // pure warnings first, then POSITION_IGNORED_AUDIO_ONLY, AE_ADJUSTED_TIMES
  warning: "<messages joined by '; '>" }   // present ONLY if warnings.length > 0
```

### 7.4 `setLayerTimeRemap(args)` — `{ compIndex, layerIndex, keyframes: [{timeInSeconds, sourceTimeInSeconds}] }`
Validation order:
1. Comp resolution, layer resolution (§7.1).
2. `!(layer instanceof AVLayer) || !layer.source || !(layer.source instanceof FootageItem || layer.source instanceof CompItem)` → `NO_FOOTAGE_SOURCE` `Layer '<name>' has no footage source; text, shape, camera and light layers cannot be time-remapped`. (Precomp layers ARE allowed.)
3. `layer.canSetTimeRemapEnabled !== true` → `TIME_REMAP_NOT_SUPPORTED` `Layer '<name>' does not support Time Remap (still images, solids and null layers cannot be time-remapped)`.
4. `v = validateTimeRemapKeyframes(args.keyframes, layer.source.duration)`; `!v.ok` → error passing `code`, `field`, `index`.

Implementation (inside undo group):
1. `wasEnabled = layer.timeRemapEnabled`; if `!wasEnabled`: `layer.timeRemapEnabled = true`.
2. `prop = layer.property("ADBE Time Remapping")`.
3. Snapshot `existing = [prop.keyTime(1..numKeys)]` (do **not** hard-code where AE puts auto keys).
4. `plan = planTimeRemapKeyframes(existing, v.keyframes, wasEnabled)`.
5. `prop.setValuesAtTimes(plan.times, plan.values)`.
6. For `i = prop.numKeys` down to 1: if `keyTime(i)` is within `1e-6` of any value in `plan.removeTimes` → `prop.removeKey(i)`, count it. (Caller keys are added **before** removal, so the property never reaches zero keys.)
7. Read back all keys as `{timeInSeconds: keyTime(i), sourceTimeInSeconds: keyValue(i)}`.
8. For each caller time outside `[layer.inPoint - EPS, layer.outPoint + EPS]` → warning `KEY_OUTSIDE_LAYER_RANGE`.
9. No rollback on mid-way failure; the error message ends with ` (changes may be partially applied; use Edit > Undo)`.

Success JSON:
```js
{ status: "success", message: "Time remap keyframes set successfully",
  layer: { index, name, inPoint, outPoint },
  composition: { index, id, name },
  timeRemapWasEnabled: <boolean>,      // state BEFORE the command
  autoKeyframesRemoved: <int>,         // 0 when timeRemapWasEnabled
  keyframesAdded: plan.addedCount, keyframesReplaced: plan.replacedCount,
  keyframes: [ { timeInSeconds, sourceTimeInSeconds } ],   // ALL keys after the op, ascending
  warnings: [ { code, message } ], warning?: "<joined>" }  // warning only if non-empty
```

### 7.5 Code catalogue
Commands: `INVALID_ARGS`, `COMP_NOT_FOUND`, `NOT_A_COMP`, `LAYER_NOT_FOUND`, `FOOTAGE_NOT_FOUND`, `NOT_FOOTAGE`, `AMBIGUOUS_FOOTAGE_NAME`, `FILE_NOT_FOUND`, `NOT_A_FILE`, `CANNOT_IMPORT`, `NO_FOOTAGE_SOURCE`, `TIME_REMAP_NOT_SUPPORTED`, `AE_ERROR`, plus pure codes (§3.5, §4).
Warnings: `IN_BEFORE_COMP_START`, `OUT_BEYOND_COMP_END`, `POSITION_IGNORED_AUDIO_ONLY`, `POSITION_NOT_SET`, `AE_ADJUSTED_TIMES`, `KEY_OUTSIDE_LAYER_RANGE`.
Error JSON omits `field` / `index` when they are null. The "partially applied" suffix of §7.4 step 9 is appended only when the failure occurs after the undo group was opened.

### 7.6 Bridge plumbing changes (review round 1)
- `checkForCommands` / `updateCommandStatus` set `encoding = "UTF-8"` on the command file before every `open()` (Node writes UTF-8 without BOM; non-ASCII paths were garbled under the ANSI codepage).
- `executeCommand` sets `_commandExecuted` **before** `_responseTimestamp`; the timestamp uses `toISOString()` inside try/catch with a `getTime()` fallback.
- The final `app.endUndoGroup()` on the success path is wrapped in its own try/catch.

---

## 8. `executeCommand` branches
Insert immediately before `default:` (~line 1598), matching existing style:
```js
            case "importFootage":
                logToPanel("Calling importFootage function...");
                result = importFootage(args);
                logToPanel("Returned from importFootage.");
                break;
            case "addFootageLayer":
                logToPanel("Calling addFootageLayer function...");
                result = addFootageLayer(args);
                logToPanel("Returned from addFootageLayer.");
                break;
            case "setLayerTimeRemap":
                logToPanel("Calling setLayerTimeRemap function...");
                result = setLayerTimeRemap(args);
                logToPanel("Returned from setLayerTimeRemap.");
                break;
```

---

## 9. `src/index.ts`

### 9.1 `allowedScripts`
Append after `"setLayerMask"` (~line 193): `"importFootage"`, `"addFootageLayer"`, `"setLayerTimeRemap"`. Nothing else in `run-script` changes (it still just queues and bypasses zod and the Node file checks — which is why the jsx re-validates everything).

### 9.2 New section
Insert immediately above `// Start the MCP server` (~line 949), wrapped in `// --- BEGIN FOOTAGE TOOLS ---` / `// --- END FOOTAGE TOOLS ---`. Do **not** modify `waitForBridgeResult`, `writeCommandFile`, `clearResultsFile` or any existing tool.

```ts
// --- BEGIN FOOTAGE TOOLS ---
const FOOTAGE_IMPORT_TIMEOUT_MS = 20000;
const FOOTAGE_DEFAULT_TIMEOUT_MS = 8000;

// Test hook: AE_MCP_BRIDGE_TIMEOUT_MS (positive integer) overrides both timeouts. Read at call time.
function resolveBridgeTimeout(defaultMs: number): number {
  const raw = process.env.AE_MCP_BRIDGE_TIMEOUT_MS;
  if (raw !== undefined) { const n = Number(raw); if (Number.isInteger(n) && n > 0) return n; }
  return defaultMs;
}

function footageToolError(code: string, message: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ status: "error", code, message }, null, 2) }], isError: true };
}

async function queueCommandAndWait(command: string, args: Record<string, unknown>, timeoutMs: number) {
  clearResultsFile();
  writeCommandFile(command, args);
  const raw = await waitForBridgeResult(command, timeoutMs, 250);
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (parsed && parsed._commandExecuted === command) {
    return { content: [{ type: "text" as const, text: raw }], isError: parsed.status === "error" };
  }
  return { content: [{ type: "text" as const, text:
    `Timed out after ${timeoutMs} ms waiting for After Effects to finish "${command}". ` +
    `The command is still queued and may complete later. Make sure the "MCP Bridge Auto" panel is open ` +
    `in After Effects with "Auto-run commands" checked, then call the "get-results" tool to retrieve the result.` }] };
}
```
Rules: success returns the bridge result text verbatim (incl. `_commandExecuted`, `_responseTimestamp`); `isError` is `true` iff bridge `status === "error"`; timeout is **not** an error (omit `isError`); Node-side validation failures return `footageToolError(...)` **before** touching any bridge file; wrap each handler body in try/catch → `footageToolError("INTERNAL_ERROR", String(error))`.

### 9.3 Tool registrations
Raw-shape `server.tool` cannot express cross-field rules, so handlers check them.
```ts
server.tool(
  "importFootage",
  "Import a local video, audio or image file into the After Effects project by absolute path. Always creates a new project item (no de-duplication; the result reports alreadyInProject). Optionally files it into a root-level Project panel folder (created if missing). Waits up to 20 s for the result: footage id, name, width, height, duration.",
  {
    filePath: z.string().min(1).describe("Absolute path to a local video/audio/image file."),
    folderName: z.string().min(1).optional().describe("Optional Project panel folder at project root; created if missing.")
  },
  async ({ filePath, folderName }) => {
    // 1. !path.isAbsolute(filePath)        -> footageToolError("INVALID_ARGS", `filePath must be an absolute path: ${filePath}`)
    // 1a. starts with "\\\\" or "//"         -> footageToolError("INVALID_ARGS", `Network (UNC) paths are not supported: ${filePath}`)
    // 1b. win32 && !/^[A-Za-z]:[\\/]/        -> INVALID_ARGS (drive-relative paths such as "\foo")
    // 2. !fs.existsSync(filePath)          -> footageToolError("FILE_NOT_FOUND", `File not found: ${filePath}`)
    // 3. !fs.statSync(filePath).isFile()   -> footageToolError("NOT_A_FILE", `Path is not a regular file: ${filePath}`)
    // 4. args = { filePath: path.resolve(filePath) } plus folderName only if defined
    // 5. return queueCommandAndWait("importFootage", args, resolveBridgeTimeout(FOOTAGE_IMPORT_TIMEOUT_MS))
  }
);

server.tool(
  "addFootageLayer",
  "Place an existing footage item (by footageId or footageName) on a composition's timeline, trimmed to a source range. At compStartTime the source frame at sourceInPoint is shown; the layer ends at compStartTime + (sourceOutPoint - sourceInPoint). Times snap to comp frames. Stills default to 5 s. Waits up to 8 s for the result.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project item list (app.project.item(i))."),
    footageId: z.number().int().positive().optional().describe("Project item id of the footage (e.g. from importFootage). Provide exactly one of footageId/footageName."),
    footageName: z.string().min(1).optional().describe("Exact name of the footage item. Errors if several footage items share the name."),
    compStartTime: z.number().finite().describe("Comp time in seconds where sourceInPoint appears. May be negative."),
    sourceInPoint: z.number().finite().min(0).optional().describe("Source time (s) where the clip starts. Default 0."),
    sourceOutPoint: z.number().finite().min(0).optional().describe("Source time (s) where the clip ends. Default: full source duration (stills: sourceInPoint + 5)."),
    position: z.array(z.number().finite()).min(2).max(3).optional().describe("Optional layer position [x, y] or [x, y, z].")
  },
  async (params) => {
    // (params.footageId === undefined) === (params.footageName === undefined)
    //     -> footageToolError("INVALID_ARGS", "Provide exactly one of footageId or footageName.")
    // both sourceInPoint and sourceOutPoint defined && !(sourceInPoint < sourceOutPoint)
    //     -> footageToolError("INVALID_ARGS", `sourceInPoint (${a}) must be less than sourceOutPoint (${b}).`)
    // return queueCommandAndWait("addFootageLayer", params, resolveBridgeTimeout(FOOTAGE_DEFAULT_TIMEOUT_MS))
  }
);

server.tool(
  "setLayerTimeRemap",
  "Set Time Remap keyframes (comp time -> source time) on a footage or precomp layer for speed ramps. If this call enables Time Remap, AE's two default keyframes are removed and replaced by yours; if Time Remap was already enabled, your keys are merged (a key at an existing time replaces it). Waits up to 8 s for the result.",
  {
    ...LayerIdentifierSchema,
    keyframes: z.array(z.object({
      timeInSeconds: z.number().finite().describe("Comp time (s) of the keyframe."),
      sourceTimeInSeconds: z.number().finite().min(0).describe("Source time (s) shown at that comp time; 0..source duration.")
    })).min(1).describe("At least one keyframe.")
  },
  async (params) => queueCommandAndWait("setLayerTimeRemap", params, resolveBridgeTimeout(FOOTAGE_DEFAULT_TIMEOUT_MS))
);
// --- END FOOTAGE TOOLS ---
```
For `addFootageLayer` / `setLayerTimeRemap`, args forwarded to the bridge = the zod-parsed params (`JSON.stringify` drops `undefined` keys).

---

## 10. `package.json`
```json
"pretest": "npm run build",
"test": "node --test \"test/**/*.test.js\""
```
Deviation from `node --test test/`: on Node v26.7.0 a bare directory argument prints `Could not find 'test/'` (since Node 21 arguments are glob patterns). The quoted glob works in cmd and sh; Node expands it. `pretest` guarantees a fresh `build/index.js` for integration tests. No new dependencies; tests are ESM `.js` (`"type": "module"`).

---

## 11. QA test mechanics

**`test/helpers/load-pure.js`:** read the jsx as UTF-8, split `/\r?\n/`, assert each marker exactly once and begin < end, take the lines strictly between. `const ctx = vm.createContext({})`. Run an **ES3 sandbox prelude** in the context first:
```
delete Array.prototype.forEach; delete Array.prototype.map; delete Array.prototype.filter;
delete Array.prototype.reduce; delete Array.prototype.some; delete Array.prototype.every;
delete Array.prototype.indexOf; delete Array.isArray; delete String.prototype.trim;
delete Number.isFinite; delete Number.isNaN; delete Object.keys; delete Date.now;
JSON = undefined;
```
Then `vm.runInContext(block, ctx)`; export `ctx.computeFootagePlacement` etc. (top-level `function`/`var` become context properties).

**Assertions:** normalise results with `plain = x => JSON.parse(JSON.stringify(x))` before `deepStrictEqual` (vm-realm prototypes break it otherwise). Numbers: `Math.abs(a-b) < 1e-9`. Assert `code`, `field`, `index`; messages only as non-empty strings. Assert inputs are not mutated.

**Static tests:** `new vm.Script(fullJsxSource)` parses; `function importFootage(`, `function addFootageLayer(`, `function setLayerTimeRemap(` exist; the three `case "…":` lines exist; the pure block contains none of `=>`, `let `, `const `, `` ` ``, `JSON.`, `app.`, `instanceof Array`; `src/index.ts` `allowedScripts` contains the 3 names.

**Integration (`test/mcp-integration.test.js`):** temp HOME via `fs.mkdtempSync(path.join(os.tmpdir(), ...))`; spawn `build/index.js` with `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`
`{command: process.execPath, args: [buildIndex], env: {...process.env, USERPROFILE: tmp, HOME: tmp, AE_MCP_BRIDGE_TIMEOUT_MS: "1500"}}`
(`os.homedir()` reads USERPROFILE on Windows, HOME elsewhere → bridge dir `<tmp>/Documents/ae-mcp-bridge`). A fake bridge polls `ae_command.json` every 50 ms; on `status === "pending"` it writes `ae_mcp_result.json` = canned result + `_commandExecuted: <command>` and sets the command status to `"completed"`.
Cases:
- `listTools` contains the 3 tools with expected `inputSchema.properties`.
- `importFootage`: relative path → `INVALID_ARGS`; missing absolute path → `FILE_NOT_FOUND`; directory → `NOT_A_FILE`; in all three `isError` true and no `importFootage` command file written.
- Valid temp file → command file `args.filePath === path.resolve(file)`; result text parses to the fake result; `isError` falsy.
- Fake result `status:"error"` → `isError: true`.
- No fake bridge → returns in ~1.5 s, text includes `Timed out`, `get-results` and the command name; `isError` falsy.
- `addFootageLayer`: both/neither selector → `INVALID_ARGS`; `sourceInPoint >= sourceOutPoint` → `INVALID_ARGS`; valid params forwarded unchanged.
- `setLayerTimeRemap` with `keyframes: []` → zod rejection (accept either a rejected promise or `isError: true`; SDK behaviour varies).
- `run-script` with `script: "importFootage"` → "has been queued" text.

---

## 12. File ownership (no overlap)
| Owner | Files / regions |
|---|---|
| BE | `src/scripts/mcp-bridge-auto.jsx` (all); `src/index.ts` except the two help template literals; `package.json` |
| QA | `test/**` only |
| TL | `README.md`; in `src/index.ts` ONLY the template literals of `get-help` (~lines 331–381) and `mcp_aftereffects_get_effects_help` (~lines 837–905). Effects-help gets one pointer line, e.g. `For footage import, trimmed placement and Time Remap, see the get-help tool.` |
| Coordinator | `docs/footage-commands-spec.md`; all git commits |

BE and TL edit disjoint regions of `index.ts`; both re-read before each Edit.
Notes for TL docs: `compIndex` = position in the project item list (not comp id); `listCompositions` doesn't report it and `getProjectInfo` lists only the first 50 items in order. `footageId` comes from `importFootage` (or `getProjectInfo`). Document the stills 5 s default, 1 ms tolerance, frame snapping, and Time Remap replace/merge semantics.

---

## 13. Risks and resolutions
| # | Risk | Resolution |
|---|---|---|
| R1 | `executeCommand` outer catch writes a result without `_commandExecuted` → looks like a timeout | Commands never throw (§7.1): full try/catch → `AE_ERROR` |
| R2 | JSON polyfill emits NaN/Infinity as bare tokens → invalid JSON → Node timeout | `_mcpNum` sanitiser on every AE number |
| R3 | `waitForBridgeResult` skips content of the same length as last seen | Accepted (a result exactly as long as the placeholder is very unlikely); shared helper not modified |
| R4 | `run-script` bypasses zod and Node file checks | jsx re-validates everything; strict numeric-string parsing |
| R5 | Cross-realm `instanceof Array` / prototype mismatch in vm tests | `Object.prototype.toString` rule; `plain()` in QA |
| R6 | ES3 gaps (`trim`/`indexOf`/`forEach`) only surface inside AE | ES3 sandbox prelude in tests + token lint |
| R7 | Removing auto keys before adding caller keys | Add first, then remove snapshot keys (§7.4) |
| R8 | Independent rounding of in/out could exceed source end → AE clamps silently | Integer-frame formula with a single step-down (§3.3.11); read-back + `AE_ADJUSTED_TIMES` |
| R9 | A still's default layer length may be shorter than the requested in-point | Conditional set order (§7.3 step 3) |
| R10 | `app.project.item(i)` throws when out of range | Range check first |
| R11 | Concurrent tool calls overwrite the single command file | Existing limitation; documented, not fixed |
| R12 | BE/TL parallel edits in `index.ts` | Disjoint anchored regions (§12) |
| R13 | CRLF files | Keep CRLF; tests split `/\r?\n/` |
| R14 | Windows path case breaks `alreadyInProject` | `_mcpNormPath` lowercases on Windows |

### AE API facts to verify in a real AE session
Confident: `ImportOptions`, `canImportAs`, `ImportAsType.FOOTAGE`, `importFile`, `items.addFolder`, `parentFolder`, `layers.add`, `canSetTimeRemapEnabled`, `timeRemapEnabled`, `"ADBE Time Remapping"`, `setValuesAtTimes`, `keyTime`/`keyValue`/`removeKey`, `mainSource.isStill`, `hasVideo`/`hasAudio`, `File.fs`.
Uncertain (each has a mitigation):
1. `app.project.itemByID` availability by AE version → `typeof` guard + try/catch + loop fallback.
2. Whether AE snaps `startTime` (not only in/out) to frames → read-back + `AE_ADJUSTED_TIMES`.
3. `new File(dirPath)` returning a `Folder` → else `CANNOT_IMPORT`; Node `isFile()` covers the MCP path.
4. `canSetTimeRemapEnabled === false` for stills/solids/nulls → if wrong, `setValuesAtTimes` fails inside try/catch → `AE_ERROR`.
5. Whether `importFile` targets the selected Project panel folder → result reports `footage.parentFolder`.
6. Audio-only layers may lack a Transform group → guarded, `POSITION_IGNORED_AUDIO_ONLY`.
7. `parentFolder` vs `rootFolder` comparison → by id.
