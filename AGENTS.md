# AE MCP Agent Guide

## Purpose

This repo controls Adobe After Effects through a local MCP server and, when needed, direct ExtendScript against the already running After Effects app.

Read this file as the default operating manual. Do not relearn the repo from source files before handling normal AE tasks.

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
- This repo assumes AE is already open and controlled through the bridge panel, not by manually launching the app for routine work.
- The working AE version for this setup is After Effects `17.7`, which corresponds to `Adobe After Effects 2020`.

## Path Rule

- In this repo, assume the active bridge folder is the OneDrive Documents path:
  - `C:\Users\<user>\OneDrive\Documents\ae-mcp-bridge`
- Do not spend startup time rediscovering the bridge path unless execution fails.
- Treat the non-OneDrive Documents path as a fallback diagnostic clue, not the default operating target.

## AE Version Rule

- Assume the active After Effects app for this repo is `After Effects 17.7`.
- On this machine, that means `Adobe After Effects 2020`.
- Do not search for, target, or launch `Adobe After Effects 2023`, `2024`, `2025`, or `2026` for normal work in this repo.
- If a direct ExtendScript fallback is required, target the already open AE `17.7 / 2020` session only.
- If a script path or executable path is ever needed, prefer the AE 2020 install, not the newest installed version.
- Do not “discover” another AE version just because it exists on disk.

## Default Behavior

- Prefer concrete AE actions over explanations.
- Use the active comp unless the user names a comp.
- Reuse existing layers, nulls, controllers, and expressions when practical.
- Do not rewrite existing expressions unless needed or explicitly requested.
- If a safe default exists, use it and proceed.
- If the request depends on current project state, inspect AE project state first.
- Do not inspect unrelated repo files just to rediscover the normal workflow.
- Do not search for AE installations or manually launch AE unless the user explicitly asks.
- Clean up temporary helper scripts and result files after one-off execution.

## Prompt Interpretation

- `buat comp baru` means create a composition immediately.
- `tambah layer` means add the layer to the named comp, otherwise the active comp.
- `animasikan` means create real keyframes or expressions.
- `render ke media encoder` means queue to Adobe Media Encoder.
- `aktif comp` or `in the active comp` means the current active composition, not a guessed comp name.

## Fast Path

Execute these directly without reopening repo source files just to rediscover parameters:

- create a comp with width, height, duration, frame rate, and background color
- add a text layer with text, color, size, position, and timing
- add a shape layer as rectangle, ellipse, polygon, or star
- add a solid layer or full-frame background
- set basic transform properties:
  - position
  - scale
  - rotation
  - opacity
- add basic transform keyframes
- add a simple expression
- create a camera
- duplicate a layer
- delete a layer
- apply a simple mask
- queue a known comp to render or Adobe Media Encoder

For these task types, assume a usable execution path already exists and act first.
For simple fast-path creation tasks, use the bridge workflow first.

For fast-path requests, do not inspect `src/`, `build/`, `package.json`, `.mcp.json`, `README.md`, or other repo files before the first execution attempt.

## Known Bridge Commands

Treat these bridge commands as already known. Do not reopen repo files just to rediscover their names:

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

For normal AE work, prefer sending bridge commands over reverse-engineering implementation details from repo files.

## Default Parameters

Use these defaults whenever the user does not specify them:

- New composition:
  - duration: `10` seconds
  - frame rate: `30`
  - pixel aspect: `1`
- New text layer:
  - position: center of target comp
  - duration: full comp duration
  - font size: `72`
  - color: white
  - alignment: center
- New shape layer:
  - position: center of target comp
  - duration: full comp duration
  - fill enabled
  - stroke width: `0`
  - default size:
    - rectangle/ellipse: about `35%` of comp width, clamped to a reasonable visible size
    - polygon/star: outer size similar to the rectangle/ellipse default
- New solid/background:
  - full comp size
  - duration: full comp duration
- Basic animation:
  - if user asks for animation but gives no duration, use a simple readable default based on the request
  - for quick loop animations, `2` seconds is the default loop length
- Render queue:
  - use the named comp, otherwise the active comp

These defaults exist to remove hesitation. Apply them and proceed.

