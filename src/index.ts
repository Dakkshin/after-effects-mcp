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

function resolveWindowsDocumentsDir(): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const output = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal',
      { encoding: "utf8" }
    );
    const match = output.match(/Personal\s+REG_\w+\s+([^\r\n]+)/);
    if (match?.[1]) {
      const expanded = match[1].replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
      return path.resolve(expanded.trim());
    }
  } catch (error) {
    console.error("Failed to resolve Documents path from registry:", error);
  }

  return null;
}

function resolveDocumentsDir(): string {
  const homeDir = os.homedir();
  const candidates = [
    resolveWindowsDocumentsDir(),
    process.env.OneDriveCommercial ? path.join(process.env.OneDriveCommercial, "Documents") : null,
    process.env.OneDriveConsumer ? path.join(process.env.OneDriveConsumer, "Documents") : null,
    process.env.OneDrive ? path.join(process.env.OneDrive, "Documents") : null,
    path.join(homeDir, "Documents")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

// Get the correct directory for AE bridge files
function getAETempDir(): string {
  const bridgeDir = path.join(resolveDocumentsDir(), "ae-mcp-bridge");
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

function createCommandId(command: string): string {
  return `${command}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type WaitForBridgeResultOptions = {
  expectedCommand?: string;
  expectedCommandId?: string;
  timeoutMs?: number;
  pollMs?: number;
};

// Helper to wait for a fresh result produced by a specific command
async function waitForBridgeResult(options: WaitForBridgeResultOptions = {}): Promise<string> {
  const { expectedCommand, expectedCommandId, timeoutMs = 5000, pollMs = 250 } = options;
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');
  let lastContent = "";

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(resultPath)) {
      try {
        const content = fs.readFileSync(resultPath, 'utf8');
        if (content && content.length > 0 && content !== lastContent) {
          lastContent = content;
          try {
            const parsed = JSON.parse(content);
            if (parsed?.status === "waiting" && parsed?._placeholder === true) {
              continue;
            }
            if (expectedCommand && parsed?._commandExecuted !== expectedCommand) {
              continue;
            }
            if (expectedCommandId && parsed?._commandId !== expectedCommandId) {
              continue;
            }
            if (!expectedCommand || parsed?._commandExecuted === expectedCommand) {
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
  return JSON.stringify({
    status: "error",
    message: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ''}${expectedCommandId ? ` (${expectedCommandId})` : ""}.`,
    command: expectedCommand || null,
    commandId: expectedCommandId || null
  });
}

// Helper function to write command to file
function writeCommandFile(command: string, args: Record<string, any> = {}, commandId: string = createCommandId(command)): string {
  try {
    const commandFile = path.join(getAETempDir(), 'ae_command.json');
    const commandData = {
      command,
      args,
      commandId,
      timestamp: new Date().toISOString(),
      status: "pending"  // pending, running, completed, error
    };
    fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
    console.error(`Command "${command}" (${commandId}) written to ${commandFile}`);
  } catch (error) {
    console.error("Error writing command file:", error);
  }
  return commandId;
}

// Helper function to clear the results file to avoid stale cache
function clearResultsFile(commandId?: string, command?: string): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    // Write a placeholder message to indicate the file is being reset
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      command: command || null,
      commandId: commandId || null,
      timestamp: new Date().toISOString(),
      _placeholder: true
    };
    
    fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

function queueBridgeCommand(command: string, args: Record<string, any> = {}): string {
  const commandId = createCommandId(command);
  clearResultsFile(commandId, command);
  return writeCommandFile(command, { ...args, commandId }, commandId);
}

function describeQueuedCommand(command: string, commandId: string): string {
  return `Command "${command}" has been queued.\nCommand ID: ${commandId}`;
}

