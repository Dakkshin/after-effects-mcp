# AE MCP Agent Guide

## Purpose

This repository controls Adobe After Effects through a local MCP server and, when needed, direct ExtendScript execution against the installed After Effects app.

After reading this file, a new agent should already understand:
- how this repo connects to After Effects
- how to interpret normal AE requests
- what defaults to assume
- when inspection is still necessary

The goal is simple: a new agent should not need to learn the repo from zero before handling routine AE work.

## Connection Model

- The MCP server entrypoint is `build/index.js`.
- The repo includes `.mcp.json` pointing to this local build.
- Standard repo scripts:
  - `npm run build`
  - `npm start`
  - `npm run install-bridge`
- This setup assumes Adobe After Effects is installed on the local machine.
- Some actions may be more reliable through direct ExtendScript execution against `AfterFX.com` than through the bridge.

This means the agent does not need to inspect the repo just to determine whether AE control is available. It is available in this project.

## Default Operating Rules

- Prefer concrete AE actions over abstract explanations.
- Use the active comp unless the user explicitly names a comp.
- Reuse existing layers, nulls, controllers, and expressions when possible.
- Do not rewrite existing expressions unless the user explicitly asks or the task requires it.
- Clean up one-off helper scripts and result files after execution.
- If a request is ambiguous but a safe default exists, use the default and proceed.
- If a request depends on current project state, inspect the active AE project instead of guessing.
- Do not inspect unrelated repo files just to rediscover the normal AE workflow.

## What This File Replaces

This file should remove the need for a new agent to inspect repo files just to learn:
- what this repo is for
- how AE is controlled
- what the default workflow is
- what naming conventions are expected

The agent may still inspect the current After Effects project state for:
- existing comps
- existing layer names
- controller and effect names
- expressions already present

That is project-state inspection, not repo-learning.

## Prompt Interpretation Rules

- `buat comp baru` means create a composition immediately in After Effects.
- `tambah layer` means add the layer to the named comp, otherwise to the active comp.
- `animasikan` means create actual keyframes or expressions, not just describe the animation.
- `render ke media encoder` means queue to Adobe Media Encoder, not open AME unless explicitly requested.
- `aktif comp` or `in the active comp` means the current AE active composition, not a guessed comp by name.

## Preferred Execution Style

- For deterministic timeline actions, direct scripting is acceptable.
- For reusable repo-supported actions, prefer the AE MCP server workflow.
- For user-facing results, do the work first, then report what changed.
- Avoid asking for confirmation when the target comp or layer can be discovered safely.
- If the request is routine and executable, act first instead of proposing a plan.

## When To Inspect Before Acting

Inspect first if the task depends on existing project state, such as:
- `tambahkan layer di comp tadi`
- `hubungkan ke null yang sudah ada`
- `ubah dropdown controller sebelumnya`
- `render versi project yang kemarin`

Do not inspect the repo just to rediscover the general workflow. Use this file for that.

## Common Good Requests

- `Create a composition named Intro, 1920x1080, 5 seconds, 30 fps.`
- `In the active comp, add a centered text layer that says Hello.`
- `Buat animasi bouncing ball 5 detik di TestComp.`
- `Queue comp preview to Adobe Media Encoder.`

## Working Rule

If the user gives a normal AE production instruction after you read this file, treat yourself as already onboarded. Execute the request, and only inspect the active AE project when the task depends on existing state.
