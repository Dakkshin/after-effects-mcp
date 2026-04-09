import { z } from "zod";
import type {
  BuildQueuedBridgeToolResponse,
  FormatToolPayload,
  QueueBridgeCommand,
  ToolServer
} from "../toolContracts.js";

export function registerBasicTools(deps: {
  server: ToolServer;
  queueBridgeCommand: QueueBridgeCommand;
  buildQueuedBridgeToolResponse: BuildQueuedBridgeToolResponse;
  describeQueuedCommand: (command: string, commandId: string) => string;
  formatToolPayload: FormatToolPayload;
}) {
  const {
    server,
    queueBridgeCommand,
    buildQueuedBridgeToolResponse,
    describeQueuedCommand,
    formatToolPayload
  } = deps;

  server.tool(
    "getProjectInfo",
    "Legacy compatibility tool for reading active project information.",
    {},
    async () => {
      try {
        const commandId = await queueBridgeCommand("getProjectInfo", {});
        return buildQueuedBridgeToolResponse("getProjectInfo", commandId);
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Failed to queue getProjectInfo: ${String(error)}`
        }, true);
      }
    }
  );

  server.tool(
    "listCompositions",
    "Legacy compatibility tool for listing project compositions.",
    {},
    async () => {
      try {
        const commandId = await queueBridgeCommand("listCompositions", {});
        return buildQueuedBridgeToolResponse("listCompositions", commandId);
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Failed to queue listCompositions: ${String(error)}`
        }, true);
      }
    }
  );

  server.tool(
    "getLayerInfo",
    "Legacy compatibility tool for reading layer information in the active composition.",
    {},
    async () => {
      try {
        const commandId = await queueBridgeCommand("getLayerInfo", {});
        return buildQueuedBridgeToolResponse("getLayerInfo", commandId);
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Failed to queue getLayerInfo: ${String(error)}`
        }, true);
      }
    }
  );

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
    async (params: {
      name: string;
      width: number;
      height: number;
      pixelAspect?: number;
      duration?: number;
      frameRate?: number;
      backgroundColor?: { r: number; g: number; b: number };
    }) => {
      try {
        const commandId = await queueBridgeCommand("createComposition", params);
        return {
          content: [
            {
              type: "text",
              text:
                `${describeQueuedCommand("createComposition", commandId)}\n` +
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
}
