# Live After Effects Smoke Test (BL-024)

Manual round trip against a running After Effects instance. `npm test` only covers the
file-IPC layer in Node; this procedure is what proves the bridge actually talks to AE —
property names, command arguments and index semantics all get exercised for real.

Run it after any change to `src/scripts/mcp-bridge-auto.jsx` or `src/index.ts`.

## 1. Preconditions

1. `npm run build` succeeds and `build/scripts/mcp-bridge-auto.jsx` exists.
2. `npm run install-bridge` has been run (or run the built script manually:
   File > Scripts > Run Script File > `build/scripts/mcp-bridge-auto.jsx`).
3. The MCP Bridge panel is open in AE and logging. Every step below should also appear
   in that log; a step that succeeds in AE but not in the panel log means the result
   file never got written.
4. The MCP client is connected to the server (restart the client after a rebuild, or it
   keeps talking to the old `build/index.js`).
5. AE is on an empty project — `File > New > New Project` — because the steps create
   compositions and the commands resolve targets by name.

Record the AE version up front. `parseFloat(app.version)` drives `isAE2025OrLater`, so a
node that misbehaves on one version may be fine on another.

## 2. Steps

Every call below must return a real JSON payload. A result containing `"has been queued"`,
an empty string, or an unchanged previous payload is a **failure** — that is exactly the
silent-success class of bug the bridge was fixed for.

### S1 — Bridge is alive (`list-compositions`)

- Call `list-compositions`.
- **Pass:** JSON naming the active project and its (possibly empty) composition list, with
  `_responseTimestamp` and `_commandExecuted: "listCompositions"`.
- **Fail:** timeout, empty result, or a payload with a different `_commandExecuted`.

### S2 — Composition creation (`create-composition`)

- Call `create-composition` with a name, 1920x1080, 30 fps, 5 s duration.
- **Pass:** the composition appears in the AE Project panel with those exact settings.

### S3 — Layer creation (`run-script` → `createSolidLayer`)

- Call `run-script` with `script: "createSolidLayer"` and parameters for the composition
  from S2.
- **Pass:** layer 1 exists in the composition; AE Timeline shows it.

### S4 — Transform write (`run-script` → `setLayerProperties`)

- `script: "setLayerProperties"`, parameters `{ compName, layerIndex: 1, position: [960, 540], scale: [100, 100] }`.
- **Pass:** `layer.changedProperties` contains `"position"` and `"scale"`, and
  `layer.removedKeyframes` is `0`. AE shows the solid centred.
- **Note:** `compName` falls back to the active composition when omitted, so always pass it
  to avoid writing to the wrong comp.

### S5 — Keyframe creation (`set-layer-keyframe`)

- `compIndex: 1`, `layerIndex: 1`, `propertyName: "Position"`, `timeInSeconds: 0`, `value: [960, 540]`.
- Then repeat at `timeInSeconds: 1` with a different position.
- **Pass:** two Position keyframes on layer 1 at 0 s and 1 s; the layer moves over time.
- **Gotcha (BL-009):** `setLayerKeyframe` resolves the composition through
  `app.project.items[compIndex]`, which is 1-based over *all* project items, not just
  compositions. In a project containing footage or precomps, index 1 may not be the comp
  from S2. Confirm which comp actually received the keys.

### S6 — Keyframes are preserved by default (`setLayerProperties`) (BL-007)

- `script: "setLayerProperties"`, `{ compName, layerIndex: 1, position: [200, 200] }` —
  **no** `replaceKeyframes`.
- **Pass:** response has `layer.skippedProperties` naming position and its keyframe count,
  and AE still shows both keyframes from S5 with the animation intact.
- **Fail:** the keyframes are gone, or position was written and not reported.

### S7 — Explicit replacement (`replaceKeyframes: true`) (BL-007)

- Same call plus `replaceKeyframes: true`.
- **Pass:** `layer.removedKeyframes` equals the number of keyframes S5 created,
  `changedProperties` contains `"position"`, `skippedProperties` is empty, and AE shows a
  static position with no keyframes.

### S8 — Effect application (`apply-effect`) (BL-008)

- Call `apply-effect` with `effectMatchName: "ADBE Glo2"` (Glow) on layer 1.
- **Pass:** returns the effect `name` / `matchName` / `index`, and Effect Controls in AE
  lists Glow on that layer.
- **Fail (the pre-fix symptom):** `"layer.Effects is undefined"` or an effect silently
  missing from Effect Controls. `layer.Effects` does not exist in the AE API; the bridge
  now uses `layer.property("ADBE Effect Parade")`, the locale-independent matchName.
- Repeat with `effectName` ("Fast Box Blur") to cover the name-based branch, and once via
  `apply-effect-template` if a template is configured, which uses the same call site.

### S9 — Batch write (`run-script` → `batchSetLayerProperties`)

- Add a second solid, then `script: "batchSetLayerProperties"` with operations for both
  layers, one of them targeting an animated Position, and top-level `replaceKeyframes`
  omitted.
- **Pass:** per-operation results carry `changedProperties`, `removedKeyframes` and
  `skippedProperties`; the animated layer reports the skip and keeps its keys, and the
  other layer is written. A per-op `replaceKeyframes: true` overrides the top-level flag.

### S10 — Bridge self-test (`run-bridge-test`)

- Call `run-bridge-test`.
- **Pass:** the built-in effect probe reports each tested effect as applied, matching what
  Effect Controls shows.

### S11 — Timeout surfaces as an error (BL-001/BL-004)

- Stop the AE panel (close the ScriptUI window), then call `list-compositions`.
- **Pass:** the MCP call returns an error result (`isError: true`) after roughly the
  configured timeout, not a success with empty content.
- Restart the panel and confirm S1 passes again. This is the only way to prove the client
  is told about a dead bridge instead of being told the command worked.

## 3. Reporting

Note pass/fail per step, the AE version, and any step that succeeded in AE but not through
MCP (or vice versa) — that split localises the defect to the panel script versus the
server. File anything that fails as a backlog item rather than fixing it silently here.