// Add a resource to expose project compositions
server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    // Clear old results, queue the command, and wait for bridge output
    const commandId = queueBridgeCommand("listCompositions", {});
    const result = await waitForBridgeResult({ expectedCommand: "listCompositions", expectedCommandId: commandId, timeoutMs: 6000, pollMs: 250 });

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
      "getProjectItems",
      "findProjectItem",
      "setActiveComp",
      "clearLayerSelection",
      "selectLayers",
      "getLayerDetails",
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
      "enableMotionBlur",
      "sequenceLayerPosition",
      "copyPathsToMasks",
      "setupTypewriterText",
      "createTimerRig",
      "applyBwTint",
      "cleanupKeyframes",
      "setupRetimingMode",
      "createDropdownController",
      "linkOpacityToDropdown",
      "createCamera",
      "batchSetLayerProperties",
      "setCompositionProperties",
      "duplicateLayer",
      "deleteLayer",
      "setLayerMask"
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
      const commandId = queueBridgeCommand(script, parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand(script, commandId)}\n` +
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
  {
    commandId: z.string().optional().describe("Optional command id to verify against the latest bridge result."),
    command: z.string().optional().describe("Optional command name to verify against the latest bridge result.")
  },
  async ({ commandId, command }) => {
    try {
      const result = readResultsFromTempFile();
      if (commandId || command) {
        const parsed = JSON.parse(result);
        if (commandId && parsed?._commandId !== commandId && parsed?.commandId !== commandId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "error",
                  message: `Latest result does not match command id '${commandId}'.`,
                  requestedCommandId: commandId,
                  actualCommandId: parsed?._commandId || parsed?.commandId || null
                }, null, 2)
              }
            ],
            isError: true
          };
        }
        if (command && parsed?._commandExecuted !== command && parsed?.command !== command) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "error",
                  message: `Latest result does not match command '${command}'.`,
                  requestedCommand: command,
                  actualCommand: parsed?._commandExecuted || parsed?.command || null
                }, null, 2)
              }
            ],
            isError: true
          };
        }
      }
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
- getProjectItems: List project items with optional filtering
- findProjectItem: Resolve a project item by exact name or id
- setActiveComp: Activate a composition by name or index
- clearLayerSelection: Clear layer selection in a target composition
- selectLayers: Select layers by name or index in a target composition
- getLayerDetails: Detailed information for a specific layer
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
- enableMotionBlur: Enable motion blur on active, named, or all compositions
- sequenceLayerPosition: Sequence selected or named layers by position offsets
- copyPathsToMasks: Copy selected shape paths into masks
- setupTypewriterText: Add a typewriter rig to a text layer
- createTimerRig: Create a timer text rig with controls
- applyBwTint: Apply a reusable tint treatment to selected or named layers
- cleanupKeyframes: Clean up selected keyframes by mode
- setupRetimingMode: Apply retiming expressions and controllers to selected properties
- createDropdownController: Create or reuse a null controller with a dropdown menu
- linkOpacityToDropdown: Link target layer opacity to a dropdown controller
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
      const commandId = queueBridgeCommand("createComposition", params);
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("createComposition", commandId)}\n` +
                  `Composition: ${params.name}\n` +
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

// --- BEGIN NEW TOOLS --- 

// Zod schema for common layer targeting
const LayerTargetingSchema = {
  compIndex: z.number().int().positive().optional().describe("Optional 1-based composition index. Kept for backward compatibility."),
  compName: z.string().optional().describe("Optional exact composition name."),
  layerIndex: z.number().int().positive().optional().describe("Optional 1-based layer index. Kept for backward compatibility."),
  layerName: z.string().optional().describe("Optional exact layer name."),
  useSelectedLayer: z.boolean().optional().describe("When true, target the single selected layer in the active composition.")
};

const CompositionTargetingSchema = {
  compIndex: z.number().int().positive().optional().describe("Optional 1-based composition index. Kept for backward compatibility."),
  compName: z.string().optional().describe("Optional exact composition name. Defaults to the active composition.")
};

const LayerSelectionSchema = {
  ...CompositionTargetingSchema,
  layerNames: z.array(z.string()).optional().describe("Optional exact layer names to target."),
  layerIndexes: z.array(z.number().int().positive()).optional().describe("Optional 1-based layer indexes to target."),
  replaceSelection: z.boolean().optional().describe("When true, clear the current layer selection before selecting the targets.")
};

// Zod schema for keyframe value (more specific types might be needed depending on property)
// Using z.any() for flexibility, but can be refined (e.g., z.array(z.number()) for position/scale)
const KeyframeValueSchema = z.unknown().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

