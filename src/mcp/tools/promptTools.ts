import { z } from "zod";
import type { ToolServer } from "../toolContracts.js";

export function registerPromptTools(deps: {
  server: ToolServer;
}) {
  const { server } = deps;

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
    (args: { compositionName: string }) => {
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

  server.prompt(
    "create-composition",
    "Create a new composition with specified settings",
    () => {
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: "Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc."
          }
        }]
      };
    }
  );

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
- getContextPack: Runtime context pack for active project, selections, and resolved targets
- runtime-context: Live runtime context round trip for active project, selections, resolved targets, and reusable named items
- resolveTargets: Resolve comp, layer, property, and selection targets without mutation
- getCapabilityCatalog: On-demand cached capability discovery for layer types, effects, and fonts
- get-capability-index: Lightweight index derived from the heavy capability catalog
- search-capability-catalog: Search the capability catalog without exposing the full detail surface by default
- list-wrapper-registry: Wrapper metadata catalog for wrapper-first routing
- get-intent-catalog: Intent catalog derived from wrapper metadata
- find-wrapper-candidates: Recommend wrapper candidates from a natural-language request
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- createSolidLayer: Create a new solid layer
- createBackgroundSolid: Create a full-frame background solid with safe defaults
- animateTextEntry: Apply a curated text entry animation to a text layer
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
}
