# AE MCP Agent Guide

## Purpose

This repo controls Adobe After Effects through the local MCP bridge and, when needed, direct ExtendScript against the already running app.

Read this file as the default operating guide.
Do not rediscover the repo from source files before handling normal AE work.

## Core Model

- MCP server entrypoint: `build/index.js`
- Standard scripts:
  - `npm run build`
  - `npm start`
  - `npm run install-bridge`
- Normal execution path:
  - Codex calls the local MCP server
  - the server writes bridge files into the user's Documents folder under `ae-mcp-bridge`
  - `mcp-bridge-auto.jsx` inside After Effects polls that folder
  - After Effects executes the queued command and writes the result back
- This repo assumes AE is already open and controlled through the bridge panel.
- The working AE version for this setup is After Effects `17.7`, which corresponds to `Adobe After Effects 2020`.

## Related Docs

- capability catalog: `docs/plansv2/01-capability-catalog.md`
- prompt examples: `docs/ae-mcp/AE_MCP_PROMPT_GUIDE.md`
- phase reports: `docs/plansv2/reports/`

## Path Rule

- Assume the active bridge folder is:
  - `C:\Users\<user>\OneDrive\Documents\ae-mcp-bridge`
- Do not spend startup time rediscovering the bridge path unless execution fails.

## AE Version Rule

- Assume the active app is `After Effects 17.7 / Adobe After Effects 2020`.
- Do not target newer AE versions for normal work in this repo.
- If direct ExtendScript fallback is required, target the already open AE `17.7 / 2020` session only.

## Default Behavior

- Prefer concrete AE actions over explanations.
- Use the active comp unless the user names a comp.
- Reuse existing layers, nulls, controllers, and expressions when practical.
- Do not rewrite existing expressions unless needed or explicitly requested.
- If a safe default exists, use it and proceed.
- If the request depends on current project state, inspect AE project state first.
- Do not inspect unrelated repo files just to rediscover the workflow.
- Do not search for AE installations or manually launch AE unless explicitly asked.
- Clean up temporary helper scripts and result files after one-off execution.

## Routing Rule

For normal AE production work, choose execution in this order:

1. use a v2 wrapper if one exists
2. use an existing low-level MCP tool if the task is simple and direct
3. use a curated direct ExtendScript transaction if the workflow is multi-step but already clear
4. write fresh ad-hoc ExtendScript only if no safe wrapper or existing fallback can complete the task

Do not spend tokens rediscovering old ScriptUI panel files if a wrapper already covers the task.

## Prompt Interpretation

- `buat comp baru` means create a composition immediately.
- `tambah layer` means add the layer to the named comp, otherwise the active comp.
- `animasikan` means create real keyframes or expressions.
- `render ke media encoder` means queue to Adobe Media Encoder.
- `aktif comp` or `in the active comp` means the current active composition.

## Fast Path

Execute these directly without reopening repo files just to rediscover parameters:

- create a comp with width, height, duration, frame rate, and background color
- add a text layer with text, color, size, position, and timing
- add a shape layer as rectangle, ellipse, polygon, or star
- add a solid layer or full-frame background
- set basic transform properties
- add basic transform keyframes
- add a simple expression
- create a camera
- duplicate a layer
- delete a layer
- apply a simple mask
- enable motion blur
- sequence layer position
- copy selected paths to masks
- setup typewriter text
- create a timer rig
- apply BW tint
- create a dropdown controller
- link opacity to a dropdown
- cleanup keyframes on selected properties
- setup retiming mode on selected properties
- queue a known comp to render or Adobe Media Encoder

For these task types, assume a usable execution path already exists and act first.

## Known Tools

Low-level bridge commands:

- `createComposition`
- `createShapeLayer`
- `createTextLayer`
- `createSolidLayer`
- `setLayerProperties`
- `setLayerKeyframe`
- `setLayerExpression`
- `getProjectInfo`
- `listCompositions`
- `getLayerInfo`

High-value wrappers:

- `enable-motion-blur`
- `sequence-layer-position`
- `copy-paths-to-masks`
- `setup-typewriter-text`
- `create-timer-rig`
- `apply-bw-tint`
- `cleanup-keyframes`
- `setup-retiming-mode`
- `create-dropdown-controller`
- `link-opacity-to-dropdown`

## Preferred Targeting

- prefer active comp when the user does not name a comp
- prefer `compName` over numeric `compIndex`
- prefer `layerName` or selected layers over numeric `layerIndex`
- for selected-path and selected-property workflows, confirm the active comp context first

## Default Parameters

Use these defaults whenever the user does not specify them:

- new composition:
  - duration: `10`
  - frame rate: `30`
  - pixel aspect: `1`
- new text layer:
  - position: center of target comp
  - duration: full comp duration
  - font size: `72`
  - color: white
  - alignment: center
- new shape layer:
  - position: center of target comp
  - duration: full comp duration
  - fill enabled
  - stroke width: `0`
- new solid/background:
  - full comp size
  - duration: full comp duration
- quick loop animation:
  - default loop length: `2` seconds

## First Attempt Policy

- For a fast-path task, send the command first using the OneDrive bridge folder.
- For simple creation tasks, the first attempt should be through the bridge, not direct ExtendScript.
- Only inspect bridge files or AE project state immediately if:
  - the request depends on existing project context
  - the first execution attempt fails
  - the result is ambiguous

## Fallback Rule

When falling back to direct ExtendScript:

- target the already open AE session
- target AE `17.7 / 2020` only
- prefer comp and layer names when safe
- create a one-off `.jsx` helper only if needed
- write a small explicit success result if useful
- remove the helper and result files afterward

Do not treat fallback as a setup problem if AE and the bridge panel are already running.

## Bridge Diagnostics

Check the active bridge folder first:

- `ae_command.json`
- `ae_mcp_result.json`

Interpret them like this:

- `pending`: server wrote the command but AE has not picked it up
- `running`: AE picked it up and is executing
- `completed`: command flow likely worked; check result file and AE state
- stale `waiting` result JSON: AE is not writing fresh results back

## When To Inspect First

Inspect AE project state first when the request depends on existing context, such as:

- `tambahkan layer di comp tadi`
- `hubungkan ke null yang sudah ada`
- `ubah dropdown controller sebelumnya`
- `render versi project yang kemarin`

## Remaining Gaps

- render and Media Encoder flows are still not first-class wrapper tools
- some effect workflows remain lower-level than the new v2 wrappers
- runtime AE validation is still the required final check for newly added wrappers

## Working Rule

If the user gives a normal AE production instruction after you read this file, treat yourself as already onboarded and execute the task.
