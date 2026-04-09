import {
  SafetyError,
  classifyMutationRisk,
  createCheckpointEntry
} from "../safety.js";
import {
  buildStructuredSafetyError,
  classifyBridgeFailure,
  describeQueuedCommand,
  safeJsonParse,
  sanitizeMutationArgs
} from "../mcp/format.js";

export async function getSavedProjectInfoForSafety(
  executeBridgeCommandAndWait: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; maxAttempts?: number }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>
) {
  const executed = await executeBridgeCommandAndWait("getProjectInfo", {}, {
    timeoutMs: 10000,
    maxAttempts: 2
  });

  if (!executed.ok) {
    throw new SafetyError("PROJECT_INFO_FAILED", "Unable to inspect the active After Effects project before a safety operation.", {
      result: executed.result
    });
  }

  const projectPath = String(executed.result?.path || "").trim();
  return {
    raw: executed.result,
    projectPath,
    isSaved: Boolean(projectPath),
    revision: typeof executed.result?.revision === "number" ? executed.result.revision : null,
    projectName: executed.result?.projectName || null
  };
}

export async function inspectMutationPreflight(
  command: string,
  args: Record<string, any>,
  riskClass: string,
  executeBridgeCommandAndWait: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; maxAttempts?: number }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>
) {
  const executed = await executeBridgeCommandAndWait("preflightMutation", {
    command,
    args,
    riskClass
  }, {
    timeoutMs: 10000,
    maxAttempts: 2
  });

  if (!executed.ok) {
    throw new SafetyError("PREFLIGHT_COMMAND_FAILED", "After Effects did not complete the mutation preflight successfully.", {
      command,
      result: executed.result
    });
  }

  if (executed.result?.status !== "success") {
    throw new SafetyError("PREFLIGHT_FAILED", "Mutation preflight reported a blocking error.", {
      command,
      result: executed.result
    });
  }

  return executed.result;
}

export async function createProjectCheckpoint(
  label: string | undefined,
  dependencies: {
    executeBridgeCommandAndWait: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; maxAttempts?: number }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>;
  }
) {
  const prepared = await dependencies.executeBridgeCommandAndWait("prepareProjectCheckpoint", {
    label: label || undefined
  }, {
    timeoutMs: 30000,
    maxAttempts: 2
  });

  if (!prepared.ok) {
    throw new SafetyError("CHECKPOINT_PREPARE_FAILED", "After Effects could not prepare the project for checkpointing.", {
      result: prepared.result
    });
  }

  const projectPath = String(prepared.result?.projectPath || "").trim();
  if (!projectPath) {
    throw new SafetyError("PROJECT_NOT_SAVED", "Checkpoint creation requires a saved project path.", {
      result: prepared.result
    });
  }

  const created = await createCheckpointEntry({
    projectPath,
    label,
    revision: typeof prepared.result?.revisionAfterSave === "number" ? prepared.result.revisionAfterSave : null
  });

  return {
    status: "success",
    message: "Checkpoint created successfully.",
    projectPath,
    revision: typeof prepared.result?.revisionAfterSave === "number" ? prepared.result.revisionAfterSave : null,
    recoveredManifestFromBackup: created.recoveredFromBackup,
    manifestPath: created.manifest.manifestPath,
    checkpointDirectory: created.manifest.checkpointDirectory,
    checkpoint: created.checkpoint,
    host: prepared.result
  };
}

