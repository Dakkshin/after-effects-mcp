import { z } from "zod";
import type {
  ExecuteBridgeCommandAndWait,
  FormatToolPayload,
  QueueBridgeCommand,
  QueueMutationWithSafety,
  SafetyRoutingDependencies,
  ToolServer,
  WaitForBridgeResult
} from "../toolContracts.js";

const EffectTemplateSchema = z.enum([
  "gaussian-blur",
  "directional-blur",
  "color-balance",
  "brightness-contrast",
  "curves",
  "glow",
  "drop-shadow",
  "cinematic-look",
  "text-pop"
]);

export function registerEffectTools(deps: {
  server: ToolServer;
  queueBridgeCommand: QueueBridgeCommand;
  waitForBridgeResult: WaitForBridgeResult;
  withBridgeRoundTripLock: <T>(work: () => Promise<T>) => Promise<T>;
  inspectMutationPreflight: (command: string, args: Record<string, any>, riskClass: string, executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait) => Promise<any>;
  executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
  queueMutationWithSafety: QueueMutationWithSafety;
  sanitizeMutationArgs: (args?: Record<string, any>) => Record<string, any>;
  describeQueuedCommand: (command: string, commandId: string) => string;
  formatToolPayload: FormatToolPayload;
  buildStructuredSafetyError: (error: unknown, fallbackCode: string, fallbackMessage: string) => Record<string, unknown>;
  safetyRoutingDependencies: SafetyRoutingDependencies;
}) {
  const {
    server,
    queueBridgeCommand,
    waitForBridgeResult,
    withBridgeRoundTripLock,
    inspectMutationPreflight,
    executeBridgeCommandAndWait,
    queueMutationWithSafety,
    sanitizeMutationArgs,
    describeQueuedCommand,
    formatToolPayload,
    buildStructuredSafetyError,
    safetyRoutingDependencies
  } = deps;

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
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("applyEffect", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "APPLY_EFFECT_FAILED", "Failed to queue apply-effect."),
          true
        );
      }
    }
  );

  server.tool(
    "apply-effect-template",
    "Apply a predefined effect template to a layer in After Effects",
    {
      compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      templateName: EffectTemplateSchema.describe("Name of the effect template to apply."),
      customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("applyEffectTemplate", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "APPLY_EFFECT_TEMPLATE_FAILED", "Failed to queue apply-effect-template."),
          true
        );
      }
    }
  );

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
    async (parameters: Record<string, unknown>) => {
      try {
        await inspectMutationPreflight("applyEffect", sanitizeMutationArgs(parameters), "medium", executeBridgeCommandAndWait);
        const result = await withBridgeRoundTripLock(async () => {
          const commandId = await queueBridgeCommand("applyEffect", sanitizeMutationArgs(parameters));
          return await waitForBridgeResult({ expectedCommand: "applyEffect", expectedCommandId: commandId, timeoutMs: 6000, pollMs: 250 });
        });
        return {
          content: [
            {
              type: "text",
              text: result
            }
          ]
        };
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "APPLY_EFFECT_DIRECT_FAILED", "Failed to apply effect."),
          true
        );
      }
    }
  );

  server.tool(
    "mcp_aftereffects_applyEffectTemplate",
    "Apply a predefined effect template to a layer in After Effects",
    {
      compIndex: z.number().int().positive().describe("1-based index of the target composition in the project panel."),
      layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
      templateName: EffectTemplateSchema.describe("Name of the effect template to apply."),
      customSettings: z.record(z.string(), z.unknown()).optional().describe("Optional custom settings to override defaults.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        await inspectMutationPreflight("applyEffectTemplate", sanitizeMutationArgs(parameters), "medium", executeBridgeCommandAndWait);
        const result = await withBridgeRoundTripLock(async () => {
          const commandId = await queueBridgeCommand("applyEffectTemplate", sanitizeMutationArgs(parameters));
          return await waitForBridgeResult({ expectedCommand: "applyEffectTemplate", expectedCommandId: commandId, timeoutMs: 6000, pollMs: 250 });
        });
        return {
          content: [
            {
              type: "text",
              text: result
            }
          ]
        };
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "APPLY_EFFECT_TEMPLATE_DIRECT_FAILED", "Failed to apply effect template."),
          true
        );
      }
    }
  );

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

  server.tool(
    "run-bridge-test",
    "Run the bridge test effects script to verify communication and apply test effects",
    {},
    async () => {
      try {
        const commandId = await queueBridgeCommand("bridgeTestEffects", {});

        return {
          content: [
            {
              type: "text",
              text:
                `${describeQueuedCommand("bridgeTestEffects", commandId)}\n` +
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
}