server.tool(
  "get-project-items",
  "List project items with optional type and name filters.",
  {
    itemType: z.enum(["Composition", "Folder", "Footage", "Solid"]).optional().describe("Optional project item type filter."),
    nameContains: z.string().optional().describe("Optional case-insensitive substring filter on item names."),
    includeCompDetails: z.boolean().optional().describe("When false, omit width/height/duration/frameRate fields for compositions.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("getProjectItems", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("getProjectItems", commandId)}\nUse the "get-results" tool after a few seconds to inspect the filtered item list.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing get-project-items command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "find-project-item",
  "Resolve a project item by exact name or item id.",
  {
    itemId: z.number().int().positive().optional().describe("Optional project item id."),
    exactName: z.string().optional().describe("Optional exact project item name."),
    itemType: z.enum(["Composition", "Folder", "Footage", "Solid"]).optional().describe("Optional project item type filter.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("findProjectItem", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("findProjectItem", commandId)}\nUse the "get-results" tool after a few seconds to inspect the resolved item or match list.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing find-project-item command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "set-active-comp",
  "Activate a composition in After Effects by name or index.",
  {
    ...CompositionTargetingSchema
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("setActiveComp", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("setActiveComp", commandId)}\nUse the "get-results" tool after a few seconds to confirm the active composition change.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing set-active-comp command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "clear-layer-selection",
  "Clear layer selection in the active or named composition.",
  {
    ...CompositionTargetingSchema
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("clearLayerSelection", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("clearLayerSelection", commandId)}\nUse the "get-results" tool after a few seconds to confirm the cleared selection.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing clear-layer-selection command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "select-layers",
  "Select one or more layers by name or index in the active or named composition.",
  {
    ...LayerSelectionSchema
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("selectLayers", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("selectLayers", commandId)}\nUse the "get-results" tool after a few seconds to inspect the selected layer set.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing select-layers command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "get-layer-details",
  "Get detailed information for a single layer in the active or named composition.",
  {
    ...LayerTargetingSchema
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("getLayerDetails", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("getLayerDetails", commandId)}\nUse the "get-results" tool after a few seconds to inspect layer details, switches, effects, and masks.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing get-layer-details command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Tool for setting a layer keyframe
server.tool(
  "setLayerKeyframe", // Corresponds to the function name in ExtendScript
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerTargetingSchema,
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("setLayerKeyframe", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("setLayerKeyframe", commandId)}\n` +
                  `Property: ${parameters.propertyName}\n` +
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
    ...LayerTargetingSchema,
    propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("setLayerExpression", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("setLayerExpression", commandId)}\n` +
                  `Property: ${parameters.propertyName}\n` +
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

server.tool(
  "enable-motion-blur",
  "Enable motion blur on layers in the active comp, a named comp, or all comps.",
  {
    scope: z.enum(["active_comp", "named_comp", "all_comps"]).optional().describe("Which composition scope to update."),
    compName: z.string().optional().describe("Exact composition name when scope is named_comp."),
    includeLocked: z.boolean().optional().describe("When true, temporarily unlock locked layers to enable motion blur.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("enableMotionBlur", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("enableMotionBlur", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing enable-motion-blur command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "sequence-layer-position",
  "Apply ordered position offsets across selected or named layers.",
  {
    compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
    layerNames: z.array(z.string()).optional().describe("Optional exact layer names to sequence."),
    useSelectedLayers: z.boolean().optional().describe("When true, use the selected layers in the active composition."),
    offsetX: z.number().optional().describe("Horizontal offset applied cumulatively per layer."),
    offsetY: z.number().optional().describe("Vertical offset applied cumulatively per layer."),
    order: z.enum(["layer_stack", "selection_order"]).optional().describe("Layer ordering to use while sequencing.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("sequenceLayerPosition", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("sequenceLayerPosition", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing sequence-layer-position command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "copy-paths-to-masks",
  "Copy selected shape paths into masks on the source layer or selected target layers.",
  {
    compName: z.string().optional().describe("Optional exact composition name. The composition must be active for selected-path workflows."),
    targetLayerMode: z.enum(["same_layer", "selected_layers"]).optional().describe("Where copied masks should be created."),
    layerNames: z.array(z.string()).optional().describe("Optional exact target layer names when targetLayerMode is selected_layers."),
    useSelectedLayers: z.boolean().optional().describe("When true and targetLayerMode is selected_layers, use the selected layers as destinations."),
    maskMode: z.enum(["add", "subtract", "intersect", "none"]).optional().describe("Mask mode for created masks.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("copyPathsToMasks", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("copyPathsToMasks", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing copy-paths-to-masks command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "setup-typewriter-text",
  "Apply a typewriter setup to a target text layer using a reusable controller.",
  {
    compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
    layerName: z.string().optional().describe("Optional exact text layer name."),
    useSelectedLayer: z.boolean().optional().describe("When true, use the single selected text layer in the active comp."),
    speed: z.number().optional().describe("Characters per second."),
    blinkSpeed: z.number().optional().describe("Cursor blink speed."),
    startAt: z.number().optional().describe("Delay before typing starts in seconds."),
    blinkOn: z.boolean().optional().describe("Whether to show the blinking cursor."),
    controllerName: z.string().optional().describe("Controller layer name. Defaults to CTRL_Typewriter.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("setupTypewriterText", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("setupTypewriterText", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setup-typewriter-text command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "create-timer-rig",
  "Create a timer text rig with built-in controls.",
  {
    compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
    mode: z.enum(["countup", "countdown"]).optional().describe("Whether the timer counts up or down."),
    timeFormat: z.enum(["HH:MM:SS", "MM:SS", "SS"]).optional().describe("How the timer should be displayed."),
    rate: z.number().optional().describe("Playback rate multiplier."),
    startHours: z.number().optional().describe("Starting hours."),
    startMinutes: z.number().optional().describe("Starting minutes."),
    startSeconds: z.number().optional().describe("Starting seconds."),
    showMilliseconds: z.boolean().optional().describe("Whether to include milliseconds."),
    allowNegativeTime: z.boolean().optional().describe("Whether to prefix negative time with a minus sign."),
    layerName: z.string().optional().describe("Name of the created timer layer.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("createTimerRig", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("createTimerRig", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing create-timer-rig command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "apply-bw-tint",
  "Apply a reusable BW tint effect setup to selected or named layers.",
  {
    compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
    layerNames: z.array(z.string()).optional().describe("Optional exact layer names to tint."),
    useSelectedLayers: z.boolean().optional().describe("When true, use the selected layers in the active composition."),
    amount: z.number().optional().describe("Tint amount from 0 to 100."),
    presetName: z.enum(["Neutral", "Warm", "Gold", "Orange", "Sepia", "Cool", "Teal"]).optional().describe("Named tint preset."),
    hexColor: z.string().optional().describe("Optional custom tint color in #RRGGBB or #RGB format."),
    whiteishAmount: z.number().optional().describe("How much to push the tint toward white, from 0 to 100."),
    skipLocked: z.boolean().optional().describe("Skip locked layers instead of modifying them.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("applyBwTint", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("applyBwTint", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing apply-bw-tint command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "cleanup-keyframes",
  "Clean up selected keyframes in the active composition.",
  {
    mode: z.enum(["remove_odd", "remove_even", "remove_duplicates", "remove_unnecessary"]).optional().describe("Cleanup mode to apply."),
    dryRun: z.boolean().optional().describe("When true, only preview removals without deleting keys."),
    keepFirst: z.boolean().optional().describe("Preserve the first keyframe on each property."),
    keepLast: z.boolean().optional().describe("Preserve the last keyframe on each property."),
    tolerance: z.number().optional().describe("Tolerance used for duplicate or unnecessary value comparisons.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("cleanupKeyframes", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("cleanupKeyframes", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing cleanup-keyframes command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "setup-retiming-mode",
  "Apply a retiming dropdown and expression to selected properties in the active composition.",
  {
    controllerName: z.string().optional().describe("Effect control name for the retiming dropdown."),
    defaultMode: z.enum(["comp_end", "comp_stretched", "layer_end", "layer_stretched"]).optional().describe("Default retiming mode to select in the dropdown.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("setupRetimingMode", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("setupRetimingMode", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing setup-retiming-mode command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "create-dropdown-controller",
  "Create or reuse a null controller layer with a dropdown menu.",
  {
    compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
    controllerName: z.string().optional().describe("Name of the null controller layer."),
    dropdownName: z.string().optional().describe("Name of the dropdown effect."),
    menuItems: z.array(z.string()).min(1).optional().describe("Menu items for the dropdown control."),
    selectedIndex: z.number().int().positive().optional().describe("Initially selected dropdown item (1-based)."),
    reuseIfExists: z.boolean().optional().describe("Reuse an existing controller layer when present.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("createDropdownController", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("createDropdownController", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing create-dropdown-controller command: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "link-opacity-to-dropdown",
  "Link selected or named layers to a dropdown controller by opacity expression.",
  {
    compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
    controllerName: z.string().optional().describe("Name of the controller layer."),
    dropdownName: z.string().optional().describe("Name of the dropdown effect."),
    layerNames: z.array(z.string()).optional().describe("Optional exact layer names to link."),
    useSelectedLayers: z.boolean().optional().describe("When true, use the selected layers in the active composition."),
    mappingMode: z.enum(["exclusive", "threshold"]).optional().describe("Opacity mapping mode for the dropdown values.")
  },
  async (parameters) => {
    try {
      const commandId = queueBridgeCommand("linkOpacityToDropdown", parameters);
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("linkOpacityToDropdown", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error queuing link-opacity-to-dropdown command: ${String(error)}`
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
      const commandId = queueBridgeCommand("applyEffect", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("applyEffect", commandId)}\n` +
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
      const commandId = queueBridgeCommand("applyEffectTemplate", parameters);
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("applyEffectTemplate", commandId)}\n` +
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
      const commandId = queueBridgeCommand("applyEffect", parameters);
      const result = await waitForBridgeResult({ expectedCommand: "applyEffect", expectedCommandId: commandId, timeoutMs: 6000, pollMs: 250 });
      
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
      const commandId = queueBridgeCommand("applyEffectTemplate", parameters);
      const result = await waitForBridgeResult({ expectedCommand: "applyEffectTemplate", expectedCommandId: commandId, timeoutMs: 6000, pollMs: 250 });
      
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
      const commandId = queueBridgeCommand("bridgeTestEffects", {});
      
      return {
        content: [
          {
            type: "text",
            text: `${describeQueuedCommand("bridgeTestEffects", commandId)}\n` +
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
