# After Effects smoke test — footage import, trimmed placement, Time Remap

Manual (or agent-driven) end-to-end check of `importFootage`, `addFootageLayer` and
`setLayerTimeRemap` in a real After Effects session. It maps to the acceptance criteria in
`after-effects-mcp-requirements.md` §5 (AC1–AC6) and the contract in `docs/footage-commands-spec.md`.

Automated coverage (no AE needed) is `npm test`; this checklist covers what only AE can verify.

---

## 0. Prerequisites

| # | Step | Done |
|---|------|------|
| 0.1 | `npm install` (runs the build) or `npm run build`. Confirm `build/index.js` and `build/scripts/mcp-bridge-auto.jsx` are fresh. | ☐ |
| 0.2 | `npm test` passes (AC5). | ☐ |
| 0.3 | `node test/fixtures/generate-fixtures.js` creates `test/fixtures/media/` with `clip_10s.mp4`, `clip_2997.mp4`, `tone_5s.wav`, `still.png` (needs ffmpeg on PATH). | ☐ |
| 0.4 | Copy `build/scripts/mcp-bridge-auto.jsx` into the AE ScriptUI Panels folder (or run `npm run install-bridge`). Windows: `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`. macOS: `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`. Overwrite any older copy. | ☐ |
| 0.5 | AE: *Edit > Preferences > Scripting & Expressions* → enable **Allow Scripts to Write Files and Access Network**. | ☐ |
| 0.6 | Restart AE, open a **new empty project**, open *Window > mcp-bridge-auto.jsx*, tick **Auto-run commands**. | ☐ |
| 0.7 | Restart the MCP client/server so it runs the fresh `build/index.js` (check `listTools` shows `importFootage`, `addFootageLayer`, `setLayerTimeRemap`). | ☐ |

Notation used below:

- `<FX>` = absolute path of `test/fixtures/media` (e.g. `C:\Claude_code\mcp\after-effects-mcp\test\fixtures\media`). In JSON, escape backslashes (`C:\\...`) or use forward slashes.
- Times are seconds; compare numbers with a tolerance of **±0.001 s** unless stated.
- `compIndex` is the 1-based position in the **project item list** (`app.project.item(i)`), not a comp id. After Effects keeps that list sorted like the Project panel (by name), so indices **can shift after every import/folder creation**. Before each step that needs a `compIndex`, re-read it: `run-script {"script":"getProjectInfo"}` → `get-results` → `compIndex` = (position of the comp in `items`) + 1. (`getProjectInfo` lists only the first 50 items.)
- Record ids as you go: `ID_CLIP`, `ID_WAV`, `ID_STILL`, `ID_2997`, `ID_CLIP2`, `C25` (index of "Smoke 25"), `CR` (index of "Smoke Remap"), `COMP25_ID` (comp id of "Smoke 25").
- For every command also watch the panel log: no uncaught ExtendScript error dialog may appear, and the panel must keep processing the next command.

---

## 1. Setup compositions

| Step | MCP call | Expected |
|---|---|---|
| 1.1 | `create-composition {"name":"Smoke 25","width":1920,"height":1080,"frameRate":25,"duration":10}` then `get-results` | Comp "Smoke 25" exists (25 fps, 10 s). |
| 1.2 | `create-composition {"name":"Smoke Remap","width":1920,"height":1080,"frameRate":25,"duration":10}` then `get-results` | Comp "Smoke Remap" exists. |
| 1.3 | `create-composition {"name":"Smoke 23976","width":1920,"height":1080,"frameRate":23.976,"duration":10}` then `get-results` | Comp "Smoke 23976" exists. |

---

## 2. Import (AC1)

