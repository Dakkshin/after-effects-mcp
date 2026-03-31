import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';

// Create an MCP server
const server = new McpServer({
  name: "AfterEffectsServer",
  version: "1.0.0"
});

// ES Modules replacement for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const SCRIPTS_DIR = path.join(__dirname, "scripts");
const TEMP_DIR = path.join(__dirname, "temp");

// Get the correct directory for AE bridge files
// Use ~/Documents/ae-mcp-bridge for reliable cross-process access
function getAETempDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, 'Documents', 'ae-mcp-bridge');
  // Ensure the directory exists
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}

// Headless CLI execution has been removed. All interactions are routed through the Bridge panel.

// Helper function to read results from After Effects temp file
function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');

    // Add debugging info
    console.error(`Checking for results at: ${tempFilePath}`);

    if (fs.existsSync(tempFilePath)) {
      // Get file stats to check modification time
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);

      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);

      // If the result file is older than 30 seconds, warn the user
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge Auto panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }

      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}

// Helper to wait for a fresh result produced by a specific command
async function waitForBridgeResult(expectedCommand?: string, timeoutMs: number = 5000, pollMs: number = 250): Promise<string> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastSize = -1;

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0 && content.length !== lastSize) {
          lastSize = content.length;
          try {
            const parsed = JSON.parse(content);
            if (!expectedCommand || parsed._commandExecuted === expectedCommand) {
              return content;
            }
          } catch {
            // not JSON yet; continue polling
          }
        }
      } catch {
        // transient read error; continue polling
      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return JSON.stringify({ error: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}.` });
}

// Helper function to write command to file
function writeCommandFile(command: string, args: Record<string, any> = {}): void {
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    const commandData = {
      command,
      args,
      timestamp: new Date().toISOString(),
      status: "pending"  // pending, running, completed, error
    };
    fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
    console.error(`Command "${command}" written to ${commandFile}`);
  } catch (error) {
    console.error("Error writing command file:", error);
  }
}

// Helper function to clear the results file to avoid stale cache
function clearResultsFile(): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');

    // Write a placeholder message to indicate the file is being reset
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

// Unified bridge helper - clears results, writes command, waits for result
async function callBridge(command: string, params: Record<string, any> = {}, timeoutMs: number = 8000): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  clearResultsFile();
  writeCommandFile(command, params);
  const result = await waitForBridgeResult(command, timeoutMs, 250);
  return { content: [{ type: "text", text: result }] };
}

// Add a resource to expose project compositions
server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    // Clear old results, queue the command, and wait for bridge output
    clearResultsFile();
    writeCommandFile("listCompositions", {});
    const result = await waitForBridgeResult("listCompositions", 6000, 250);

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: result
      }]
    };
  }
);

// Add a tool for running read-only scripts
server.tool(
  "run-script",
  "Run a read-only script in After Effects",
  {
    script: z.string().describe("Name of the predefined script to run"),
    parameters: z.record(z.any()).optional().describe("Optional parameters for the script")
  },
  async ({ script, parameters = {} }) => {
    // Validate that script is safe (only allow predefined scripts)
    const allowedScripts = [
      "listCompositions",
      "getProjectInfo",
      "getLayerInfo",
      "createComposition",
      "createTextLayer",
      "createShapeLayer",
      "createSolidLayer",
      "setLayerProperties",
      "setLayerKeyframe",
      "setLayerExpression",
      "applyEffect",
      "applyEffectTemplate",
      "test-animation",
      "bridgeTestEffects",
      "createNullObject",
      "createCamera",
      "createLight",
      "deleteLayer",
      "duplicateLayer",
      "reorderLayer",
      "renameLayer",
      "setLayerParent",
      "setLayerBlendMode",
      "setLayerTrackMatte",
      "setLayerFlags",
      "precomposeLayer",
      "moveLayerToTime",
      "trimLayer",
      "splitLayer",
      "addMask",
      "setMaskProperties",
      "deleteMask",
      "importFootage",
      "saveProject",
      "replaceFootage",
      "addToRenderQueue",
      "renderQueue",
      "exportFrame",
      "setCompositionSettings",
      "setWorkArea",
      "trimCompToWorkArea",
      "addMarker",
      "removeEffect",
      "getEffectParams",
      "setEffectParam",
      "setAudioLevel",
      "enableTimeRemap",
      "setTimeRemapKeyframe",
      "executeScript",
      "getCompFrame",
      "createCaption",
      "createZoomEffect",
      "addTextAnimator",
      "getAudioWaveform",
      "alignLayers",
      "distributeKeyframes",
      "setLayerStretch",
      "duplicateComposition",
      "getRendererInfo",
      "setRenderer",
      "addLutEffect",
      "createSlideShow"
    ];

    if (!allowedScripts.includes(script)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${allowedScripts.join(", ")}`
          }
        ],
        isError: true
      };
    }

    try {
      // Clear any stale result data
      clearResultsFile();

      // Write command to file for After Effects to pick up
      writeCommandFile(script, parameters);

      return {
        content: [
          {
            type: "text",
            text: `Command to run "${script}" has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool to get the results from the last script execution
server.tool(
  "get-results",
  "Get results from the last script executed in After Effects",
  {},
  async () => {
    try {
      const result = readResultsFromTempFile();
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting results: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add prompts for common After Effects tasks
server.prompt(
  "list-compositions",
  "List compositions in the current After Effects project",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    };
  }
);

server.prompt(
  "analyze-composition",
  {
    compositionName: z.string().describe("Name of the composition to analyze")
  },
  (args) => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    };
  }
);

// Add a prompt for creating compositions
server.prompt(
  "create-composition",
  "Create a new composition with specified settings",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    };
  }
);

// Add a tool to provide help and instructions
server.tool(
  "get-help",
  "Get help on using the After Effects MCP integration",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects MCP Integration Help

## Setup
1. Run \`node install-bridge.js\` with administrator privileges
2. Launch Adobe After Effects and open a project
3. Open Window > mcp-bridge-auto.jsx panel in After Effects
4. The panel automatically polls for commands

## Core Tools
- \`get-results\`: Get results from last executed command
- \`run-script\`: Queue a named script for execution
- \`get-help\`: Show this help

## Composition Tools
- \`create-composition\`: Create a new composition
- \`set-composition-settings\`: Update comp settings (name, size, fps, duration)
- \`set-work-area\`: Set composition work area start and duration
- \`trim-comp-to-work-area\`: Trim comp duration to work area
- \`duplicate-composition\`: Duplicate a composition
- \`get-renderer-info\`: Get available renderers for a comp
- \`set-renderer\`: Set 3D renderer (Classic 3D or C4D)
- \`add-marker\`: Add comp or layer marker

## Layer Creation
- \`create-text-layer\`: Create a text layer
- \`create-shape-layer\`: Create a shape layer
- \`create-solid-layer\`: Create a solid/adjustment layer
- \`create-null-object\`: Create a null object layer
- \`create-camera\`: Create a camera layer
- \`create-light\`: Create a light layer
- \`create-caption\`: Create a styled caption text layer
- \`create-slide-show\`: Create a slideshow from images

## Layer Operations
- \`delete-layer\`: Remove a layer
- \`duplicate-layer\`: Duplicate a layer
- \`reorder-layer\`: Move layer to new index
- \`rename-layer\`: Rename a layer
- \`set-layer-parent\`: Set layer parent (or clear)
- \`set-layer-blend-mode\`: Set blending mode
- \`set-layer-track-matte\`: Set track matte type
- \`set-layer-flags\`: Set solo, shy, locked, motionBlur, 3D, etc.
- \`set-layer-properties\`: Set position, scale, rotation, opacity
- \`set-layer-stretch\`: Set layer time stretch percentage
- \`move-layer-to-time\`: Move layer start time
- \`trim-layer\`: Trim layer in/out points
- \`split-layer\`: Split layer at a time point
- \`precompose-layer\`: Precompose one or more layers

## Keyframes & Animation
- \`set-layer-keyframe\`: Set a keyframe on a layer property
- \`set-layer-expression\`: Set/remove an expression
- \`create-zoom-effect\`: Add zoom (scale) animation with easing
- \`add-text-animator\`: Add a text animator with range selector
- \`distribute-keyframes\`: Add multiple keyframes at once
- \`align-layers\`: Align multiple layers to comp or each other
- \`enable-time-remap\`: Enable time remapping
- \`set-time-remap-keyframe\`: Set time remap keyframe

## Effects
- \`apply-effect\`: Apply an effect by name or match name
- \`apply-effect-template\`: Apply a predefined effect template
- \`remove-effect\`: Remove an effect from a layer
- \`get-effect-params\`: Get all parameters of an effect
- \`set-effect-param\`: Set a specific effect parameter
- \`set-audio-level\`: Set audio level (with optional keyframe)
- \`add-lut-effect\`: Apply an Apply Color LUT effect

## Masks
- \`add-mask\`: Add a mask (rectangle, ellipse, or freeform)
- \`set-mask-properties\`: Set mask feather, opacity, expansion, mode
- \`delete-mask\`: Remove a mask

## Project & Footage
- \`import-footage\`: Import a file as footage
- \`replace-footage\`: Replace footage source
- \`save-project\`: Save the current project

## Render & Export
- \`add-to-render-queue\`: Add comp to render queue
- \`render-queue\`: Control render queue (start/stop/clear/status)
- \`export-frame\`: Export a single frame as PNG
- \`get-comp-frame\`: Save a comp frame to disk

## Scripting
- \`execute-script\`: Run arbitrary ExtendScript code
- \`get-audio-waveform\`: Get audio level data for a layer

## Effect Templates
- gaussian-blur, directional-blur, color-balance, brightness-contrast
- curves, glow, drop-shadow, cinematic-look, text-pop`
        }
      ]
    };
  }
);

