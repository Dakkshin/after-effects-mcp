# 🎬 After Effects MCP Server

![Node.js](https://img.shields.io/badge/node-%3E=14.x-brightgreen.svg)
![Build](https://img.shields.io/badge/build-passing-success)
![License](https://img.shields.io/github/license/Dakkshin/after-effects-mcp)
![Platform](https://img.shields.io/badge/platform-after%20effects-blue)

✨ A Model Context Protocol (MCP) server for Adobe After Effects that enables AI assistants and other applications to control After Effects through a standardized protocol.

<a href="https://glama.ai/mcp/servers/@Dakkshin/after-effects-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Dakkshin/after-effects-mcp/badge" alt="mcp-after-effects MCP server" />
</a>

## Table of Contents
- [Features](#features)
  - [Core Composition Features](#core-composition-features)
  - [Layer Management](#layer-management)
  - [Animation Capabilities](#animation-capabilities)
  - [Footage & Editing](#footage--editing)
- [Setup Instructions](#setup-instructions)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Update MCP Config](#Update-MCP-Config)
  - [Running the Server](#running-the-server)
- [Usage Guide](#usage-guide)
  - [Creating Compositions](#creating-compositions)
  - [Working with Layers](#working-with-layers)
  - [Animation](#animation)
  - [Footage Editing: Cut List Example](#footage-editing-cut-list-example)
- [Available MCP Tools](#available-mcp-tools)
- [For Developers](#for-developers)
  - [Project Structure](#project-structure)
  - [Building the Project](#building-the-project)
  - [Running Tests](#running-tests)
  - [Contributing](#contributing)
- [License](#license)

## 📦 Features

### 🎥 Core Composition Features
- **Create compositions** with custom settings (size, frame rate, duration, background color)
- **List all compositions** in a project
- **Get project information** such as frame rate, dimensions, and duration

### 🧱 Layer Management
- **Create text layers** with customizable properties (font, size, color, position)
- **Create shape layers** (rectangle, ellipse, polygon, star) with colors and strokes
- **Create solid/adjustment layers** for backgrounds and effects
- **Create camera layers** with configurable zoom and position
- **Create null objects** for animation control
- **Modify layer properties** like position, scale, rotation, opacity, timing
- **Toggle 2D/3D mode** for layers
- **Set blend modes** (normal, multiply, screen, etc.)
- **Track matte** support (alpha, luma, inverted)
- **Duplicate layers** with optional rename
- **Delete layers** from composition
- **Create/modify masks** with feather, expansion, and opacity

### 🌀 Animation Capabilities
- **Set keyframes** for layer properties (Position, Scale, Rotation, Opacity, etc.)
- **Apply expressions** to layer properties for dynamic animations
- **Batch set properties** across multiple layers at once

### 🎞 Footage & Editing
- **Import footage** (video, audio, stills) by absolute local path, optionally into a root-level Project panel folder (`importFootage`)
- **Place trimmed clips** on a composition timeline: choose the source in/out range and the comp time where the clip starts (`addFootageLayer`)
- **Frame-accurate timing**: layer times snap to the comp frame grid; stills default to 5 s
- **Speed ramps** with Time Remap keyframes that map comp time to source time (`setLayerTimeRemap`)
- **Structured results**: errors come back as `status: "error"` with a machine-readable `code`; non-fatal issues are listed in `warnings`
- **Waits for After Effects**: these tools return the AE result directly (no separate `get-results` call unless AE is slow)

## ⚙️ Setup Instructions

### 🛠 Prerequisites
- Adobe After Effects (2022 or later)
- Node.js (v14 or later)
- npm or yarn package manager

### 📥 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Dakkshin/after-effects-mcp.git
   cd after-effects-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Build the project**
   ```bash
   npm run build
   # or
   yarn build
   ```

4. **Install the After Effects panel**
   ```bash
   npm run install-bridge
   # or
   yarn install-bridge
   ```
   This will copy the necessary scripts to your After Effects installation.

### 🔧 Update MCP Config

#### Option 1: Using .mcp.json (Recommended for Claude Code)
The repository includes a `.mcp.json` file for easy configuration. Copy or reference it in your MCP settings:

```json
{
  "mcpServers": {
    "AfterEffectsMCP": {
      "command": "node",
      "args": ["PATH/TO/after-effects-mcp/build/index.js"]
    }
  }
}
```

#### Option 2: Manual Configuration
Go to your client (e.g., Claude or Cursor) and update your config file:

```json
{
  "mcpServers": {
    "AfterEffectsMCP": {
      "command": "node",
      "args": ["C:\\Users\\Dakkshin\\after-effects-mcp\\build\\index.js"]
    }
  }
}
```

### ▶️ Running the Server

1. **Start the MCP server**
   ```bash
   npm start
   # or
   yarn start
   ```

2. **Open After Effects**

3. **Open the MCP Bridge Auto panel**
   - In After Effects, go to Window > mcp-bridge-auto.jsx
   - The panel will automatically check for commands every few seconds
   - Make sure the "Auto-run commands" checkbox is enabled

## 🚀 Usage Guide

Once you have the server running and the MCP Bridge panel open in After Effects, you can control After Effects through the MCP protocol. This allows AI assistants or custom applications to send commands to After Effects.

### 📘 Creating Compositions

You can create new compositions with custom settings:
- Name
- Width and height (in pixels)
- Frame rate
- Duration
- Background color

Example MCP tool usage (for developers):
```javascript
mcp_aftereffects_create_composition({
  name: "My Composition", 
  width: 1920, 
  height: 1080, 
  frameRate: 30,
  duration: 10
});
```

### ✍️ Working with Layers

You can create and modify different types of layers:

**Text layers:**
- Set text content, font, size, and color
- Position text anywhere in the composition
- Adjust timing and opacity

**Shape layers:**
- Create rectangles, ellipses, polygons, and stars
- Set fill and stroke colors
- Customize size and position

**Solid layers:**
- Create background colors
- Make adjustment layers for effects

### 🕹 Animation

You can animate layers with:

**Keyframes:**
- Set property values at specific times
- Create motion, scaling, rotation, and opacity changes
- Control the timing of animations

**Expressions:**
- Apply JavaScript expressions to properties
- Create dynamic, procedural animations
- Connect property values to each other

### 🎞 Footage Editing: Cut List Example

`importFootage`, `addFootageLayer` and `setLayerTimeRemap` let you assemble an edit from a pre-computed cut list: import the sources, place each shot trimmed to its source range, then retime shots with Time Remap. Example cut list for a 12 s, 25 fps comp called "Trailer" (created with `create-composition`):

| Shot | Source file      | Source in → out (s) | Comp start (s) | Comp span (s) | Notes                                   |
|------|------------------|---------------------|----------------|---------------|-----------------------------------------|
| 1    | `interview.mp4`  | 12.0 → 15.0         | 0              | 0 – 3         |                                         |
| 2    | `broll_city.mp4` | 3.0 → 7.0           | 3              | 3 – 7         | Speed ramp: 2× for 1 s, then slow motion |
| 3    | `logo.png`       | still               | 7              | 7 – 12        | Stills default to 5 s; centered         |

**1. Import the sources** with `importFootage`, one call per file (absolute local path; `folderName` is optional and is created at the project root if missing):
```json
{ "filePath": "D:/footage/interview.mp4", "folderName": "Sources" }
```
The result contains the new item's id; use it as `footageId` later (ids below are examples):
```json
{
  "status": "success",
  "message": "Footage imported successfully",
  "footage": { "id": 12, "name": "interview.mp4", "width": 1920, "height": 1080, "duration": 42.5, "frameRate": 25, "isStill": false },
  "alreadyInProject": false,
  "existingItemIds": [],
  "folder": { "id": 11, "name": "Sources", "created": true }
}
```
Import `broll_city.mp4` (id 13) and `logo.png` (id 14) the same way.

**2. Find the comp's `compIndex`.** `compIndex` is the 1-based position of the comp in the project item list, not the comp id, and it can change after imports or new folders. Re-read it right before placing shots: `run-script` with `{ "script": "getProjectInfo" }`, then `get-results`; `compIndex` = position of "Trailer" in `items` + 1. Here it is `1`.

**3. Place the shots** with `addFootageLayer`. At `compStartTime` the layer shows the source frame at `sourceInPoint`, and it ends at `compStartTime + (sourceOutPoint - sourceInPoint)`:
```json
{ "compIndex": 1, "footageId": 12, "compStartTime": 0, "sourceInPoint": 12, "sourceOutPoint": 15 }
```
```json
{ "compIndex": 1, "footageId": 13, "compStartTime": 3, "sourceInPoint": 3, "sourceOutPoint": 7 }
```
```json
{ "compIndex": 1, "footageName": "logo.png", "compStartTime": 7, "position": [960, 540] }
```
Each result reports the new layer and the times After Effects actually applied, e.g. for shot 2:
```json
{
  "status": "success",
  "layer": { "index": 1, "name": "broll_city.mp4", "startTime": 0, "inPoint": 3, "outPoint": 7, "duration": 4 },
  "computed": { "startTime": 0, "inPoint": 3, "outPoint": 7, "sourceInPoint": 3, "sourceOutPoint": 7 },
  "warnings": []
}
```
New layers go on top (index 1), so after shot 3 is placed, shot 2 is layer 2.

**4. Speed-ramp shot 2** with `setLayerTimeRemap`. Each keyframe maps a comp time to the source time shown at that moment: source 3 → 5 s plays in 1 s (2×), then source 5 → 7 s stretches over 3 s (slow motion):
```json
{
  "compIndex": 1,
  "layerIndex": 2,
  "keyframes": [
    { "timeInSeconds": 3, "sourceTimeInSeconds": 3 },
    { "timeInSeconds": 4, "sourceTimeInSeconds": 5 },
    { "timeInSeconds": 7, "sourceTimeInSeconds": 7 }
  ]
}
```
The result lists every Time Remap keyframe on the layer after the call; the curve is visible in the Graph Editor.

**Things to know**
- **`compIndex`** is the position in the project item list (`app.project.item(i)`), not the comp id. After Effects appears to keep that list sorted by name, so indices may shift after `importFootage` or when a folder is created; re-read them with `getProjectInfo` (it lists the first 50 items).
- **`footageId`** comes from the `importFootage` result (or from `getProjectInfo`). `footageName` works too, but fails with `AMBIGUOUS_FOOTAGE_NAME` if several footage items share the name.
- **Defaults and tolerances:** `sourceInPoint` defaults to 0 and `sourceOutPoint` to the full source duration; stills default to 5 s and may be extended freely. A `sourceOutPoint` up to 1 ms past the end of the source is clamped; more is an `OUT_EXCEEDS_DURATION` error. Layer times snap to the comp frame grid, and `computed` vs `layer` in the result shows both.
- **Time Remap:** if the call turns Time Remap on, After Effects' two automatic keyframes are removed and only yours remain. If Time Remap was already on, your keys are merged with the existing ones. A key within 1 ms of an existing key replaces it. Source times must be between 0 and the source duration.
- **No de-duplication:** `importFootage` always creates a new project item; `alreadyInProject` and `existingItemIds` tell you whether the same file was already imported.
- **Waiting:** these tools wait for After Effects (up to 20 s for `importFootage`, 8 s for the others). If AE has not answered in time you get a "Timed out … get-results" message rather than an error; the command is still queued, so call `get-results` before sending anything else.
- **One command at a time:** the bridge uses a single command file, so send commands sequentially. A new command overwrites one that After Effects has not picked up yet.

## 🛠 Available MCP Tools

| Command                     | Description                            |
|-----------------------------|----------------------------------------|
| `create-composition`        | Create a new composition               |
| `run-script`                | Run a JS script inside AE              |
| `get-results`               | Get script results                     |
| `get-help`                  | Help for available commands            |
| `setLayerKeyframe`          | Add keyframe to layer property         |
| `setLayerExpression`        | Add/remove expressions from properties|
| `setLayerProperties`        | Set layer properties (position, scale, rotation, opacity, blendMode, threeDLayer, trackMatteType, enabled, etc.) |
| `batchSetLayerProperties`  | Apply properties to multiple layers   |
| `getLayerInfo`              | Get layer info (position, 3D status)  |
| `createCamera`              | Create camera layer                   |
| `createNullObject`          | Create null object for animation      |
| `duplicateLayer`            | Duplicate a layer                     |
| `deleteLayer`               | Delete a layer                        |
| `setLayerMask`              | Create/modify layer masks             |
| `importFootage`             | Import a local video/audio/image file by absolute path (optional Project folder); returns footage id, size and duration |
| `addFootageLayer`           | Place footage on a comp timeline, trimmed to a source in/out range, starting at a given comp time |
| `setLayerTimeRemap`         | Set Time Remap keyframes (comp time → source time) for speed ramps |

## 👨‍💻 For Developers

### 🧩 Project Structure

- `src/index.ts`: MCP server implementation
- `src/scripts/mcp-bridge-auto.jsx`: Main After Effects panel script
- `install-bridge.js`: Script to install the panel in After Effects
- `test/`: automated tests (`node:test`) and the manual After Effects smoke test checklist (`test/AE_SMOKE_TEST.md`)
- `docs/footage-commands-spec.md`: interface contract for the footage commands

### 📦 Building the Project

```bash
npm run build
# or
yarn build
```

**Note:** This project uses esbuild for fast builds, replacing the previous TypeScript compiler approach that could run out of memory on larger codebases.

### 🧪 Running Tests

```bash
npm test
```

This builds the project first (`pretest`), then runs the `node:test` suites in `test/`: unit tests for the pure timing functions extracted from `mcp-bridge-auto.jsx` (run in an ES3-like sandbox), static checks of the bridge script and `src/index.ts`, and an MCP integration test against a fake bridge. No After Effects installation is needed.

To check the footage commands in a real After Effects session, generate the media fixtures (requires `ffmpeg` on `PATH`) and follow `test/AE_SMOKE_TEST.md`:

```bash
node test/fixtures/generate-fixtures.js
```

### 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Dakkshin/after-effects-mcp&type=date&legend=top-left)](https://www.star-history.com/#Dakkshin/after-effects-mcp&type=date&legend=top-left)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
