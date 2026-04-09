import { z } from "zod";
import type {
  ExecuteBridgeCommandAndWait,
  ExecuteCommandThroughSafetyBound,
  QueueBridgeCommand,
  ToolServer
} from "../toolContracts.js";
import {
  CapabilityCatalogSchema,
  CompositionTargetingSchema,
  ContextResolverSchema,
  LayerSelectionSchema,
  LayerTargetingSchema,
  OrchestrationIntentSchema,
  OrchestrationParametersSchema
} from "../toolSchemas.js";
import { resolveExecutionRoute } from "../../orchestration/core.js";
import { buildErrorEnvelope, buildResultEnvelope, formatToolPayload } from "../format.js";

function buildQueuedResponse(describeQueuedCommand: (command: string, commandId: string) => string, command: string, commandId: string, detail: string) {
  return {
    content: [
      {
        type: "text",
        text: `${describeQueuedCommand(command, commandId)}\n${detail}`
      }
    ]
  };
}

function buildQueueError(toolName: string, error: unknown) {
  return {
    content: [
      {
        type: "text",
        text: `Error queuing ${toolName} command: ${String(error)}`
      }
    ],
    isError: true
  };
}

export function registerContextTools(deps: {
  server: ToolServer;
  describeQueuedCommand: (command: string, commandId: string) => string;
  queueBridgeCommand: QueueBridgeCommand;
  classifyIntent: (request: string, explicitIntent?: string) => any;
  buildOrchestrationPlan: (classified: any, parameters?: Record<string, unknown>) => any;
  executeOrchestrationPlan: (request: string, classified: any, plan: any, deps: {
    executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
    executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
  }) => Promise<any>;
  executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
  executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
}) {
  const {
    server,
    describeQueuedCommand,
    queueBridgeCommand,
    classifyIntent,
    buildOrchestrationPlan,
    executeOrchestrationPlan,
    executeBridgeCommandAndWait,
    executeCommandThroughSafety
  } = deps;

  server.tool(
    "runtime-context",
    "Fetch a live runtime context pack in one round trip for active comp, selections, resolved targets, and reusable named items.",
    {
      ...ContextResolverSchema
    },
    async (parameters: Record<string, unknown>) => {
      const executed = await executeBridgeCommandAndWait("getContextPack", parameters, {
        timeoutMs: 10000,
        maxAttempts: 2
      });

      const payload = {
        source: "runtime-context",
        message: executed.ok ? "Runtime context resolved successfully." : String(executed.result?.message || "Runtime context failed."),
        summary: {
          activeComp: executed.result?.activeComp || null,
          needsUserDisambiguation: executed.result?.needsUserDisambiguation === true,
          selectedLayers: Array.isArray(executed.result?.selectedLayers) ? executed.result.selectedLayers.length : 0,
          selectedProperties: Array.isArray(executed.result?.selectedProperties) ? executed.result.selectedProperties.length : 0,
          warnings: Array.isArray(executed.result?.warnings) ? executed.result.warnings : []
        },
        data: {
          context: executed.result
        },
        meta: {
          retries: executed.retries,
          failureClass: executed.failureClass || null
        }
      };

      return formatToolPayload(
        executed.ok ? buildResultEnvelope(payload) : buildErrorEnvelope({
          source: payload.source,
          message: String(payload.message),
          summary: payload.summary,
          data: payload.data,
          meta: payload.meta
        }),
        !executed.ok
      );
    }
  );

  server.tool(
    "get-project-items",
    "List project items with optional type and name filters.",
    {
      itemType: z.enum(["Composition", "Folder", "Footage", "Solid"]).optional().describe("Optional project item type filter."),
      nameContains: z.string().optional().describe("Optional case-insensitive substring filter on item names."),
      includeCompDetails: z.boolean().optional().describe("When false, omit width/height/duration/frameRate fields for compositions.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("getProjectItems", parameters);
        return buildQueuedResponse(describeQueuedCommand, "getProjectItems", commandId, 'Use the "get-results" tool after a few seconds to inspect the filtered item list.');
      } catch (error) {
        return buildQueueError("get-project-items", error);
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
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("findProjectItem", parameters);
        return buildQueuedResponse(describeQueuedCommand, "findProjectItem", commandId, 'Use the "get-results" tool after a few seconds to inspect the resolved item or match list.');
      } catch (error) {
        return buildQueueError("find-project-item", error);
      }
    }
  );

  server.tool(
    "set-active-comp",
    "Activate a composition in After Effects by name or index.",
    {
      ...CompositionTargetingSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("setActiveComp", parameters);
        return buildQueuedResponse(describeQueuedCommand, "setActiveComp", commandId, 'Use the "get-results" tool after a few seconds to confirm the active composition change.');
      } catch (error) {
        return buildQueueError("set-active-comp", error);
      }
    }
  );

  server.tool(
    "clear-layer-selection",
    "Clear layer selection in the active or named composition.",
    {
      ...CompositionTargetingSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("clearLayerSelection", parameters);
        return buildQueuedResponse(describeQueuedCommand, "clearLayerSelection", commandId, 'Use the "get-results" tool after a few seconds to confirm the cleared selection.');
      } catch (error) {
        return buildQueueError("clear-layer-selection", error);
      }
    }
  );

  server.tool(
    "select-layers",
    "Select one or more layers by name or index in the active or named composition.",
    {
      ...LayerSelectionSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("selectLayers", parameters);
        return buildQueuedResponse(describeQueuedCommand, "selectLayers", commandId, 'Use the "get-results" tool after a few seconds to inspect the selected layer set.');
      } catch (error) {
        return buildQueueError("select-layers", error);
      }
    }
  );

  server.tool(
    "get-layer-details",
    "Get detailed information for a single layer in the active or named composition.",
    {
      ...LayerTargetingSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("getLayerDetails", parameters);
        return buildQueuedResponse(describeQueuedCommand, "getLayerDetails", commandId, 'Use the "get-results" tool after a few seconds to inspect layer details, switches, effects, and masks.');
      } catch (error) {
        return buildQueueError("get-layer-details", error);
      }
    }
  );

  server.tool(
    "get-context-pack",
    "Queue a lightweight runtime context pack request for the current project, active comp, selections, resolved targets, and reusable named items.",
    {
      ...ContextResolverSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("getContextPack", parameters);
        return buildQueuedResponse(describeQueuedCommand, "getContextPack", commandId, 'Use the "get-results" tool after a few seconds to inspect the runtime context pack.');
      } catch (error) {
        return buildQueueError("get-context-pack", error);
      }
    }
  );

  server.tool(
    "resolve-targets",
    "Resolve comp, layer, selection, and property targets without mutating the project.",
    {
      ...ContextResolverSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("resolveTargets", parameters);
        return buildQueuedResponse(describeQueuedCommand, "resolveTargets", commandId, 'Use the "get-results" tool after a few seconds to inspect the resolved targets and ambiguities.');
      } catch (error) {
        return buildQueueError("resolve-targets", error);
      }
    }
  );

  server.tool(
    "get-capability-catalog",
    "Generate or load a cached capability catalog for the current AE host, separate from runtime context routing.",
    {
      ...CapabilityCatalogSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("getCapabilityCatalog", parameters);
        return buildQueuedResponse(describeQueuedCommand, "getCapabilityCatalog", commandId, 'Use the "get-results" tool after a few seconds to inspect the capability catalog or cache metadata.');
      } catch (error) {
        return buildQueueError("get-capability-catalog", error);
      }
    }
  );

  server.tool(
    "classify-intent",
    "Classify a production request into a deterministic orchestration intent and domain.",
    {
      request: z.string().describe("Natural-language production request."),
      explicitIntent: OrchestrationIntentSchema.optional().describe("Optional explicit intent override.")
    },
    async ({ request, explicitIntent }: { request: string; explicitIntent?: string }) => {
      const route = resolveExecutionRoute(request, explicitIntent);
      return formatToolPayload(buildResultEnvelope({
        source: "classify-intent",
        message: route.routeReady ? "Execution route classified successfully." : "No ready execution route found.",
        summary: {
          intent: route.classified.intent,
          domain: route.classified.domain,
          confidence: route.classified.confidence,
          candidateCount: route.wrapperCandidates.length,
          selectedWrapperId: route.selectedWrapperId
        },
        data: {
          route
        }
      }));
    }
  );

  server.tool(
    "build-execution-plan",
    "Build a deterministic execution plan from a classified or explicit orchestration intent.",
    {
      request: z.string().optional().describe("Natural-language production request."),
      explicitIntent: OrchestrationIntentSchema.optional().describe("Optional explicit intent override."),
      parameters: OrchestrationParametersSchema
    },
    async ({ request = "", explicitIntent, parameters = {} }: { request?: string; explicitIntent?: string; parameters?: Record<string, unknown> }) => {
      const route = resolveExecutionRoute(request, explicitIntent);
      const classified = route.classified;
      const plan = buildOrchestrationPlan(classified, parameters);
      return formatToolPayload(buildResultEnvelope({
        source: "build-execution-plan",
        message: plan.steps.length > 0 ? "Execution plan built successfully." : "No execution steps were produced.",
        summary: {
          intent: classified.intent,
          domain: classified.domain,
          stepCount: plan.steps.length,
          selectedWrapperId: route.selectedWrapperId
        },
        data: {
          route,
          plan
        }
      }), plan.steps.length === 0);
    }
  );

  server.tool(
    "orchestrate-request",
    "Execute a deterministic server-side orchestration flow for a supported AE production request.",
    {
      request: z.string().describe("Natural-language request or short execution label."),
      explicitIntent: OrchestrationIntentSchema.optional().describe("Optional explicit intent override for deterministic routing."),
      parameters: OrchestrationParametersSchema
    },
    async ({ request, explicitIntent, parameters = {} }: { request: string; explicitIntent?: string; parameters?: Record<string, unknown> }) => {
      const route = resolveExecutionRoute(request, explicitIntent);
      const classified = route.classified;
      if (classified.intent === "unknown") {
        return formatToolPayload(buildErrorEnvelope({
          source: "orchestrate-request",
          message: "Unsupported orchestration intent for the provided request.",
          summary: {
            intent: classified.intent,
            domain: classified.domain,
            selectedWrapperId: route.selectedWrapperId
          },
          data: {
            route
          }
        }), true);
      }

      const plan = buildOrchestrationPlan(classified, parameters);
      if (!plan.steps.length) {
        return formatToolPayload(buildErrorEnvelope({
          source: "orchestrate-request",
          message: "No execution steps were produced for the request.",
          summary: {
            intent: classified.intent,
            domain: classified.domain,
            selectedWrapperId: route.selectedWrapperId
          },
          data: {
            route
          }
        }), true);
      }

      const executed = await executeOrchestrationPlan(request, classified, plan, {
        executeBridgeCommandAndWait,
        executeCommandThroughSafety
      });
      const payload = buildResultEnvelope({
        source: "orchestrate-request",
        status: executed.ok ? "success" : "error",
        message: executed.ok ? "Orchestration completed." : String(executed.result?.message || "Orchestration failed."),
        summary: {
          request,
          intent: classified.intent,
          domain: classified.domain,
          selectedWrapperId: route.selectedWrapperId,
          stepCount: plan.steps.length,
          retries: executed.retries,
          failureClass: executed.failureClass || null
        },
        data: {
          route,
          classified,
          assumptions: plan.assumptions,
          steps: plan.steps.map((step: { phase: string; command: string; summary: string }) => ({
            phase: step.phase,
            command: step.command,
            summary: step.summary
          })),
          timeline: executed.timeline,
          finalResult: executed.result
        }
      });

      return formatToolPayload(payload, !executed.ok);
    }
  );
}
