import * as fs from "fs";
import { getOperationLogPath } from "../bridge/paths.js";

const fsp = fs.promises;
let operationLogWriteChain: Promise<void> = Promise.resolve();

export type OperationLogEntry = {
  timestamp: string;
  phase: string;
  status: "info" | "success" | "error" | "retry";
  command?: string | null;
  commandId?: string | null;
  failureClass?: string | null;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
};

export function appendOperationLog(entry: OperationLogEntry): void {
  const line = `${JSON.stringify(entry)}\n`;
  operationLogWriteChain = operationLogWriteChain
    .then(() => fsp.appendFile(getOperationLogPath(), line, "utf8"))
    .catch((error) => {
      console.error("Failed to append operation log:", error);
    });
}