// Add a tool specifically for creating compositions
server.tool(
  "create-composition",
  "Create a new composition in After Effects with specified parameters",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width of the composition in pixels"),
    height: z.number().int().positive().describe("Height of the composition in pixels"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
    frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background color of the composition (RGB values 0-255)")
  },
  async (params) => callBridge("createComposition", params)
);

// --- BEGIN NEW TOOLS ---

// Zod schema for common layer identification
const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};

// Zod schema for keyframe value (more specific types might be needed depending on property)
// Using z.any() for flexibility, but can be refined (e.g., z.array(z.number()) for position/scale)
const KeyframeValueSchema = z.any().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

// Tool for setting a layer keyframe
server.tool(
  "setLayerKeyframe", // Corresponds to the function name in ExtendScript
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerIdentifierSchema, // Reuse common identifiers
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => callBridge("setLayerKeyframe", parameters)
);

// Tool for setting a layer expression
server.tool(
  "setLayerExpression", // Corresponds to the function name in ExtendScript
  "Set or remove an expression for a specific layer property.",
  {
    ...LayerIdentifierSchema, // Reuse common identifiers
    propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
  },
  async (parameters) => callBridge("setLayerExpression", parameters)
);

// --- END NEW TOOLS ---

// --- BEGIN NEW TESTING TOOL ---
// Add a special tool for directly testing the keyframe functionality
server.tool(
  "test-animation",
  "Test animation functionality in After Effects",
  {
    operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
    compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
    layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
  },
  async (params) => {
    try {
      // Generate a unique timestamp
      const timestamp = new Date().getTime();
      const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);

      // Create a direct test script that doesn't rely on command files
      let scriptContent = "";
      if (params.operation === "keyframe") {
        scriptContent = `
          // Direct keyframe test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity

            // Set a keyframe
            prop.setValueAtTime(time, value);

            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();

            // Visual feedback
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();

            alert("Test failed: " + e.toString());
          }
        `;
      } else if (params.operation === "expression") {
        scriptContent = `
          // Direct expression test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";

            // Set the expression
            prop.expression = expression;

            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();

            // Visual feedback
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();

            alert("Test failed: " + e.toString());
          }
        `;
      }

      // Write the script to a temp file
      fs.writeFileSync(tempFile, scriptContent);
      console.error(`Written test script to: ${tempFile}`);

      // Tell the user what to do
      return {
        content: [
          {
            type: "text",
            text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the MCP Bridge Auto panel and will directly modify the specified layer.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating test script: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);
// --- END NEW TESTING TOOL ---

// --- BEGIN NEW EFFECTS TOOLS ---

// Add a tool for applying effects to layers
server.tool(
  "apply-effect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => callBridge("applyEffect", parameters)
);

// Add a tool for applying effect templates
server.tool(
  "apply-effect-template",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur",
      "directional-blur",
      "color-balance",
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => callBridge("applyEffectTemplate", parameters)
);

// --- END NEW EFFECTS TOOLS ---

// Add direct MCP function for applying effects
server.tool(
  "mcp_aftereffects_applyEffect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => callBridge("applyEffect", parameters)
);

// Add direct MCP function for applying effect templates
server.tool(
  "mcp_aftereffects_applyEffectTemplate",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur",
      "directional-blur",
      "color-balance",
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => callBridge("applyEffectTemplate", parameters)
);

// Update help information to include the new effects tools
server.tool(
  "mcp_aftereffects_get_effects_help",
  "Get help on using After Effects effects",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)
`
        }
      ]
    };
  }
);

// Add a direct tool for our bridge test effects
server.tool(
  "run-bridge-test",
  "Run the bridge test effects script to verify communication and apply test effects",
  {},
  async () => callBridge("bridgeTestEffects", {})
);

// ============================================================
// NEW EXPANDED TOOLS
// ============================================================

// create-null-object
server.tool(
  "create-null-object",
  "Create a null object layer in a composition. Null objects are useful as parent controllers.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    name: z.string().optional().describe("Name for the null object layer (default: 'Null')."),
    startTime: z.number().optional().describe("Start time in seconds (default: 0)."),
    duration: z.number().optional().describe("Duration in seconds. 0 = use comp duration.")
  },
  async (params) => callBridge("createNullObject", params)
);

// create-camera
server.tool(
  "create-camera",
  "Create a camera layer in a 3D composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    name: z.string().optional().describe("Name for the camera layer (default: 'Camera 1')."),
    preset: z.enum(["15mm","20mm","24mm","28mm","35mm","50mm","80mm","85mm","135mm","200mm","custom"]).optional().describe("Camera lens preset (default: '50mm')."),
    zoom: z.number().optional().describe("Zoom value in pixels (overrides preset if provided)."),
    filmSize: z.number().optional().describe("Film size in mm (default: 36).")
  },
  async (params) => callBridge("createCamera", params)
);

// create-light
server.tool(
  "create-light",
  "Create a light layer in a 3D composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    name: z.string().optional().describe("Name for the light layer (default: 'Light 1')."),
    lightType: z.enum(["PARALLEL","SPOT","POINT","AMBIENT"]).optional().describe("Type of light (default: POINT)."),
    color: z.array(z.number()).optional().describe("RGB color 0-1, e.g. [1,1,1] for white."),
    intensity: z.number().optional().describe("Light intensity in percent (default: 100)."),
    castsShadows: z.boolean().optional().describe("Whether the light casts shadows (default: false)."),
    coneAngle: z.number().optional().describe("Cone angle in degrees for SPOT lights (default: 90)."),
    coneFeather: z.number().optional().describe("Cone feather percentage for SPOT lights (default: 50).")
  },
  async (params) => callBridge("createLight", params)
);

// delete-layer
server.tool(
  "delete-layer",
  "Remove a layer from a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the layer to delete.")
  },
  async (params) => callBridge("deleteLayer", params)
);

// duplicate-layer
server.tool(
  "duplicate-layer",
  "Duplicate a layer in a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the layer to duplicate.")
  },
  async (params) => callBridge("duplicateLayer", params)
);

// reorder-layer
server.tool(
  "reorder-layer",
  "Move a layer to a new position in the layer stack.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the layer to move."),
    newIndex: z.number().int().positive().describe("Target 1-based index position.")
  },
  async (params) => callBridge("reorderLayer", params)
);

// rename-layer
server.tool(
  "rename-layer",
  "Rename a layer in a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the layer to rename."),
    newName: z.string().describe("New name for the layer.")
  },
  async (params) => callBridge("renameLayer", params)
);

// set-layer-parent
server.tool(
  "set-layer-parent",
  "Set or clear the parent layer for a layer (for parenting/rigging).",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the child layer."),
    parentLayerIndex: z.number().int().min(0).describe("1-based index of the parent layer. Use 0 to clear the parent.")
  },
  async (params) => callBridge("setLayerParent", params)
);

// set-layer-blend-mode
server.tool(
  "set-layer-blend-mode",
  "Set the blending mode of a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    blendMode: z.enum([
      "NORMAL","DISSOLVE","DANCING_DISSOLVE","DARKEN","MULTIPLY","COLOR_BURN",
      "CLASSIC_COLOR_BURN","LINEAR_BURN","DARKER_COLOR","ADD","LIGHTEN","SCREEN",
      "COLOR_DODGE","CLASSIC_COLOR_DODGE","LINEAR_DODGE","LIGHTER_COLOR","OVERLAY",
      "SOFT_LIGHT","HARD_LIGHT","LINEAR_LIGHT","VIVID_LIGHT","PIN_LIGHT","HARD_MIX",
      "DIFFERENCE","CLASSIC_DIFFERENCE","EXCLUSION","HUE","SATURATION","COLOR",
      "LUMINOSITY","STENCIL_ALPHA","STENCIL_LUMA","SILHOUETTE_ALPHA","SILHOUETTE_LUMA",
      "ALPHA_ADD","LUMINESCENT_PREMUL"
    ]).describe("Blending mode to apply.")
  },
  async (params) => callBridge("setLayerBlendMode", params)
);

// set-layer-track-matte
server.tool(
  "set-layer-track-matte",
  "Set the track matte type for a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    matteType: z.enum(["NONE","ALPHA","ALPHA_INVERTED","LUMA","LUMA_INVERTED"]).describe("Track matte type to apply.")
  },
  async (params) => callBridge("setLayerTrackMatte", params)
);

// set-layer-flags
server.tool(
  "set-layer-flags",
  "Set boolean flags on a layer such as solo, shy, locked, motion blur, 3D, etc.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    flags: z.object({
      solo: z.boolean().optional(),
      shy: z.boolean().optional(),
      locked: z.boolean().optional(),
      motionBlur: z.boolean().optional(),
      enable3D: z.boolean().optional().describe("Enable 3D layer mode."),
      adjustmentLayer: z.boolean().optional(),
      collapseTransformation: z.boolean().optional(),
      frameBlending: z.boolean().optional(),
      frameBlendingType: z.enum(["FRAME_MIX","PIXEL_MOTION"]).optional()
    }).describe("Object with flag properties to set.")
  },
  async (params) => callBridge("setLayerFlags", params)
);

// precompose-layer
server.tool(
  "precompose-layer",
  "Precompose one or more layers into a new composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the source composition."),
    layerIndices: z.array(z.number().int().positive()).describe("Array of 1-based layer indices to precompose."),
    newCompName: z.string().describe("Name for the new precomp."),
    moveAllAttributes: z.boolean().optional().describe("Move all attributes into the new comp (default: true).")
  },
  async (params) => callBridge("precomposeLayer", params)
);

// move-layer-to-time
server.tool(
  "move-layer-to-time",
  "Move a layer to start at a specific time in the composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    startTime: z.number().describe("New start time in seconds.")
  },
  async (params) => callBridge("moveLayerToTime", params)
);

// trim-layer
server.tool(
  "trim-layer",
  "Trim a layer's in point and/or out point.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    inPoint: z.number().optional().describe("New in point in seconds (optional)."),
    outPoint: z.number().optional().describe("New out point in seconds (optional).")
  },
  async (params) => callBridge("trimLayer", params)
);

// split-layer
server.tool(
  "split-layer",
  "Split a layer at a specific time, creating two layers.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    splitTime: z.number().describe("Time in seconds at which to split the layer.")
  },
  async (params) => callBridge("splitLayer", params)
);

// add-mask
server.tool(
  "add-mask",
  "Add a mask to a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    maskShape: z.enum(["rectangle","ellipse","freeform"]).optional().describe("Shape type for the mask (default: rectangle)."),
    vertices: z.array(z.array(z.number())).optional().describe("Array of [x,y] vertices for freeform masks."),
    inverted: z.boolean().optional().describe("Whether the mask is inverted (default: false).")
  },
  async (params) => callBridge("addMask", params)
);

// set-mask-properties
server.tool(
  "set-mask-properties",
  "Set properties of an existing mask on a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    maskIndex: z.number().int().positive().describe("1-based index of the mask."),
    feather: z.union([z.number(), z.array(z.number())]).optional().describe("Feather value in pixels (single value or [x,y])."),
    opacity: z.number().min(0).max(100).optional().describe("Mask opacity 0-100."),
    expansion: z.number().optional().describe("Mask expansion in pixels."),
    inverted: z.boolean().optional().describe("Whether the mask is inverted."),
    mode: z.enum(["NONE","ADD","SUBTRACT","INTERSECT","LIGHTEN","DARKEN","DIFFERENCE"]).optional().describe("Mask blending mode.")
  },
  async (params) => callBridge("setMaskProperties", params)
);

// delete-mask
server.tool(
  "delete-mask",
  "Delete a mask from a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    maskIndex: z.number().int().positive().describe("1-based index of the mask to delete.")
  },
  async (params) => callBridge("deleteMask", params)
);

// import-footage
server.tool(
  "import-footage",
  "Import a file as footage into the project.",
  {
    filePath: z.string().describe("Absolute path to the file to import."),
    name: z.string().optional().describe("Optional name for the footage item."),
    sequenceOptions: z.object({
      importAsSequence: z.boolean().optional(),
      frameRate: z.number().optional()
    }).optional().describe("Options for image sequence import.")
  },
  async (params) => callBridge("importFootage", params)
);

// save-project
server.tool(
  "save-project",
  "Save the current After Effects project.",
  {
    filePath: z.string().optional().describe("Optional path to save the project to. Omit to save to current path.")
  },
  async (params) => callBridge("saveProject", params)
);

// replace-footage
server.tool(
  "replace-footage",
  "Replace the source file for a footage item in the project.",
  {
    itemIndex: z.number().int().positive().describe("1-based index of the footage item in the project."),
    newFilePath: z.string().describe("Absolute path to the new footage file.")
  },
  async (params) => callBridge("replaceFootage", params)
);

// add-to-render-queue
server.tool(
  "add-to-render-queue",
  "Add a composition to the render queue with output settings.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the composition to render."),
    outputPath: z.string().describe("Full path for the output file."),
    outputModuleTemplate: z.string().optional().describe("Output module template name (default: 'Lossless')."),
    renderSettingsTemplate: z.string().optional().describe("Render settings template name (default: 'Best Settings').")
  },
  async (params) => callBridge("addToRenderQueue", params)
);

// render-queue
server.tool(
  "render-queue",
  "Control the After Effects render queue.",
  {
    action: z.enum(["start","stop","clear","status"]).describe("Action to perform on the render queue.")
  },
  async (params) => callBridge("renderQueue", params)
);

// export-frame
server.tool(
  "export-frame",
  "Export a single frame from a composition as a PNG file.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    timeInSeconds: z.number().describe("Time in seconds for the frame to export."),
    outputPath: z.string().describe("Full path for the output PNG file.")
  },
  async (params) => callBridge("exportFrame", params, 30000)
);

// set-composition-settings
server.tool(
  "set-composition-settings",
  "Update settings of an existing composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the composition to update."),
    name: z.string().optional().describe("New name for the composition."),
    width: z.number().int().positive().optional().describe("New width in pixels."),
    height: z.number().int().positive().optional().describe("New height in pixels."),
    frameRate: z.number().positive().optional().describe("New frame rate."),
    duration: z.number().positive().optional().describe("New duration in seconds."),
    pixelAspect: z.number().positive().optional().describe("New pixel aspect ratio."),
    bgColor: z.union([
      z.object({ r: z.number(), g: z.number(), b: z.number() }),
      z.array(z.number())
    ]).optional().describe("Background color as {r,g,b} (0-1) or [r,g,b] array.")
  },
  async (params) => callBridge("setCompositionSettings", params)
);

// set-work-area
server.tool(
  "set-work-area",
  "Set the work area of a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    workAreaStart: z.number().describe("Work area start time in seconds."),
    workAreaDuration: z.number().describe("Work area duration in seconds.")
  },
  async (params) => callBridge("setWorkArea", params)
);

// trim-comp-to-work-area
server.tool(
  "trim-comp-to-work-area",
  "Trim a composition's duration to match its work area.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition.")
  },
  async (params) => callBridge("trimCompToWorkArea", params)
);

// add-marker
server.tool(
  "add-marker",
  "Add a marker to a composition or layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().min(0).optional().describe("1-based index of the target layer. Omit or use 0 for a comp marker."),
    time: z.number().describe("Time in seconds for the marker."),
    label: z.string().optional().describe("Label text for the marker."),
    comment: z.string().optional().describe("Comment/description for the marker."),
    duration: z.number().optional().describe("Duration of the marker in seconds (for span markers)."),
    url: z.string().optional().describe("URL to associate with the marker.")
  },
  async (params) => callBridge("addMarker", params)
);

// remove-effect
server.tool(
  "remove-effect",
  "Remove an effect from a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    effectName: z.string().optional().describe("Display name of the effect to remove."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect to remove.")
  },
  async (params) => callBridge("removeEffect", params)
);

// get-effect-params
server.tool(
  "get-effect-params",
  "Get all parameters of an effect on a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    effectName: z.string().optional().describe("Display name of the effect."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect.")
  },
  async (params) => callBridge("getEffectParams", params)
);

// set-effect-param
server.tool(
  "set-effect-param",
  "Set a specific parameter on an effect.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    effectName: z.string().describe("Display name of the effect."),
    paramName: z.string().describe("Name of the parameter to set."),
    value: z.any().describe("New value for the parameter.")
  },
  async (params) => callBridge("setEffectParam", params)
);

// set-audio-level
server.tool(
  "set-audio-level",
  "Set the audio level (dB) for an audio layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    level: z.number().describe("Audio level in dB (e.g., 0 = unity, -6 = half volume, -96 = silence)."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time. Otherwise sets a constant value.")
  },
  async (params) => callBridge("setAudioLevel", params)
);

// enable-time-remap
server.tool(
  "enable-time-remap",
  "Enable time remapping on a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer.")
  },
  async (params) => callBridge("enableTimeRemap", params)
);

// set-time-remap-keyframe
server.tool(
  "set-time-remap-keyframe",
  "Set a time remap keyframe on a layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    timeInSeconds: z.number().describe("Timeline time in seconds for the keyframe."),
    remapValue: z.number().describe("Source time value in seconds to remap to.")
  },
  async (params) => callBridge("setTimeRemapKeyframe", params)
);

// execute-script
server.tool(
  "execute-script",
  "Execute arbitrary ExtendScript code in After Effects. Use with caution.",
  {
    script: z.string().describe("ExtendScript code to execute."),
    description: z.string().optional().describe("Optional description of what the script does.")
  },
  async (params) => callBridge("executeScript", params)
);

// get-comp-frame
server.tool(
  "get-comp-frame",
  "Save a frame from a composition as a PNG file and return its path.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    timeInSeconds: z.number().describe("Time in seconds of the frame to capture."),
    outputDir: z.string().optional().describe("Output directory for the frame. Defaults to ~/Documents/ae-mcp-bridge/frames/.")
  },
  async (params) => callBridge("getCompFrame", params, 30000)
);

// create-caption
server.tool(
  "create-caption",
  "Create a styled caption text layer for subtitles or overlays.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    text: z.string().describe("Caption text content."),
    startTime: z.number().describe("Start time in seconds."),
    endTime: z.number().describe("End time in seconds."),
    style: z.enum(["lower-third","center","upper-third","custom"]).optional().describe("Caption position preset (default: lower-third)."),
    fontSize: z.number().optional().describe("Font size in points (default: 36)."),
    color: z.array(z.number()).optional().describe("Text color as [r,g,b] 0-1 (default: white)."),
    backgroundColor: z.object({
      r: z.number().optional(),
      g: z.number().optional(),
      b: z.number().optional(),
      opacity: z.number().optional()
    }).optional().describe("Optional background box color with opacity (0-100)."),
    fontFamily: z.string().optional().describe("Font family name (default: Arial).")
  },
  async (params) => callBridge("createCaption", params)
);

// create-zoom-effect
server.tool(
  "create-zoom-effect",
  "Add a zoom (scale) animation to a layer with keyframes and easing.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    startTime: z.number().describe("Time in seconds to start the zoom."),
    endTime: z.number().describe("Time in seconds to end the zoom."),
    zoomFrom: z.number().optional().describe("Starting scale percentage (default: 100)."),
    zoomTo: z.number().optional().describe("Ending scale percentage (default: 120)."),
    easingType: z.enum(["linear","ease-in","ease-out","ease-in-out"]).optional().describe("Easing type for keyframes (default: ease-in-out)."),
    anchorPoint: z.array(z.number()).optional().describe("Anchor point [x,y] for zoom origin.")
  },
  async (params) => callBridge("createZoomEffect", params)
);

// add-text-animator
server.tool(
  "add-text-animator",
  "Add a text animator with range selector to a text layer.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target text layer."),
    animatorType: z.enum(["opacity","position","scale","rotation","fill_color","character_offset","blur"]).describe("Type of property to animate per character."),
    rangeStart: z.number().min(0).max(100).describe("Range selector start percentage (0-100)."),
    rangeEnd: z.number().min(0).max(100).describe("Range selector end percentage (0-100)."),
    value: z.any().describe("Value for the animator property.")
  },
  async (params) => callBridge("addTextAnimator", params)
);

// get-audio-waveform
server.tool(
  "get-audio-waveform",
  "Get audio level data for a layer over a time range. Returns sampled audio levels.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    startTime: z.number().describe("Start time in seconds."),
    endTime: z.number().describe("End time in seconds."),
    samples: z.number().int().positive().optional().describe("Number of sample points (default: 10).")
  },
  async (params) => callBridge("getAudioWaveform", params)
);

// align-layers
server.tool(
  "align-layers",
  "Align multiple layers relative to each other or the composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndices: z.array(z.number().int().positive()).describe("Array of 1-based layer indices to align."),
    alignTo: z.enum(["left","right","top","bottom","horizontalCenter","verticalCenter","compLeft","compRight","compTop","compBottom","compHCenter","compVCenter"]).describe("Alignment target.")
  },
  async (params) => callBridge("alignLayers", params)
);

// distribute-keyframes
server.tool(
  "distribute-keyframes",
  "Add multiple keyframes to a layer property at specified times.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    propertyName: z.string().describe("Property name (e.g. 'Position', 'Scale', 'Opacity')."),
    values: z.array(z.any()).describe("Array of values for each keyframe."),
    times: z.array(z.number()).describe("Array of times in seconds for each keyframe."),
    interpolationType: z.enum(["linear","hold","easy-ease"]).optional().describe("Interpolation type for keyframes (default: linear).")
  },
  async (params) => callBridge("distributeKeyframes", params)
);

// set-layer-stretch
server.tool(
  "set-layer-stretch",
  "Set the time stretch percentage for a layer (50% = 2x speed, 200% = half speed).",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    stretch: z.number().describe("Stretch percentage (e.g., 50 = 2x speed, 200 = half speed, 100 = normal).")
  },
  async (params) => callBridge("setLayerStretch", params)
);

// duplicate-composition
server.tool(
  "duplicate-composition",
  "Duplicate a composition in the project.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the composition to duplicate."),
    newName: z.string().optional().describe("Name for the duplicated composition (optional).")
  },
  async (params) => callBridge("duplicateComposition", params)
);

// get-renderer-info
server.tool(
  "get-renderer-info",
  "Get information about available render engines for a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition.")
  },
  async (params) => callBridge("getRendererInfo", params)
);

// set-renderer
server.tool(
  "set-renderer",
  "Set the 3D renderer for a composition.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    renderer: z.string().describe("Renderer match name: 'ADBE Advanced 3d' for C4D, 'ADBE Ernst' for Classic 3D.")
  },
  async (params) => callBridge("setRenderer", params)
);

// create-text-layer (wrapper with callBridge)
server.tool(
  "create-text-layer",
  "Create a text layer in a composition.",
  {
    compName: z.string().describe("Name of the target composition."),
    text: z.string().describe("Text content for the layer."),
    position: z.array(z.number()).optional().describe("Position [x, y] in pixels (default: [960, 540])."),
    fontSize: z.number().optional().describe("Font size in points (default: 72)."),
    color: z.array(z.number()).optional().describe("Text color [r, g, b] 0-1 (default: white)."),
    fontFamily: z.string().optional().describe("Font family name (default: Arial)."),
    alignment: z.enum(["left","center","right"]).optional().describe("Text alignment (default: center)."),
    startTime: z.number().optional().describe("Layer start time in seconds (default: 0)."),
    duration: z.number().optional().describe("Layer duration in seconds (default: 5).")
  },
  async (params) => callBridge("createTextLayer", params)
);

// create-shape-layer (wrapper with callBridge)
server.tool(
  "create-shape-layer",
  "Create a shape layer in a composition.",
  {
    compName: z.string().describe("Name of the target composition."),
    shapeType: z.enum(["rectangle","ellipse","polygon","star"]).optional().describe("Shape type (default: rectangle)."),
    position: z.array(z.number()).optional().describe("Position [x, y] in pixels."),
    size: z.array(z.number()).optional().describe("Size [width, height] in pixels."),
    fillColor: z.array(z.number()).optional().describe("Fill color [r, g, b] 0-1."),
    strokeColor: z.array(z.number()).optional().describe("Stroke color [r, g, b] 0-1."),
    strokeWidth: z.number().optional().describe("Stroke width in pixels (0 = no stroke)."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().optional().describe("Layer duration in seconds."),
    name: z.string().optional().describe("Layer name."),
    points: z.number().optional().describe("Number of points for polygon/star shapes.")
  },
  async (params) => callBridge("createShapeLayer", params)
);

// create-solid-layer (wrapper with callBridge)
server.tool(
  "create-solid-layer",
  "Create a solid or adjustment layer in a composition.",
  {
    compName: z.string().describe("Name of the target composition."),
    color: z.array(z.number()).optional().describe("Solid color [r, g, b] 0-1 (default: white)."),
    name: z.string().optional().describe("Layer name."),
    position: z.array(z.number()).optional().describe("Position [x, y] in pixels."),
    size: z.array(z.number()).optional().describe("Size [width, height] in pixels."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().optional().describe("Layer duration in seconds."),
    isAdjustment: z.boolean().optional().describe("Create as an adjustment layer (default: false).")
  },
  async (params) => callBridge("createSolidLayer", params)
);

// set-layer-properties (wrapper with callBridge)
server.tool(
  "set-layer-properties",
  "Set transform properties and other attributes on a layer.",
  {
    compName: z.string().optional().describe("Name of the target composition."),
    compIndex: z.number().int().positive().optional().describe("1-based index of the target composition."),
    layerIndex: z.number().int().optional().describe("1-based index of the target layer."),
    layerName: z.string().optional().describe("Name of the target layer."),
    position: z.array(z.number()).optional().describe("Position [x, y] or [x, y, z] in pixels."),
    scale: z.array(z.number()).optional().describe("Scale [x, y] or [x, y, z] in percent."),
    rotation: z.number().optional().describe("Rotation in degrees."),
    opacity: z.number().min(0).max(100).optional().describe("Opacity 0-100."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().optional().describe("Layer duration in seconds."),
    text: z.string().optional().describe("Text content (for text layers)."),
    fontFamily: z.string().optional().describe("Font family (for text layers)."),
    fontSize: z.number().optional().describe("Font size (for text layers)."),
    fillColor: z.array(z.number()).optional().describe("Fill color [r,g,b] 0-1 (for text layers).")
  },
  async (params) => callBridge("setLayerProperties", params)
);

// add-lut-effect
server.tool(
  "add-lut-effect",
  "Apply an Apply Color LUT effect to a layer using a .cube or .3dl LUT file.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer."),
    lutPath: z.string().describe("Absolute path to the LUT file (.cube, .3dl, etc.).")
  },
  async (params) => callBridge("addLutEffect", params)
);

// create-slide-show
server.tool(
  "create-slide-show",
  "Create a slideshow by importing images and arranging them as layers with transitions.",
  {
    compIndex: z.number().int().positive().describe("1-based index of the target composition."),
    imagePaths: z.array(z.string()).describe("Array of absolute paths to image files."),
    durationPerSlide: z.number().optional().describe("Duration per slide in seconds (default: 3)."),
    transition: z.enum(["cut","fade","slide","zoom"]).optional().describe("Transition type between slides (default: cut)."),
    transitionDuration: z.number().optional().describe("Duration of each transition in seconds (default: 0.5).")
  },
  async (params) => callBridge("createSlideShow", params)
);

// Start the MCP server
async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Scripts directory: ${SCRIPTS_DIR}`);
  console.error(`Temp directory: ${TEMP_DIR}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