| Step | MCP call | Expected result JSON (tool returns it directly; `isError` absent/false) |
|---|---|---|
| 2.1 | `importFootage {"filePath":"<FX>/clip_10s.mp4"}` | `status:"success"`, `footage.name:"clip_10s.mp4"`, `footage.width:1920`, `height:1080`, `duration≈10`, `frameRate:25`, `pixelAspect:1`, `isStill:false`, `hasVideo:true`, `hasAudio:true`, `parentFolder.name` = root (normally "Root"), `alreadyInProject:false`, `existingItemIds:[]`, `folder:null`, `_commandExecuted:"importFootage"`. Item visible in the Project panel. Record `ID_CLIP = footage.id`. |
| 2.2 | `importFootage {"filePath":"<FX>/tone_5s.wav","folderName":"Audio"}` | `footage.hasVideo:false`, `hasAudio:true`, `width:null`, `height:null`, `frameRate:null`, `pixelAspect:null`, `duration≈5`, `isStill:false`; `folder:{name:"Audio",created:true}`; `footage.parentFolder.name:"Audio"`. Folder "Audio" at project root contains the wav. Record `ID_WAV`. |
| 2.3 | `importFootage {"filePath":"<FX>/still.png","folderName":"Stills"}` | `footage.isStill:true`, `duration:0`, `frameRate:null`, `width:1920`, `height:1080`, `hasVideo:true`, `hasAudio:false`; `folder.created:true`. Record `ID_STILL`. |
| 2.4 | `importFootage {"filePath":"<FX>/clip_2997.mp4","folderName":"Video"}` | `footage.frameRate≈29.97`, `duration≈6.006` (180 frames), `hasAudio:false`; `folder:{name:"Video",created:true}`. Record `ID_2997`. |
| 2.5 | `importFootage {"filePath":"<FX>/clip_10s.mp4","folderName":"Video"}` (same file again) | New item (id ≠ `ID_CLIP`) — no de-duplication; `alreadyInProject:true`; `existingItemIds` contains `ID_CLIP`; `folder.created:false` (reuses "Video"). Record `ID_CLIP2`. Project now has two items named `clip_10s.mp4`. |
| 2.6 | Path case (Windows only): `importFootage` with the same path in different letter case, e.g. `"<FX>/CLIP_10S.MP4"` | `alreadyInProject:true`, `existingItemIds` contains `ID_CLIP` and `ID_CLIP2`. (Optional; afterwards delete this extra item manually or leave it.) |

---

## 3. Trimmed placement (AC2)

Re-read `C25` (index of "Smoke 25") via `getProjectInfo` first.

| Step | MCP call | Expected |
|---|---|---|
| 3.1 | `addFootageLayer {"compIndex":C25,"footageId":ID_CLIP,"compStartTime":1,"sourceInPoint":2,"sourceOutPoint":5}` | `status:"success"`; `layer.startTime:-1`, `layer.inPoint:1`, `layer.outPoint:4`, `layer.duration:3`; `computed:{startTime:-1,inPoint:1,outPoint:4,sourceInPoint:2,sourceOutPoint:5}`; `warnings:[]` and **no** `warning` key; `composition.name:"Smoke 25"`, `composition.frameRate:25`. Record `COMP25_ID = composition.id`. |
| 3.1a | *Visual*: in the Timeline, the layer bar spans 0:00:01:00 → 0:00:04:00. Move the CTI to **1 s**: the burned-in timecode reads **00:00:02:00 / 00:00:02.000** (source 2 s shown at comp 1 s). At the last visible frame (3.96 s) it reads 00:00:04:24. Before 1 s and from 4 s on, the layer is not visible. Audio (1 kHz) plays only between 1 s and 4 s. | |
| 3.1b | Open "Smoke 25" so it is the active comp, then `run-script {"script":"getLayerInfo"}` → `get-results` (it reads the **active** comp and reports `inPoint`/`outPoint` only; run it now, before the audio layer of 3.4 exists — it reads `Position` on every layer). In AE enable the Timeline columns *In / Out / Duration* (right-click the column header → *Columns*); Start is visible as the ghosted (trimmed) head of the layer bar, which begins at −1 s. | In = 1 s, Out = 4 s, Duration = 3 s, Start = −1 s — matches computed values (AC2). |
| 3.2 | `addFootageLayer {"compIndex":C25,"footageId":ID_STILL,"compStartTime":0}` | `footage.isStill:true`; `layer.inPoint:0`, `layer.outPoint:5`, `layer.duration:5`, `layer.startTime:0`; `warnings:[]`. Layer bar 0 s → 5 s. |
| 3.3 | `addFootageLayer {"compIndex":C25,"footageId":ID_STILL,"compStartTime":8,"position":[400,300]}` | `layer.inPoint:8`, `layer.outPoint:13` (beyond comp end is allowed); `warnings` = `[{code:"OUT_BEYOND_COMP_END",...}]`; `warning` string present; `layer.position:[400,300]` (a z of 0 may be appended). |
| 3.4 | `addFootageLayer {"compIndex":C25,"footageId":ID_WAV,"compStartTime":0,"position":[100,100]}` | Success; `layer.hasVideo:false`; `layer.position:null`; `warnings` contains `POSITION_IGNORED_AUDIO_ONLY`; `layer.outPoint:5`. |
| 3.5 | `addFootageLayer {"compIndex":C25,"footageId":ID_2997,"compStartTime":2,"sourceInPoint":1,"sourceOutPoint":3}` (29.97 fps source in a 25 fps comp) | `layer.startTime:1`, `inPoint:2`, `outPoint:4`; no `AE_ADJUSTED_TIMES`. Visual: at comp 2 s the burn-in reads ≈00:00:01.001 (frame 30). |
| 3.6 | `addFootageLayer {"compIndex":C25,"footageName":"still.png","compStartTime":-2}` | Resolves by name. `layer.inPoint:-2`, `outPoint:3`; `warnings` contains `IN_BEFORE_COMP_START`. |
| 3.7 | Re-read the index of "Smoke 23976" (`C23`). `addFootageLayer {"compIndex":C23,"footageId":ID_CLIP,"compStartTime":1,"sourceInPoint":0.5,"sourceOutPoint":2.5}` | Frame-snapped: `inPoint≈1.001`, `outPoint≈3.003`, `startTime≈0.501`, `computed.sourceOutPoint≈2.502` (spec P39). `warnings` must **not** contain `AE_ADJUSTED_TIMES` — if it does, record the computed-vs-actual message (verifies spec §13 uncertain fact 2). |
| 3.8 | Undo: *Edit > Undo MCP: Add Footage Layer* once. | Exactly the last layer from 3.7 disappears (one undo step per command). Redo it (or leave it). |