## First Attempt Policy

- For a fast-path task, send the command first using the OneDrive bridge folder.
- For simple creation tasks like comp, text, shape, solid, or basic property changes, the first attempt should be through the bridge, not direct ExtendScript.
- Only inspect bridge files or AE project state immediately if:
  - the request depends on existing project context
  - the first execution attempt fails
  - the result is ambiguous
- Do not re-open repo implementation files before the first attempt.

## Execution Preference

- Prefer the MCP bridge workflow for repo-supported actions.
- For deterministic timeline work, direct scripting is acceptable.
- If the MCP tool surface is too low-level or missing one required identifier, do not stop there.
- Fall back to direct ExtendScript against the already open AE session and finish the task.
- Do not jump to direct ExtendScript for a simple bridge-supported task unless the bridge attempt already failed or the needed behavior is clearly outside the current MCP surface.
- Do not treat the source script folder as the primary execution interface for routine work. The primary interface is the bridge command file workflow.

## Fallback Rule

When falling back to direct ExtendScript:

- target the already open AE session
- target AE `17.7 / 2020` only
- prefer comp and layer names when safe
- create a one-off `.jsx` helper only if needed
- write a small explicit success result if useful
- remove the helper and result files afterward

Do not treat this fallback as a setup problem if AE and the bridge panel are already running.

Use this fallback especially for:

- multi-step timeline edits that are easier in one JSX transaction
- shape or animation tasks that need several actions in sequence
- expression or keyframe tasks blocked by missing reusable comp or layer identifiers in the current MCP tool surface

## Bridge Diagnostics

Check the active bridge folder first:

- `ae_command.json`
- `ae_mcp_result.json`

Interpret them like this:

- `pending`: server wrote the command but AE has not picked it up
- `running`: AE picked it up and is executing
- `completed`: command flow likely worked; check result file and AE state
- stale `waiting` result JSON: AE is not writing fresh results back

Additional rules:

- If a command stays `pending`, suspect the server and AE are reading different bridge folders.
- If a command stays `running`, suspect a panel-side execution or UI-refresh failure.
- If `ae_command.json` reaches `completed` but result polling is delayed, do not assume failure immediately.
- Check actual AE state and the latest result file before retrying.
- If the OneDrive bridge folder is healthy, keep using it. Do not bounce back and forth between bridge folders.
- If the panel log shows `ReferenceError: Function panel.update is undefined`, the installed `mcp-bridge-auto.jsx` is outdated for that AE version and should be replaced with the repo's current build.
- After replacing the panel script, close and reopen the panel before retrying commands.

## When To Inspect First

Inspect AE project state first when the request depends on existing context, such as:

- `tambahkan layer di comp tadi`
- `hubungkan ke null yang sudah ada`
- `ubah dropdown controller sebelumnya`
- `render versi project yang kemarin`

This is project-state inspection, not repo-learning.

## Known Good Validations

- Through the bridge:
  - create `Comp_500x400_Ungu`
  - size `500x400`
  - purple background
- Through direct ExtendScript fallback when needed:
  - in `Comp_500x400_Ungu`, create `Star Loop`
  - center it
  - animate `Scale` `0 -> 100 -> 0` over 2 seconds
  - loop with `loopOut('cycle')`

If the first works, bridge pathing and command execution are healthy.
If the second works, direct fallback is healthy even when the bridge tool surface is not enough for the task.

## MCP Gaps To Remember

- The current MCP surface is still missing some production-friendly operations.
- In particular, tasks that combine creation + animation + easing + looping can force the agent to stitch together low-level commands or fall back to JSX.
- The biggest practical gaps are:
  - expression and keyframe flows that require numeric `compIndex` or `layerIndex`
  - not enough high-level animation helpers for common motion tasks
  - not enough single-command actions for “create layer and animate it” requests
- Because of this, adding or improving MCP scripts is the right long-term fix.
- Better MCP coverage will reduce token use, reduce fallback logic, and stop agents from trying to rediscover identifiers on their own.

## Working Rule

If the user gives a normal AE production instruction after you read this file, treat yourself as already onboarded. Execute the task. Only inspect AE project state when the task depends on existing state.
