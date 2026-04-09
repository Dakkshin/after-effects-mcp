import { z } from "zod";
import type { ExecuteBridgeCommandAndWait, FormatToolPayload, ToolServer } from "../toolContracts.js";
import { buildErrorEnvelope, buildResultEnvelope } from "../format.js";
import { buildCapabilityIndex, searchCapabilityCatalog } from "../../orchestration/capabilityIndex.js";

export function registerCapabilityTools(deps: {
  server: ToolServer;
  formatToolPayload: FormatToolPayload;
  executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
}) {
  const { server, formatToolPayload, executeBridgeCommandAndWait } = deps;

  async function loadCatalog(parameters: Record<string, unknown>) {
    return executeBridgeCommandAndWait("getCapabilityCatalog", parameters, {
      timeoutMs: 30000,
      maxAttempts: 2
    });
  }

  server.tool(
    "get-capability-index",
    "Fetch a lightweight capability index derived from the cached or generated AE capability catalog.",
    {
      forceRefresh: z.boolean().optional().describe("When true, rebuild the catalog before returning the index.")
    },
    async ({ forceRefresh = false }: { forceRefresh?: boolean }) => {
      const executed = await loadCatalog({ forceRefresh });
      if (!executed.ok) {
        return formatToolPayload(buildErrorEnvelope({
          source: "get-capability-index",
          message: String(executed.result?.message || "Capability index load failed."),
          meta: {
            retries: executed.retries,
            failureClass: executed.failureClass || null
          },
          data: {
            raw: executed.result
          }
        }), true);
      }

      const index = buildCapabilityIndex(executed.result);
      return formatToolPayload(buildResultEnvelope({
        source: "get-capability-index",
        message: "Capability index loaded successfully.",
        summary: index.counts,
        data: {
          index
        },
        meta: {
          retries: executed.retries,
          cached: index.cached
        }
      }));
    }
  );

  server.tool(
    "search-capability-catalog",
    "Search the AE capability catalog for layer types, property groups, effects, or fonts without loading the full catalog into the reasoning path.",
    {
      query: z.string().describe("Search query for effect names, matchNames, layer types, property groups, or fonts."),
      limit: z.number().int().positive().max(50).optional().describe("Maximum number of matches to return."),
      forceRefresh: z.boolean().optional().describe("When true, rebuild the capability catalog before searching.")
    },
    async ({ query, limit = 20, forceRefresh = false }: { query: string; limit?: number; forceRefresh?: boolean }) => {
      const executed = await loadCatalog({ forceRefresh });
      if (!executed.ok) {
        return formatToolPayload(buildErrorEnvelope({
          source: "search-capability-catalog",
          message: String(executed.result?.message || "Capability catalog search failed."),
          meta: {
            retries: executed.retries,
            failureClass: executed.failureClass || null
          },
          data: {
            raw: executed.result
          }
        }), true);
      }

      const matches = searchCapabilityCatalog(executed.result, query, limit);
      return formatToolPayload(buildResultEnvelope({
        source: "search-capability-catalog",
        message: matches.length > 0 ? "Capability search completed successfully." : "No capability matches found for the query.",
        summary: {
          query,
          count: matches.length
        },
        data: {
          matches
        },
        meta: {
          retries: executed.retries,
          cached: executed.result?.cached === true
        }
      }));
    }
  );
}