---

## 4. Time Remap (AC3)

Re-read `CR` (index of "Smoke Remap").

| Step | MCP call | Expected |
|---|---|---|
| 4.1 | `addFootageLayer {"compIndex":CR,"footageId":ID_CLIP,"compStartTime":0}` | Full clip: `inPoint:0`, `outPoint:10`, `layer.index:1`. |
| 4.2 | `setLayerTimeRemap {"compIndex":CR,"layerIndex":1,"keyframes":[{"timeInSeconds":3,"sourceTimeInSeconds":5},{"timeInSeconds":1,"sourceTimeInSeconds":0},{"timeInSeconds":6,"sourceTimeInSeconds":6}]}` | `status:"success"`; `timeRemapWasEnabled:false`; `autoKeyframesRemoved:2` (AE's default keys at 0 and at the end are gone); `keyframesAdded:3`; `keyframesReplaced:0`; `keyframes` = exactly `[{1,0},{3,5},{6,6}]` in ascending time (input order was unsorted); `warnings:[]`. |
| 4.2a | *Visual*: select the layer, press **RR** to reveal Time Remap → 3 keyframes at 1 s, 3 s, 6 s. Open the **Graph Editor**: a value/speed curve through the 3 keys is shown (fast 1→3 s, slow 3→6 s). Burn-in: comp 1 s → 00:00:00, comp 3 s → 00:00:05, comp 6 s → 00:00:06; before 1 s it holds 00:00:00. | |
| 4.3 | Merge: `setLayerTimeRemap {"compIndex":CR,"layerIndex":1,"keyframes":[{"timeInSeconds":3.0004,"sourceTimeInSeconds":4},{"timeInSeconds":8,"sourceTimeInSeconds":9}]}` | `timeRemapWasEnabled:true`; `autoKeyframesRemoved:0`; `keyframesReplaced:1` (3.0004 is within 1 ms of the key at 3 s, which is replaced); `keyframesAdded:1`; `keyframes` = `[{1,0},{3,4},{6,6},{8,9}]` (the replaced key keeps time 3). |
| 4.4 | `setLayerTimeRemap {"compIndex":CR,"layerIndex":1,"keyframes":[{"timeInSeconds":12,"sourceTimeInSeconds":2}]}` | Success with `warnings` containing `KEY_OUTSIDE_LAYER_RANGE` (layer ends at 10 s). Then *Edit > Undo MCP: Set Time Remap* removes that key in one step. |

---

## 5. Error handling (AC4)

Each call must return `status:"error"` with the listed `code`, the MCP result `isError:true`, the
panel must stay responsive, and no undo entry may be created. "Node" = rejected by the MCP server
before AE is contacted; "run-script" rows bypass Node validation to exercise the jsx checks — read
their result with `get-results`.

| Step | Call | Expected `code` (and fields) |
|---|---|---|
| 5.1 | `importFootage {"filePath":"<FX>/missing.mp4"}` | Node: `FILE_NOT_FOUND` |
| 5.2 | `importFootage {"filePath":"clip_10s.mp4"}` (relative) | Node: `INVALID_ARGS` |
| 5.3 | `importFootage {"filePath":"<FX>"}` (a folder) | Node: `NOT_A_FILE` |
| 5.4 | `run-script {"script":"importFootage","parameters":{"filePath":"<FX>/missing.mp4"}}` → `get-results` | jsx: `FILE_NOT_FOUND` |
| 5.5 | `run-script {"script":"importFootage","parameters":{"filePath":"<FX>/still.png","folderName":""}}` → `get-results` | jsx: `INVALID_ARGS` (folderName) |
| 5.6 | `addFootageLayer {"compIndex":999,"footageId":ID_CLIP,"compStartTime":0}` | `COMP_NOT_FOUND` |
| 5.7 | `addFootageLayer {"compIndex":<index of clip_10s.mp4 item>,"footageId":ID_CLIP,"compStartTime":0}` | `NOT_A_COMP` (message names the item type, e.g. FootageItem) |
| 5.8 | `run-script {"script":"addFootageLayer","parameters":{"compIndex":"abc","footageId":ID_CLIP,"compStartTime":0}}` → `get-results` | jsx: `INVALID_ARGS` (compIndex) |
| 5.9 | `addFootageLayer {"compIndex":C25,"footageId":999999,"compStartTime":0}` | `FOOTAGE_NOT_FOUND` |
| 5.10 | `addFootageLayer {"compIndex":C25,"footageId":COMP25_ID,"compStartTime":0}` | `NOT_FOOTAGE` |
| 5.11 | `addFootageLayer {"compIndex":C25,"footageId":ID_CLIP,"footageName":"clip_10s.mp4","compStartTime":0}` | Node: `INVALID_ARGS` (exactly one selector) |
| 5.12 | `addFootageLayer {"compIndex":C25,"footageId":ID_CLIP,"compStartTime":0,"sourceOutPoint":12}` | `OUT_EXCEEDS_DURATION`, `field:"sourceOutPoint"` |
| 5.13 | `addFootageLayer {"compIndex":C25,"footageId":ID_CLIP,"compStartTime":0,"sourceInPoint":5,"sourceOutPoint":4}` | Node: `INVALID_ARGS` |
| 5.14 | `run-script {"script":"addFootageLayer","parameters":{"compIndex":C25,"footageId":ID_CLIP,"compStartTime":0,"sourceInPoint":5,"sourceOutPoint":4}}` → `get-results` | jsx: `IN_NOT_BEFORE_OUT`, `field:"sourceOutPoint"` |
| 5.15 | `addFootageLayer {"compIndex":C25,"footageName":"clip_10s.mp4","compStartTime":0}` | `AMBIGUOUS_FOOTAGE_NAME`; message lists both ids (`ID_CLIP`, `ID_CLIP2`) and suggests footageId |
| 5.16 | `addFootageLayer {"compIndex":C25,"footageName":"nope.mp4","compStartTime":0}` | `FOOTAGE_NOT_FOUND` |
| 5.17 | `run-script {"script":"createTextLayer","parameters":{"compName":"Smoke Remap","text":"TXT"}}` → `get-results`; then `setLayerTimeRemap {"compIndex":CR,"layerIndex":1,"keyframes":[{"timeInSeconds":0,"sourceTimeInSeconds":0}]}` (text layer is now layer 1) | `NO_FOOTAGE_SOURCE` |
| 5.18 | `setLayerTimeRemap` on the still layer from 3.2 in "Smoke 25" (find its layer index in the Timeline) with `[{"timeInSeconds":0,"sourceTimeInSeconds":0}]` | `TIME_REMAP_NOT_SUPPORTED` (if AE instead reports `AE_ERROR`, record it: spec §13 uncertain fact 4) |
| 5.19 | `setLayerTimeRemap {"compIndex":CR,"layerIndex":99,"keyframes":[{"timeInSeconds":0,"sourceTimeInSeconds":0}]}` | `LAYER_NOT_FOUND` |
| 5.20 | `setLayerTimeRemap {"compIndex":CR,"layerIndex":2,"keyframes":[{"timeInSeconds":0,"sourceTimeInSeconds":11}]}` (footage layer, 10 s source) | `SOURCE_TIME_OUT_OF_RANGE`, `index:0`, `field:"sourceTimeInSeconds"` |
| 5.21 | `setLayerTimeRemap {"compIndex":CR,"layerIndex":2,"keyframes":[{"timeInSeconds":1,"sourceTimeInSeconds":0},{"timeInSeconds":1.0004,"sourceTimeInSeconds":2}]}` | `DUPLICATE_TIME`, `index:1` |
| 5.22 | `setLayerTimeRemap {"compIndex":CR,"layerIndex":2,"keyframes":[]}` | Node/zod rejection (error result or rejected call); nothing reaches AE |
| 5.23 | Untick **Auto-run commands**, call `addFootageLayer {"compIndex":C25,"footageId":ID_CLIP,"compStartTime":0}` | After ~8 s: non-error text containing `Timed out`, `get-results` and `addFootageLayer`. Re-tick Auto-run: the queued command executes; `get-results` shows its success JSON. Undo it afterwards. |
| 5.24 | After 5.1–5.23, repeat step 3.2 on "Smoke 25" | Still succeeds (panel survived all errors). |

---

## 6. Documentation (AC6)

| Step | Check | Expected |
|---|---|---|
| 6.1 | `get-help` tool output | Mentions `importFootage`, `addFootageLayer`, `setLayerTimeRemap`, stills 5 s default, 1 ms tolerance / frame snapping, Time Remap replace vs merge, and that `compIndex` is the project item index. |
| 6.2 | `mcp_aftereffects_get_effects_help` | Contains a pointer to `get-help` for footage/Time Remap. |
| 6.3 | `README.md` | Documents the three tools with parameters and examples. |

---

## 7. Results

Tester: ____________  Date: __________  AE version: __________  OS: __________  Commit: __________

| Step | AC | Pass/Fail | Notes (actual values, screenshots, deviations) |
|---|---|---|---|
| 0.1–0.7 | – | | |
| 2.1 import mp4 | AC1 | | |
| 2.2 import wav + folder | AC1 | | |
| 2.3 import png + folder | AC1 | | |
| 2.4 import 29.97 mp4 | AC1 | | |
| 2.5 re-import (alreadyInProject) | AC1 | | |
| 2.6 path case (Windows) | AC1 | | |
| 3.1 trimmed range 2–5 s at 1 s | AC2 | | |
| 3.1a burn-in 00:02 at comp 1 s | AC2 | | |
| 3.1b AE In/Out/Start match | AC2 | | |
| 3.2 still default 5 s | AC2 | | |
| 3.3 still beyond comp end + position | AC2 | | |
| 3.4 audio + position warning | AC2 | | |
| 3.5 29.97 source in 25 fps comp | AC2 | | |
| 3.6 footageName + negative start | AC2 | | |
| 3.7 23.976 frame snapping | AC2 | | |
| 3.8 single undo step | AC2 | | |
| 4.1 full clip layer | AC3 | | |
| 4.2 remap enable, 3 keys | AC3 | | |
| 4.2a Graph Editor curve / burn-in | AC3 | | |
| 4.3 merge (replace + add) | AC3 | | |
| 4.4 key outside layer range + undo | AC3 | | |
| 5.1–5.3 import Node errors | AC4 | | |
| 5.4–5.5 import jsx errors | AC4 | | |
| 5.6–5.8 bad compIndex | AC4 | | |
| 5.9–5.11 bad footageId / selector | AC4 | | |
| 5.12–5.14 sourceOutPoint / in≥out | AC4 | | |
| 5.15–5.16 ambiguous / unknown name | AC4 | | |
| 5.17 remap on text layer | AC4 | | |
| 5.18 remap on still | AC4 | | |
| 5.19–5.22 remap arg errors | AC4 | | |
| 5.23 timeout + get-results | AC4 | | |
| 5.24 panel still alive | AC4 | | |
| npm test (0.2) | AC5 | | |
| 6.1–6.3 docs | AC6 | | |
