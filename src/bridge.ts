// bridge.ts
// File-based IPC with the After Effects "MCP Bridge Auto" ScriptUI panel.
//
// Contract: the MCP server writes ae_command.json (status "pending"); the panel
// polls it every checkInterval ms, executes, and writes ae_mcp_result.json with
// _commandExecuted set to the command name. Every helper here fails loudly —
// a write that cannot land throws, and a command that is never picked up is
// reported as an error, never as success.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const COMMAND_FILE = "ae_command.json";
const RESULT_FILE = "ae_mcp_result.json";

// Panel polls every 2s; give it room for several ticks plus AE execution time.
export const DEFAULT_TIMEOUT_MS = 15000;
const STALE_AFTER_MS = 30000;

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/**
 * Directory shared with the After Effects bridge panel.
 * Override with AE_MCP_BRIDGE_DIR (used by the test suite).
 */
export function getBridgeDir(): string {
  const dir = process.env.AE_MCP_BRIDGE_DIR || path.join(os.homedir(), "Documents", "ae-mcp-bridge");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resultPath(): string {
  return path.join(getBridgeDir(), RESULT_FILE);
}

export interface CommandPayload {
  command: string;
  args: Record<string, unknown>;
  timestamp: string;
  status: "pending" | "running" | "completed" | "error";
}

export function writeCommandFile(command: string, args: Record<string, unknown> = {}): void {
  const payload: CommandPayload = {
    command,
    args,
    timestamp: new Date().toISOString(),
    status: "pending",
  };
  fs.writeFileSync(path.join(getBridgeDir(), COMMAND_FILE), JSON.stringify(payload, null, 2));
}

export function clearResultsFile(): void {
  const resetData = {
    status: "waiting",
    message: "Waiting for new result from After Effects...",
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(resultPath(), JSON.stringify(resetData, null, 2));
}

/**
 * Read the last result written by the panel. Old or missing results are
 * reported as such instead of being passed off as current output.
 */
export function readResultsFromTempFile(): string {
  const filePath = resultPath();
  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  if (stats.mtime < new Date(Date.now() - STALE_AFTER_MS)) {
    return JSON.stringify({
      error: "Result file appears to be stale (not recently updated).",
      message:
        "After Effects is not writing results, or the MCP Bridge Auto panel is not running.",
      lastModified: stats.mtime.toISOString(),
      originalContent: content,
    });
  }
  return content;
}

/** True when a bridge payload reports a failure. */
export function isErrorResult(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; status?: unknown };
    return typeof parsed.error === "string" || parsed.status === "error";
  } catch {
    return true;
  }
}

/**
 * Poll until the panel writes a result for `expectedCommand`.
 * Returns the timeout notice as an error payload rather than stale content.
 */
export async function waitForBridgeResult(
  expectedCommand?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  pollMs: number = 250
): Promise<string> {
  const target = resultPath();
  const start = Date.now();
  let lastContent = "";

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(target)) {
      const content = fs.readFileSync(target, "utf8");
      if (content && content !== lastContent) {
        lastContent = content;
        try {
          const parsed = JSON.parse(content) as { _commandExecuted?: unknown };
          if (!expectedCommand || parsed._commandExecuted === expectedCommand) {
            return content;
          }
        } catch {
          // Not a complete result yet; keep polling.
        }
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return JSON.stringify({
    error: `Timed out after ${timeoutMs}ms waiting for the After Effects bridge${
      expectedCommand ? ` to run "${expectedCommand}"` : ""
    }. Confirm the "MCP Bridge Auto" panel is open with Auto-run enabled.`,
  });
}

/**
 * Queue a command and wait for its real outcome.
 * Throws only when the command file itself cannot be written.
 */
export async function runBridgeCommand(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ToolResult> {
  clearResultsFile();
  writeCommandFile(command, args);
  const raw = await waitForBridgeResult(command, timeoutMs);
  return isErrorResult(raw)
    ? { content: [{ type: "text", text: raw }], isError: true }
    : { content: [{ type: "text", text: raw }] };
}
