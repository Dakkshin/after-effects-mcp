import { z } from "zod";
import type { FormatToolPayload, ToolServer } from "../toolContracts.js";
import { buildResultEnvelope } from "../format.js";
import { findWrapperCandidates, getIntentCatalog, getWrapperRegistry } from "../../orchestration/wrapperRegistry.js";

export function registerWrapperTools(deps: {
  server: ToolServer;
  formatToolPayload: FormatToolPayload;
}) {
  const { server, formatToolPayload } = deps;

  server.tool(
    "list-wrapper-registry",
    "List the wrapper registry metadata used for wrapper-first routing and workflow planning.",
    {
      domain: z.enum(["create", "animate", "rig", "cleanup", "effect", "render"]).optional().describe("Optional wrapper domain filter."),
      status: z.enum(["existing-wrapper", "existing-low-level", "planned-wrapper"]).optional().describe("Optional wrapper status filter.")
    },
    async ({ domain, status }: { domain?: string; status?: string }) => {
      const wrappers = getWrapperRegistry().filter((wrapper) => {
        if (domain && wrapper.domain !== domain) {
          return false;
        }
        if (status && wrapper.status !== status) {
          return false;
        }
        return true;
      });

      return formatToolPayload(buildResultEnvelope({
        source: "list-wrapper-registry",
        message: "Wrapper registry loaded successfully.",
        summary: {
          count: wrappers.length,
          domain: domain || null,
          status: status || null
        },
        data: {
          wrappers
        }
      }));
    }
  );

  server.tool(
    "get-intent-catalog",
    "List the intent catalog derived from the wrapper registry.",
    {},
    async () => {
      const intents = getIntentCatalog();
      return formatToolPayload(buildResultEnvelope({
        source: "get-intent-catalog",
        message: "Intent catalog loaded successfully.",
        summary: {
          count: intents.length
        },
        data: {
          intents
        }
      }));
    }
  );

  server.tool(
    "find-wrapper-candidates",
    "Recommend wrapper candidates for a natural-language AE production request.",
    {
      request: z.string().describe("Natural-language production request."),
      limit: z.number().int().positive().optional().describe("Maximum number of candidates to return.")
    },
    async ({ request, limit = 5 }: { request: string; limit?: number }) => {
      const candidates = findWrapperCandidates(request, limit);
      return formatToolPayload(buildResultEnvelope({
        source: "find-wrapper-candidates",
        message: candidates.length > 0 ? "Wrapper candidates resolved successfully." : "No wrapper candidates matched the request.",
        summary: {
          request,
          count: candidates.length,
          topCandidateId: candidates.length > 0 ? candidates[0].id : null
        },
        data: {
          candidates
        }
      }));
    }
  );
}
