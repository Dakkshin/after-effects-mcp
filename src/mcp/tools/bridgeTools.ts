import { z } from "zod";
import type {
  BuildQueuedBridgeToolResponse,
  ExecuteBridgeCommandAndWait,
  FormatToolPayload,
  QueueMutationWithSafety,
  SafetyRoutingDependencies,
  ToolServer
} from "../toolContracts.js";

export function registerBridgeTools(deps: {
  server: ToolServer;
  fs: typeof import("fs");
  getOperationLogPath: () => string;
  withBridgeRoundTripLock: <T>(work: () => Promise<T>) => Promise<T>;
  queueBridgeCommand: (command: string, args?: Record<string, any>) => Promise<string>;
  waitForBridgeResult: (options?: { expectedCommand?: string; expectedCommandId?: string; timeoutMs?: number; pollMs?: number }) => Promise<string>;
  readResultsFromTempFile: () => Promise<string>;
  appendOperationLog: (entry: any) => void;
  classifyBridgeFailure: (result: any) => { transient: boolean; failureClass: string };
  classifyMutationRisk: (command: string) => any;
  sanitizeMutationArgs: (args?: Record<string, any>) => Record<string, any>;
  formatToolPayload: FormatToolPayload;
  formatUserFacingResult: (result: any) => Record<string, unknown>;
  buildQueuedBridgeToolResponse: BuildQueuedBridgeToolResponse;
  buildStructuredSafetyError: (error: unknown, fallbackCode: string, fallbackMessage: string) => Record<string, unknown>;
  safeJsonParse: <T = any>(value: string) => T | null;
  queueMutationWithSafety: QueueMutationWithSafety;
  inspectMutationPreflight: (command: string, args: Record<string, any>, riskClass: string, executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait) => Promise<any>;
  getSavedProjectInfoForSafety: (executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait) => Promise<any>;
  createProjectCheckpoint: (label: string | undefined, deps: { executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait }) => Promise<any>;
  executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
  listCheckpointEntries: (projectPath: string) => any;
  resolveCheckpointEntry: (projectPath: string, checkpointId?: string) => any;
  buildBranchBeforeRestorePath: (projectPath: string, checkpointId: string) => string;
  SafetyError: any;
  CheckpointSelectionSchema: Record<string, unknown>;
  safetyRoutingDependencies: SafetyRoutingDependencies;
}) {
  const {
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
  } = deps;

  server.resource(
    "compositions",
    "aftereffects://compositions",
    async (uri: any) => {
      const result = await withBridgeRoundTripLock(async () => {
        const commandId = await queueBridgeCommand("listCompositions", {});
        return await waitForBridgeResult({ expectedCommand: "listCompositions", expectedCommandId: commandId, timeoutMs: 6000, pollMs: 250 });
      });

      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: result
        }]
      };
    }
  );

  server.tool(
    "run-script",
    "Run a read-only script in After Effects",
    {
      script: z.string().describe("Name of the predefined script to run"),
      parameters: z.record(z.string(), z.unknown()).optional().describe("Optional parameters for the script")
    },
    async ({ script, parameters = {} }: { script: string; parameters?: Record<string, unknown> }) => {
      const allowedScripts = [
        "getProjectItems",
        "findProjectItem",
        "setActiveComp",
        "clearLayerSelection",
        "selectLayers",
        "getLayerDetails",
        "getContextPack",
        "resolveTargets",
        "getCapabilityCatalog",
        "listCompositions",
        "getProjectInfo",
        "getLayerInfo",
        "createComposition",
        "createTextLayer",
        "createShapeLayer",
        "createSolidLayer",
        "createBackgroundSolid",
        "animateTextEntry",
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
        "setLayerMask",
        "preflightMutation",
        "prepareProjectCheckpoint",
        "restoreCheckpoint"
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
        const safety = classifyMutationRisk(script);
        if (safety.isMutation) {
          const payload = await queueMutationWithSafety(script, parameters, { allowForceWithoutCheckpoint: true }, safetyRoutingDependencies);
          return formatToolPayload(payload);
        }

        const commandId = await queueBridgeCommand(script, sanitizeMutationArgs(parameters));
        return formatToolPayload({
          status: "queued",
          command: script,
          commandId,
          message: `Command "${script}" has been queued.\nCommand ID: ${commandId}\nPlease ensure the "MCP Bridge Auto" panel is open in After Effects.\nUse the "get-results" tool after a few seconds to check for results.`
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "RUN_SCRIPT_FAILED", "Failed to queue the requested script."),
          true
        );
      }
    }
  );

  server.tool(
    "get-results",
    "Get results from the last script executed in After Effects",
    {
      commandId: z.string().optional().describe("Optional command id to verify against the latest bridge result."),
      command: z.string().optional().describe("Optional command name to verify against the latest bridge result.")
    },
    async ({ commandId, command }: { commandId?: string; command?: string }) => {
      try {
        const result = await readResultsFromTempFile();
        let parsed: any = null;
        try {
          parsed = JSON.parse(result);
        } catch {
          parsed = null;
        }
        if (commandId || command) {
          if (commandId && parsed?._commandId !== commandId && parsed?.commandId !== commandId) {
            return formatToolPayload({
              status: "error",
              message: `Latest result does not match command id '${commandId}'.`,
              requestedCommandId: commandId,
              actualCommandId: parsed?._commandId || parsed?.commandId || null,
              summary: {
                whatChanged: [],
                targetUsed: null,
                warnings: [],
                nextAction: "Wait for the requested command to finish or inspect the latest bridge command id."
              }
            }, true);
          }
          if (command && parsed?._commandExecuted !== command && parsed?.command !== command) {
            return formatToolPayload({
              status: "error",
              message: `Latest result does not match command '${command}'.`,
              requestedCommand: command,
              actualCommand: parsed?._commandExecuted || parsed?.command || null,
              summary: {
                whatChanged: [],
                targetUsed: null,
                warnings: [],
                nextAction: "Wait for the requested command to finish or inspect the latest bridge command name."
              }
            }, true);
          }
        }

        if (parsed) {
          appendOperationLog({
            timestamp: new Date().toISOString(),
            phase: "read-result",
            status: parsed?.status === "error" ? "error" : "success",
            command: parsed?._commandExecuted || parsed?.command || command || null,
            commandId: parsed?._commandId || parsed?.commandId || commandId || null,
            failureClass: parsed?.status === "error" ? classifyBridgeFailure(parsed).failureClass : null,
            detail: "Read latest bridge result through get-results.",
            meta: {
              result: parsed
            }
          });
          return formatToolPayload(formatUserFacingResult(parsed), parsed?.status === "error");
        }

        return formatToolPayload({
          status: "success",
          summary: {
            whatChanged: [],
            targetUsed: null,
            warnings: [],
            nextAction: "Inspect the raw result string."
          },
          result
        });
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Error getting results: ${String(error)}`,
          summary: {
            whatChanged: [],
            targetUsed: null,
            warnings: [],
            nextAction: "Inspect bridge log output and verify ae_mcp_result.json is writable."
          }
        }, true);
      }
    }
  );

  server.tool(
    "inspect-mutation-safety",
    "Run the phase-3 safety classifier and AE preflight checks for a mutation command without executing it.",
    {
      command: z.string().describe("Bridge command name to inspect."),
      args: z.record(z.string(), z.unknown()).optional().describe("Arguments that would be sent to the mutation command.")
    },
    async ({ command, args = {} }: { command: string; args?: Record<string, unknown> }) => {
      try {
        const safety = classifyMutationRisk(command);
        const payload: Record<string, unknown> = {
          status: "success",
          command,
          safety
        };

        if (safety.isMutation && (safety.riskClass === "medium" || safety.riskClass === "high")) {
          payload.preflight = await inspectMutationPreflight(command, sanitizeMutationArgs(args), safety.riskClass, executeBridgeCommandAndWait);
        }

        if (safety.isMutation && safety.riskClass === "high") {
          const projectInfo = await getSavedProjectInfoForSafety(executeBridgeCommandAndWait);
          payload.project = {
            projectName: projectInfo.projectName,
            projectPath: projectInfo.projectPath || null,
            revision: projectInfo.revision,
            canCheckpoint: projectInfo.isSaved
          };
        }

        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "INSPECT_MUTATION_SAFETY_FAILED", "Failed to inspect mutation safety."),
          true
        );
      }
    }
  );

  server.tool(
    "create-checkpoint",
    "Create a safety checkpoint for the active saved After Effects project and record it in the phase-3 manifest.",
    {
      label: z.string().optional().describe("Optional short label for the checkpoint.")
    },
    async ({ label }: { label?: string }) => {
      try {
        const payload = await createProjectCheckpoint(label, { executeBridgeCommandAndWait });
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "CREATE_CHECKPOINT_FAILED", "Failed to create a project checkpoint."),
          true
        );
      }
    }
  );

  server.tool(
    "list-checkpoints",
    "List recorded checkpoints for the active project or for an explicit project path.",
    {
      ...CheckpointSelectionSchema
    },
    async ({ projectPath }: { projectPath?: string }) => {
      try {
        const resolvedProjectPath = projectPath || (await getSavedProjectInfoForSafety(executeBridgeCommandAndWait)).projectPath;
        if (!resolvedProjectPath) {
          throw new SafetyError("PROJECT_NOT_SAVED", "Cannot list checkpoints because the active project is unsaved and no canonical project path was provided.");
        }

        const listed = await listCheckpointEntries(resolvedProjectPath);
        return formatToolPayload({
          status: "success",
          projectPath: resolvedProjectPath,
          recoveredManifestFromBackup: listed.recoveredFromBackup,
          manifestPath: listed.manifest.manifestPath,
          checkpointDirectory: listed.manifest.checkpointDirectory,
          checkpoints: listed.manifest.checkpoints
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "LIST_CHECKPOINTS_FAILED", "Failed to list project checkpoints."),
          true
        );
      }
    }
  );

  server.tool(
    "restore-checkpoint",
    "Restore a saved checkpoint by reopening the checkpoint project in After Effects, with branch-before-revert enabled by default.",
    {
      ...CheckpointSelectionSchema,
      branchBeforeRevert: z.boolean().optional().describe("Save the current open project to a branch path before opening the checkpoint. Defaults to true.")
    },
    async ({ projectPath, checkpointId, branchBeforeRevert = true }: { projectPath?: string; checkpointId?: string; branchBeforeRevert?: boolean }) => {
      try {
        const resolvedProjectPath = projectPath || (await getSavedProjectInfoForSafety(executeBridgeCommandAndWait)).projectPath;
        if (!resolvedProjectPath) {
          throw new SafetyError("PROJECT_NOT_SAVED", "Cannot restore a checkpoint because the active project is unsaved and no canonical project path was provided.");
        }

        const resolved = await resolveCheckpointEntry(resolvedProjectPath, checkpointId);
        const branchPath = branchBeforeRevert ? buildBranchBeforeRestorePath(resolvedProjectPath, resolved.checkpoint.id) : null;
        const restore = await executeBridgeCommandAndWait("restoreCheckpoint", {
          checkpointPath: resolved.checkpoint.checkpointPath,
          branchPath,
          branchBeforeRevert
        }, {
          timeoutMs: 45000,
          maxAttempts: 1
        });

        if (!restore.ok || restore.result?.status !== "success") {
          throw new SafetyError("RESTORE_CHECKPOINT_FAILED", "After Effects failed to reopen the requested checkpoint.", {
            result: restore.result,
            checkpointId: resolved.checkpoint.id,
            checkpointPath: resolved.checkpoint.checkpointPath
          });
        }

        return formatToolPayload({
          status: "success",
          message: "Checkpoint restored successfully.",
          recoveredManifestFromBackup: resolved.recoveredFromBackup,
          checkpoint: resolved.checkpoint,
          branchBeforeRevert,
          branchPath,
          host: restore.result
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "RESTORE_CHECKPOINT_FAILED", "Failed to restore project checkpoint."),
          true
        );
      }
    }
  );

  server.tool(
    "get-operation-log",
    "Read recent structured bridge/server operation log entries for diagnosis.",
    {
      commandId: z.string().optional().describe("Optional command id filter."),
      command: z.string().optional().describe("Optional command name filter."),
      limit: z.number().int().positive().max(200).optional().describe("Maximum number of log entries to return.")
    },
    async ({ commandId, command, limit = 50 }: { commandId?: string; command?: string; limit?: number }) => {
      try {
        const logPath = getOperationLogPath();
        if (!fs.existsSync(logPath)) {
          return formatToolPayload({
            status: "success",
            logPath,
            count: 0,
            entries: []
          });
        }

        const entries = fs.readFileSync(logPath, "utf8")
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line: string) => safeJsonParse(line))
          .filter((entry: any) => Boolean(entry))
          .filter((entry: any) => !commandId || entry.commandId === commandId)
          .filter((entry: any) => !command || entry.command === command)
          .slice(-limit);

        return formatToolPayload({
          status: "success",
          logPath,
          count: entries.length,
          entries
        });
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Failed to read operation log: ${String(error)}`
        }, true);
      }
    }
  );
}
