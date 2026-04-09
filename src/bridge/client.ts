import * as fs from "fs";
import { getAECommandFilePath, getAEResultFilePath } from "./paths.js";
import { appendOperationLog } from "../observability/operationLog.js";

const fsp = fs.promises;
let bridgeRoundTripChain: Promise<void> = Promise.resolve();

export type WaitForBridgeResultOptions = {
  expectedCommand?: string;
  expectedCommandId?: string;
  timeoutMs?: number;
  pollMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function statIfExists(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fsp.stat(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function readResultsFromTempFile(): Promise<string> {
  try {
    const tempFilePath = getAEResultFilePath();
    console.error(`Checking for results at: ${tempFilePath}`);

    const stats = await statIfExists(tempFilePath);
    if (stats) {
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);

      const content = await fsp.readFile(tempFilePath, "utf8");
      console.error(`Result file content length: ${content.length} bytes`);

      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error("WARNING: Result file is older than 30 seconds. After Effects may not be updating results.");
        return JSON.stringify({
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the MCP Bridge Auto panel isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }

      return content;
    }

    console.error(`Result file not found at: ${tempFilePath}`);
    return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}

export async function waitForBridgeResult(options: WaitForBridgeResultOptions = {}): Promise<string> {
  const { expectedCommand, expectedCommandId, timeoutMs = 5000, pollMs = 250 } = options;
  const start = Date.now();
  const resultPath = getAEResultFilePath();
  let lastContent = "";
  let lastMtimeMs = -1;
  let currentPollMs = Math.max(100, pollMs);
  const maxPollMs = Math.max(currentPollMs, 1500);

  while (Date.now() - start < timeoutMs) {
    try {
      const stats = await statIfExists(resultPath);
      if (stats && stats.mtimeMs !== lastMtimeMs) {
        lastMtimeMs = stats.mtimeMs;
        const content = await fsp.readFile(resultPath, "utf8");
        if (content && content.length > 0 && content !== lastContent) {
          lastContent = content;
          try {
            const parsed = JSON.parse(content);
            if (parsed?.status === "waiting" && parsed?._placeholder === true) {
              currentPollMs = Math.min(maxPollMs, Math.max(100, Math.round(currentPollMs * 1.5)));
              continue;
            }
            if (expectedCommand && parsed?._commandExecuted !== expectedCommand) {
              currentPollMs = Math.min(maxPollMs, Math.max(100, Math.round(currentPollMs * 1.5)));
              continue;
            }
            if (expectedCommandId && parsed?._commandId !== expectedCommandId) {
              currentPollMs = Math.min(maxPollMs, Math.max(100, Math.round(currentPollMs * 1.5)));
              continue;
            }
            if (!expectedCommand || parsed?._commandExecuted === expectedCommand) {
              return content;
            }
          } catch {
            // not JSON yet; continue polling
          }
        }
      }
    } catch {
      // transient read error; continue polling
    }
    await sleep(currentPollMs);
    currentPollMs = Math.min(maxPollMs, Math.max(100, Math.round(currentPollMs * 1.25)));
  }

  return JSON.stringify({
    status: "error",
    message: `Timed out waiting for bridge result${expectedCommand ? ` for command '${expectedCommand}'` : ""}${expectedCommandId ? ` (${expectedCommandId})` : ""}.`,
    command: expectedCommand || null,
    commandId: expectedCommandId || null
  });
}

export function createCommandId(command: string): string {
  return `${command}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function writeCommandFile(command: string, args: Record<string, any> = {}, commandId: string = createCommandId(command)): Promise<string> {
  try {
    const commandFile = getAECommandFilePath();
    const commandData = {
      command,
      args,
      commandId,
      timestamp: new Date().toISOString(),
      status: "pending"
    };
    await fsp.writeFile(commandFile, JSON.stringify(commandData, null, 2), "utf8");
    console.error(`Command "${command}" (${commandId}) written to ${commandFile}`);
  } catch (error) {
    console.error("Error writing command file:", error);
    throw error;
  }
  return commandId;
}

async function clearResultsFile(commandId?: string, command?: string): Promise<void> {
  try {
    const resultFile = getAEResultFilePath();
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      command: command || null,
      commandId: commandId || null,
      timestamp: new Date().toISOString(),
      _placeholder: true
    };

    await fsp.writeFile(resultFile, JSON.stringify(resetData, null, 2), "utf8");
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
    throw error;
  }
}

export async function queueBridgeCommand(command: string, args: Record<string, any> = {}): Promise<string> {
  const commandId = createCommandId(command);
  await clearResultsFile(commandId, command);
  appendOperationLog({
    timestamp: new Date().toISOString(),
    phase: "queue",
    status: "info",
    command,
    commandId,
    detail: "Queued command for bridge execution.",
    meta: {
      args
    }
  });
  return await writeCommandFile(command, { ...args, commandId }, commandId);
}

export async function withBridgeRoundTripLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = bridgeRoundTripChain;
  let release!: () => void;
  bridgeRoundTripChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}