export async function queueMutationWithSafety(
  command: string,
  args: Record<string, any> = {},
  options: { allowForceWithoutCheckpoint?: boolean } = {},
  dependencies: {
    queueBridgeCommand: (command: string, args?: Record<string, any>) => Promise<string>;
    executeBridgeCommandAndWait: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; maxAttempts?: number }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>;
  }
) {
  const risk = classifyMutationRisk(command);
  const sanitizedArgs = sanitizeMutationArgs(args);
  const response: Record<string, unknown> = {
    status: "queued",
    command,
    safety: {
      riskClass: risk.riskClass,
      reason: risk.reason
    }
  };

  if (!risk.isMutation) {
    const commandId = await dependencies.queueBridgeCommand(command, sanitizedArgs);
    response.commandId = commandId;
    response.message = describeQueuedCommand(command, commandId);
    return response;
  }

  if (risk.riskClass === "blocked") {
    throw new SafetyError("RISK_BLOCKED", "This operation is blocked by the safety policy unless a dedicated administrative tool handles it.", {
      command
    });
  }

  if (risk.riskClass === "medium" || risk.riskClass === "high") {
    response.preflight = await inspectMutationPreflight(command, sanitizedArgs, risk.riskClass, dependencies.executeBridgeCommandAndWait);
  }

  if (risk.riskClass === "high") {
    const allowForce = options.allowForceWithoutCheckpoint === true && args.forceWithoutCheckpoint === true;
    const projectInfo = await getSavedProjectInfoForSafety(dependencies.executeBridgeCommandAndWait);
    response.project = {
      projectName: projectInfo.projectName,
      projectPath: projectInfo.projectPath || null,
      revision: projectInfo.revision
    };

    if (!projectInfo.isSaved) {
      if (!allowForce) {
        throw new SafetyError("CHECKPOINT_REQUIRED_UNSAVED_PROJECT", "High-risk mutations require checkpointing, but the active After Effects project has not been saved.", {
          command,
          riskClass: risk.riskClass
        });
      }
      response.checkpoint = {
        status: "skipped",
        forcedWithoutCheckpoint: true,
        reason: "Checkpointing is impossible on an unsaved project and the administrative force flag was supplied."
      };
    } else {
      response.checkpoint = await createProjectCheckpoint(typeof args.checkpointLabel === "string" ? args.checkpointLabel : command, {
        executeBridgeCommandAndWait: dependencies.executeBridgeCommandAndWait
      });
    }
  }

  const commandId = await dependencies.queueBridgeCommand(command, sanitizedArgs);
  response.commandId = commandId;
  response.message = describeQueuedCommand(command, commandId);
  return response;
}

export async function executeCommandThroughSafety(
  command: string,
  args: Record<string, any> = {},
  options: { timeoutMs?: number; allowForceWithoutCheckpoint?: boolean } = {},
  dependencies: {
    queueBridgeCommand: (command: string, args?: Record<string, any>) => Promise<string>;
    waitForBridgeResult: (options?: { expectedCommand?: string; expectedCommandId?: string; timeoutMs?: number; pollMs?: number }) => Promise<string>;
    executeBridgeCommandAndWait: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; maxAttempts?: number }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>;
  }
): Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }> {
  const risk = classifyMutationRisk(command);

  if (!risk.isMutation) {
    return dependencies.executeBridgeCommandAndWait(command, args, {
      timeoutMs: options.timeoutMs ?? 8000,
      maxAttempts: 2
    });
  }

  try {
    const queued = await queueMutationWithSafety(command, args, {
      allowForceWithoutCheckpoint: options.allowForceWithoutCheckpoint
    }, {
      queueBridgeCommand: dependencies.queueBridgeCommand,
      executeBridgeCommandAndWait: dependencies.executeBridgeCommandAndWait
    });
    const commandId = String(queued?.commandId || "");
    if (!commandId) {
      return {
        ok: true,
        result: queued,
        retries: 0
      };
    }

    const raw = await dependencies.waitForBridgeResult({
      expectedCommand: command,
      expectedCommandId: commandId,
      timeoutMs: options.timeoutMs ?? 12000,
      pollMs: 250
    });
    const parsed = safeJsonParse(raw) ?? { status: "error", message: raw };
    const combined = {
      ...queued,
      bridgeResult: parsed
    };

    if (parsed?.status === "success") {
      return {
        ok: true,
        result: combined,
        retries: 0
      };
    }

    const classified = classifyBridgeFailure(parsed);
    return {
      ok: false,
      result: combined,
      retries: 0,
      failureClass: classified.failureClass
    };
  } catch (error) {
    return {
      ok: false,
      result: buildStructuredSafetyError(error, "SKILL_STEP_SAFETY_FAILED", `Failed to execute '${command}' through safety routing.`),
      retries: 0,
      failureClass: "safety-policy"
    };
  }
}
