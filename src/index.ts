import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  queueBridgeCommand,
  readResultsFromTempFile,
  waitForBridgeResult,
  withBridgeRoundTripLock
} from "./bridge/client.js";
import { executeBridgeCommandAndWait } from "./bridge/execution.js";
import {
  buildOrchestrationPlan,
  classifyIntent,
  executeOrchestrationPlan
} from "./orchestration/core.js";
import {
  createProjectCheckpoint,
  executeCommandThroughSafety,
  getSavedProjectInfoForSafety,
  inspectMutationPreflight,
  queueMutationWithSafety
} from "./orchestration/safetyRouting.js";
import { getOperationLogPath } from "./bridge/paths.js";
import { appendOperationLog } from "./observability/operationLog.js";
import {
  buildQueuedBridgeToolResponse,
  buildStructuredSafetyError,
  buildStructuredSkillError,
  classifyBridgeFailure,
  describeQueuedCommand,
  formatToolPayload,
  formatUserFacingResult,
  safeJsonParse,
  sanitizeMutationArgs
} from "./mcp/format.js";
import { registerBridgeTools } from "./mcp/tools/bridgeTools.js";
import { registerBasicTools } from "./mcp/tools/basicTools.js";
import { registerContextTools } from "./mcp/tools/contextTools.js";
import { registerMutationTools } from "./mcp/tools/mutationTools.js";
import { registerSkillTools } from "./mcp/tools/skillTools.js";
import { registerEffectTools } from "./mcp/tools/effectTools.js";
import { registerDiagnosticTools } from "./mcp/tools/diagnosticTools.js";
import { registerPromptTools } from "./mcp/tools/promptTools.js";
import { registerWrapperTools } from "./mcp/tools/wrapperTools.js";
import { registerCapabilityTools } from "./mcp/tools/capabilityTools.js";
import { CheckpointSelectionSchema } from "./mcp/toolSchemas.js";
import type { SafetyRoutingDependencies } from "./mcp/toolContracts.js";
import {
  SafetyError,
  buildBranchBeforeRestorePath,
  classifyMutationRisk,
  listCheckpointEntries,
  resolveCheckpointEntry
} from "./safety.js";

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
const safetyRoutingDependencies: SafetyRoutingDependencies = {
  queueBridgeCommand,
  waitForBridgeResult,
  executeBridgeCommandAndWait
};
const executeCommandThroughSafetyBound = (
  command: string,
  args: Record<string, any>,
  options?: { timeoutMs?: number; allowForceWithoutCheckpoint?: boolean }
) => executeCommandThroughSafety(command, args, options, safetyRoutingDependencies);
registerContextTools({
  server,
  describeQueuedCommand,
  queueBridgeCommand,
  classifyIntent,
  buildOrchestrationPlan,
  executeOrchestrationPlan,
  executeBridgeCommandAndWait,
  executeCommandThroughSafety: executeCommandThroughSafetyBound
});
registerBasicTools({
  server,
  queueBridgeCommand,
  buildQueuedBridgeToolResponse,
  describeQueuedCommand,
  formatToolPayload
});
registerMutationTools({
  server,
  queueBridgeCommand,
  queueMutationWithSafety,
  buildQueuedBridgeToolResponse,
  describeQueuedCommand,
  formatToolPayload,
  buildStructuredSafetyError,
  safetyRoutingDependencies
});
registerSkillTools({
  server,
  formatToolPayload,
  buildStructuredSkillError,
  executeCommandThroughSafety: executeCommandThroughSafetyBound,
  classifyIntent,
  buildOrchestrationPlan,
  executeOrchestrationPlan,
  executeBridgeCommandAndWait,
  safetyRoutingDependencies
});
registerEffectTools({
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
});
registerDiagnosticTools({
  server,
  fs
});
registerPromptTools({
  server
});
registerWrapperTools({
  server,
  formatToolPayload
});
registerCapabilityTools({
  server,
  formatToolPayload,
  executeBridgeCommandAndWait
});
registerBridgeTools({
  server,
  fs,
  getOperationLogPath,
  withBridgeRoundTripLock,
  queueBridgeCommand,
  waitForBridgeResult,
  readResultsFromTempFile,
  appendOperationLog,
  classifyBridgeFailure,
  classifyMutationRisk,
  sanitizeMutationArgs,
  formatToolPayload,
  formatUserFacingResult,
  buildQueuedBridgeToolResponse,
  buildStructuredSafetyError,
  safeJsonParse,
  queueMutationWithSafety,
  inspectMutationPreflight,
  getSavedProjectInfoForSafety,
  createProjectCheckpoint,
  executeBridgeCommandAndWait,
  listCheckpointEntries,
  resolveCheckpointEntry,
  buildBranchBeforeRestorePath,
  SafetyError,
  CheckpointSelectionSchema,
  safetyRoutingDependencies
});

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
