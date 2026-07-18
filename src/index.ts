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
    parameters: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the script")
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
      "createCamera",
      "batchSetLayerProperties",
      "setCompositionProperties",
      "duplicateLayer",
      "deleteLayer",
      "setLayerMask",
      "saveFrame",
      "moveLayer",
      "importFootage",
      "precompose",
      "setLayerParent",
      "createNull",
      "setBlendMode",
      "setTrackMatte",
      "removeEffect",
      "reorderEffect",
      "createLight",
      "set3DLayer",
      "renderComposition",
      "setKeyframeEase",
      "applyTrimPaths",
      "addTextAnimator",
      "saveProject",
      "getLayerDetails",
      "deleteComposition"
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

To use this integration with After Effects, follow these steps:

 1. **Install the scripts in After Effects**
   - Run \`node install-bridge.js\` with administrator privileges
   - This copies the necessary scripts to your After Effects installation

2. **Open After Effects**
   - Launch Adobe After Effects 
   - Open a project that you want to work with

3. **Open the MCP Bridge Auto panel**
   - In After Effects, go to Window > mcp-bridge-auto.jsx
   - The panel will automatically check for commands every few seconds

4. **Run scripts through MCP**
   - Use the \`run-script\` tool to queue a command
   - The Auto panel will detect and run the command automatically
   - Results will be saved to a temp file

5. **Get results through MCP**
   - After a command is executed, use the \`get-results\` tool
   - This will retrieve the results from After Effects

Available scripts:
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- createSolidLayer: Create a new solid layer
- setLayerProperties: Set properties for a layer
- setLayerKeyframe: Set a keyframe for a layer property
- setLayerExpression: Set an expression for a layer property
- applyEffect: Apply an effect to a layer
- applyEffectTemplate: Apply a predefined effect template to a layer

Effect Templates:
- gaussian-blur: Simple Gaussian blur effect
- directional-blur: Motion blur in a specific direction
- color-balance: Adjust hue, lightness, and saturation
- brightness-contrast: Basic brightness and contrast adjustment
- curves: Advanced color adjustment using curves
- glow: Add a glow effect to elements
- drop-shadow: Add a customizable drop shadow
- cinematic-look: Combination of effects for a cinematic appearance
- text-pop: Effects to make text stand out (glow and shadow)

Note: The auto-running panel can be left open in After Effects to continuously listen for commands from external applications.`
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
  async (params) => {
    try {
      // Write command to file for After Effects to pick up
      writeCommandFile("createComposition", params);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to create composition "${params.name}" has been queued.\n` +
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
            text: `Error queuing composition creation: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool for saving a single composition frame to a PNG file
server.tool(
  "save-frame",
  "Render a single frame of a composition to a PNG file at the given time, so the image can be inspected.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    time: z.number().min(0).optional().describe("Time in seconds of the frame to capture (default: 0)."),
    outPath: z.string().describe("Absolute path of the PNG file to write (parent folders are created if needed).")
  },
  async (params) => {
    try {
      writeCommandFile("saveFrame", params);

      return {
        content: [
          {
            type: "text",
            text: `Command to save frame at ${params.time ?? 0}s to "${params.outPath}" has been queued.\n` +
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
            text: `Error queuing save-frame: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool for reordering a layer within its composition
server.tool(
  "move-layer",
  "Reorder a layer within a composition (bring to front/back, or move before/after another layer, or to a specific index).",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer to move (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer to move (use this or layerIndex)."),
    position: z.enum(["front", "back", "before", "after"]).optional().describe("Where to move the layer. 'front' = topmost, 'back' = bottommost. For 'before'/'after', also provide a reference layer."),
    toIndex: z.number().int().positive().optional().describe("Alternative to 'position': move the layer to this 1-based index."),
    referenceLayerIndex: z.number().int().positive().optional().describe("Reference layer index for 'before'/'after'."),
    referenceLayerName: z.string().optional().describe("Reference layer name for 'before'/'after'.")
  },
  async (params) => {
    try {
      writeCommandFile("moveLayer", params);

      return {
        content: [
          {
            type: "text",
            text: `Command to move layer has been queued.\n` +
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
            text: `Error queuing move-layer: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: import footage into the project
server.tool(
  "import-footage",
  "Import a footage file into the project, optionally adding it to a composition.",
  {
    filePath: z.string().describe("Absolute path of the file to import."),
    importAs: z.enum(["footage", "comp"]).optional().describe("How to import the file."),
    addToComp: z.boolean().optional().describe("Whether to add the imported item to a composition."),
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    position: z.array(z.number()).optional().describe("Position [x, y] of the layer if added to a comp."),
    startTime: z.number().optional().describe("Start time in seconds of the layer if added to a comp.")
  },
  async (params) => {
    try {
      writeCommandFile("importFootage", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'import-footage' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing import-footage: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: precompose layers
server.tool(
  "precompose",
  "Precompose one or more layers in a composition into a new nested composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndices: z.array(z.number().int().positive()).describe("1-based indices of the layers to precompose."),
    name: z.string().optional().describe("Name of the new precomposition."),
    moveAllAttributes: z.boolean().optional().describe("Whether to move all attributes into the new composition.")
  },
  async (params) => {
    try {
      writeCommandFile("precompose", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'precompose' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing precompose: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: set a layer's parent
server.tool(
  "set-parent",
  "Set or remove the parent of a layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the child layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the child layer (use this or layerIndex)."),
    parentIndex: z.number().int().positive().optional().describe("1-based index of the parent layer (use this or parentName)."),
    parentName: z.string().optional().describe("Name of the parent layer (use this or parentIndex)."),
    unparent: z.boolean().optional().describe("If true, removes the layer's parent.")
  },
  async (params) => {
    try {
      writeCommandFile("setLayerParent", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'set-parent' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing set-parent: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: create a null layer
server.tool(
  "create-null",
  "Create a null object layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    name: z.string().optional().describe("Name of the new null layer."),
    position: z.array(z.number()).optional().describe("Position [x, y] of the null layer."),
    duration: z.number().positive().optional().describe("Duration in seconds of the null layer.")
  },
  async (params) => {
    try {
      writeCommandFile("createNull", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'create-null' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing create-null: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: set a layer's blend mode
server.tool(
  "set-blend-mode",
  "Set the blending mode of a layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    mode: z.enum(["normal", "add", "screen", "multiply", "overlay", "lighten", "darken", "softLight", "hardLight", "difference", "colorDodge", "colorBurn", "linearDodge", "linearBurn", "hue", "saturation", "color", "luminosity"]).describe("The blending mode to apply.")
  },
  async (params) => {
    try {
      writeCommandFile("setBlendMode", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'set-blend-mode' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing set-blend-mode: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: set a layer's track matte
server.tool(
  "set-track-matte",
  "Set or remove the track matte of a layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    matteType: z.enum(["none", "alpha", "alphaInverted", "luma", "lumaInverted"]).describe("The track matte type to apply."),
    matteLayerIndex: z.number().int().positive().optional().describe("1-based index of the matte layer (use this or matteLayerName)."),
    matteLayerName: z.string().optional().describe("Name of the matte layer (use this or matteLayerIndex).")
  },
  async (params) => {
    try {
      writeCommandFile("setTrackMatte", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'set-track-matte' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing set-track-matte: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: remove an effect from a layer
server.tool(
  "remove-effect",
  "Remove an effect from a layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect to remove (use this or effectName)."),
    effectName: z.string().optional().describe("Name of the effect to remove (use this or effectIndex).")
  },
  async (params) => {
    try {
      writeCommandFile("removeEffect", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'remove-effect' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing remove-effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: reorder an effect on a layer
server.tool(
  "reorder-effect",
  "Reorder an effect within a layer's effect stack in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    effectIndex: z.number().int().positive().describe("1-based index of the effect to move."),
    toIndex: z.number().int().positive().describe("1-based target index to move the effect to.")
  },
  async (params) => {
    try {
      writeCommandFile("reorderEffect", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'reorder-effect' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing reorder-effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: create a light layer
server.tool(
  "create-light",
  "Create a light layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    name: z.string().optional().describe("Name of the new light layer."),
    lightType: z.enum(["parallel", "spot", "point", "ambient"]).optional().describe("The type of light to create."),
    position: z.array(z.number()).optional().describe("Position [x, y, z] of the light."),
    pointOfInterest: z.array(z.number()).optional().describe("Point of interest [x, y, z] of the light."),
    intensity: z.number().optional().describe("Intensity of the light."),
    color: z.array(z.number()).optional().describe("Color [r, g, b] of the light (0-1).")
  },
  async (params) => {
    try {
      writeCommandFile("createLight", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'create-light' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing create-light: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: toggle 3D on a layer
server.tool(
  "set-3d-layer",
  "Enable or disable the 3D property of a layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    enabled: z.boolean().optional().describe("Whether to enable (true) or disable (false) the 3D property.")
  },
  async (params) => {
    try {
      writeCommandFile("set3DLayer", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'set-3d-layer' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing set-3d-layer: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: render a composition to video
server.tool(
  "render-video",
  "Render a composition to a video file via the render queue.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    outPath: z.string().describe("Absolute path of the output file to write."),
    outputModuleTemplate: z.string().optional().describe("Name of the output module template to use."),
    startTime: z.number().optional().describe("Start time in seconds of the render range."),
    duration: z.number().optional().describe("Duration in seconds of the render range.")
  },
  async (params) => {
    try {
      writeCommandFile("renderComposition", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'render-video' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing render-video: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: set keyframe ease
server.tool(
  "set-keyframe-ease",
  "Set the temporal ease (easing) on keyframes of a layer property in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    propertyName: z.string().describe("Name of the property whose keyframes to ease."),
    easeType: z.enum(["easyEase", "easeIn", "easeOut", "linear"]).optional().describe("The type of ease to apply."),
    influence: z.number().optional().describe("Ease influence percentage."),
    keyIndex: z.number().int().positive().optional().describe("1-based index of a specific keyframe to ease (omit to apply to all).")
  },
  async (params) => {
    try {
      writeCommandFile("setKeyframeEase", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'set-keyframe-ease' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing set-keyframe-ease: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: apply trim paths to a shape layer
server.tool(
  "apply-trim-paths",
  "Apply Trim Paths to a shape layer in a composition, optionally with a draw-on animation.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    start: z.number().optional().describe("Trim Paths start percentage."),
    end: z.number().optional().describe("Trim Paths end percentage."),
    offset: z.number().optional().describe("Trim Paths offset in degrees."),
    drawOn: z.object({
      from: z.number().optional(),
      to: z.number().optional(),
      startTime: z.number().optional(),
      duration: z.number().optional()
    }).optional().describe("Optional draw-on animation settings.")
  },
  async (params) => {
    try {
      writeCommandFile("applyTrimPaths", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'apply-trim-paths' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-trim-paths: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: add a text animator to a text layer
server.tool(
  "add-text-animator",
  "Add a text animator to a text layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex)."),
    property: z.enum(["opacity", "position", "scale", "rotation"]).optional().describe("The property the animator controls."),
    value: z.any().optional().describe("The animator property value."),
    offset: z.number().optional().describe("Range selector offset."),
    revealDuration: z.number().optional().describe("Duration of the reveal animation in seconds."),
    startTime: z.number().optional().describe("Start time in seconds of the animation."),
    name: z.string().optional().describe("Name of the animator.")
  },
  async (params) => {
    try {
      writeCommandFile("addTextAnimator", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'add-text-animator' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing add-text-animator: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: save the project
server.tool(
  "save-project",
  "Save the current After Effects project, optionally to a new path.",
  {
    path: z.string().optional().describe("Absolute path to save the project to. Saves in place if omitted.")
  },
  async (params) => {
    try {
      writeCommandFile("saveProject", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'save-project' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing save-project: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool: get detailed information about a layer
server.tool(
  "get-layer-details",
  "Get detailed information about a layer in a composition.",
  {
    compName: z.string().optional().describe("Name of the composition. Defaults to the active composition if omitted."),
    layerIndex: z.number().int().positive().optional().describe("1-based index of the layer (use this or layerName)."),
    layerName: z.string().optional().describe("Name of the layer (use this or layerIndex).")
  },
  async (params) => {
    try {
      writeCommandFile("getLayerDetails", params);

      return {
        content: [
          {
            type: "text",
            text: `Command 'get-layer-details' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing get-layer-details: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Add a tool for deleting a composition from the project
server.tool(
  "delete-composition",
  "Delete a composition from the project (by name or 1-based project item index).",
  {
    compName: z.string().optional().describe("Name of the composition to delete (use this or compIndex)."),
    compIndex: z.number().int().positive().optional().describe("1-based project item index of the composition (use this or compName).")
  },
  async (params) => {
    try {
      writeCommandFile("deleteComposition", params);
      return {
        content: [
          {
            type: "text",
            text: `Command 'delete-composition' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing delete-composition: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- BEGIN NEW TOOLS ---

// Zod schema for common layer identification
const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};

// Zod schema for keyframe value (more specific types might be needed depending on property)
// Using z.any() for flexibility, but can be refined (e.g., z.array(z.number()) for position/scale)
const KeyframeValueSchema = z.unknown().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

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
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("setLayerKeyframe", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to set keyframe for "${parameters.propertyName}" on layer ${parameters.layerIndex} in comp ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerKeyframe command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
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
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("setLayerExpression", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to set expression for "${parameters.propertyName}" on layer ${parameters.layerIndex} in comp ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setLayerExpression command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
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
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffect", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to apply effect to layer ${parameters.layerIndex} in composition ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
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
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffectTemplate", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `Command to apply effect template '${parameters.templateName}' to layer ${parameters.layerIndex} in composition ${parameters.compIndex} has been queued.\n` +
                  `Use the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-effect-template command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
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
    effectSettings: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffect", parameters);
      
      // Wait a bit for After Effects to process the command
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the results
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
            text: `Error applying effect: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
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
    customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => {
    try {
      // Queue the command for After Effects
      writeCommandFile("applyEffectTemplate", parameters);
      
      // Wait a bit for After Effects to process the command
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the results
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
            text: `Error applying effect template: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
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

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
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
  async () => {
    try {
      // Clear any stale result data
      clearResultsFile();
      
      // Write command to file for After Effects to pick up
      writeCommandFile("bridgeTestEffects", {});
      
      return {
        content: [
          {
            type: "text",
            text: `Bridge test effects command has been queued.\n` +
                  `Please ensure the "MCP Bridge Auto" panel is open in After Effects.\n` +
                  `Use the "get-results" tool after a few seconds to check for the test results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing bridge test command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// --- Community-contributed tools (ported into this bundle) ---
// remove-keyframe: ported from PR #28 by @dellis23
//   https://github.com/Dakkshin/after-effects-mcp/pull/28
// get-renderer-info / set-renderer: ported from PR #25 by @Boke-kun (elias)
//   https://github.com/Dakkshin/after-effects-mcp/pull/25

server.tool(
  "remove-keyframe",
  "Remove keyframe(s) from a layer property — by time, by 1-based key index, or all of them.",
  {
    compIndex: z.number().int().describe("1-based composition index (0 or omitted = active composition)."),
    layerIndex: z.number().int().positive().describe("1-based layer index within the composition."),
    propertyName: z.string().describe("Property name, e.g. 'Position', 'Scale', 'Rotation', 'Opacity'."),
    timeInSeconds: z.number().optional().describe("Remove the keyframe nearest this time (within 0.05s)."),
    keyIndex: z.number().int().positive().optional().describe("Remove the keyframe at this 1-based index."),
    removeAll: z.boolean().optional().describe("Remove every keyframe on the property.")
  },
  async (parameters) => {
    try {
      writeCommandFile("removeKeyframe", parameters);
      return {
        content: [
          {
            type: "text",
            text: `Command 'remove-keyframe' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error queuing remove-keyframe command: ${String(error)}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "get-renderer-info",
  "Get a composition's current and available 3D renderers (e.g. Classic 3D vs Cinema 4D).",
  {
    compIndex: z.number().int().positive().optional().describe("1-based composition index (default 1).")
  },
  async (parameters) => {
    try {
      writeCommandFile("getRendererInfo", parameters);
      return {
        content: [
          {
            type: "text",
            text: `Command 'get-renderer-info' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error queuing get-renderer-info command: ${String(error)}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "set-renderer",
  "Set a composition's 3D renderer by match name: 'ADBE Ernst' (Classic 3D) or 'ADBE Advanced 3d' (Cinema 4D).",
  {
    compIndex: z.number().int().positive().optional().describe("1-based composition index (default 1)."),
    renderer: z.string().describe("Renderer match name: 'ADBE Ernst' or 'ADBE Advanced 3d'.")
  },
  async (parameters) => {
    try {
      writeCommandFile("setRenderer", parameters);
      return {
        content: [
          {
            type: "text",
            text: `Command 'set-renderer' has been queued. Use the "get-results" tool after a few seconds to check results.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error queuing set-renderer command: ${String(error)}` }],
        isError: true
      };
    }
  }
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
