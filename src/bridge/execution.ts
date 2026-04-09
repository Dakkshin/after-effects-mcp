import { queueBridgeCommand, waitForBridgeResult, withBridgeRoundTripLock } from "./client.js";
import { appendOperationLog } from "../observability/operationLog.js";
import { classifyBridgeFailure, safeJsonParse } from "../mcp/format.js";

export async function executeBridgeCommandAndWait(
  command: string,
  args: Record<string, any> = {},
  options: { timeoutMs?: number; maxAttempts?: number } = {}
): Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxAttempts = options.maxAttempts ?? 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await withBridgeRoundTripLock(async () => {
      const commandId = await queueBridgeCommand(command, args);
      appendOperationLog({
        timestamp: new Date().toISOString(),
        phase: "wait",
        status: "info",
        command,
        commandId,
        detail: `Waiting for bridge result (attempt ${attempt}/${maxAttempts}).`
      });
      return await waitForBridgeResult({
        expectedCommand: command,
        expectedCommandId: commandId,
        timeoutMs,
        pollMs: 250
      });
    });
    const parsed = safeJsonParse(raw) ?? { status: "error", message: raw };
    if (parsed?.status === "success") {
      appendOperationLog({
        timestamp: new Date().toISOString(),
        phase: "result",
        status: "success",
        command,
        commandId: parsed?._commandId || parsed?.commandId || null,
        detail: "Bridge command completed successfully.",
        meta: {
          result: parsed
        }
      });
      return { ok: true, result: parsed, retries: attempt - 1 };
    }

    const classified = classifyBridgeFailure(parsed);
    appendOperationLog({
      timestamp: new Date().toISOString(),
      phase: "result",
      status: classified.transient && attempt < maxAttempts ? "retry" : "error",
      command,
      commandId: parsed?._commandId || parsed?.commandId || null,
      failureClass: classified.failureClass,
      detail: parsed?.message || parsed?.error || "Bridge command failed.",
      meta: {
        result: parsed,
        attempt,
        maxAttempts
      }
    });
    if (!classified.transient || attempt === maxAttempts) {
      return {
        ok: false,
        result: parsed,
        retries: attempt - 1,
        failureClass: classified.failureClass
      };
    }
  }

  return {
    ok: false,
    result: { status: "error", message: "Unknown orchestration failure" },
    retries: maxAttempts - 1,
    failureClass: "unknown"
  };
}
