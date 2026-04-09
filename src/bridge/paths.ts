import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let cachedWindowsDocumentsDir: string | null | undefined;
let cachedDocumentsDir: string | undefined;
let cachedAETempDir: string | undefined;
let cachedAELogsDir: string | undefined;
let cachedOperationLogPath: string | undefined;
let cachedCommandFilePath: string | undefined;
let cachedResultFilePath: string | undefined;

function resolveWindowsDocumentsDir(): string | null {
  if (cachedWindowsDocumentsDir !== undefined) {
    return cachedWindowsDocumentsDir;
  }

  if (process.platform !== "win32") {
    cachedWindowsDocumentsDir = null;
    return cachedWindowsDocumentsDir;
  }

  try {
    const output = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v Personal',
      { encoding: "utf8" }
    );
    const match = output.match(/Personal\s+REG_\w+\s+([^\r\n]+)/);
    if (match?.[1]) {
      const expanded = match[1].replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
      cachedWindowsDocumentsDir = path.resolve(expanded.trim());
      return cachedWindowsDocumentsDir;
    }
  } catch (error) {
    console.error("Failed to resolve Documents path from registry:", error);
  }

  cachedWindowsDocumentsDir = null;
  return cachedWindowsDocumentsDir;
}

export function resolveDocumentsDir(): string {
  if (cachedDocumentsDir) {
    return cachedDocumentsDir;
  }

  const homeDir = os.homedir();
  const candidates = [
    resolveWindowsDocumentsDir(),
    process.env.OneDriveCommercial ? path.join(process.env.OneDriveCommercial, "Documents") : null,
    process.env.OneDriveConsumer ? path.join(process.env.OneDriveConsumer, "Documents") : null,
    process.env.OneDrive ? path.join(process.env.OneDrive, "Documents") : null,
    path.join(homeDir, "Documents")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedDocumentsDir = candidate;
      return cachedDocumentsDir;
    }
  }

  cachedDocumentsDir = candidates[0];
  return cachedDocumentsDir;
}

export function getAETempDir(): string {
  if (!cachedAETempDir) {
    cachedAETempDir = path.join(resolveDocumentsDir(), "ae-mcp-bridge");
    fs.mkdirSync(cachedAETempDir, { recursive: true });
  }
  return cachedAETempDir;
}

export function getAELogsDir(): string {
  if (!cachedAELogsDir) {
    cachedAELogsDir = path.join(getAETempDir(), "logs");
    fs.mkdirSync(cachedAELogsDir, { recursive: true });
  }
  return cachedAELogsDir;
}

export function getOperationLogPath(): string {
  if (!cachedOperationLogPath) {
    cachedOperationLogPath = path.join(getAELogsDir(), "ae_mcp_operation_log.jsonl");
  }
  return cachedOperationLogPath;
}

export function getAECommandFilePath(): string {
  if (!cachedCommandFilePath) {
    cachedCommandFilePath = path.join(getAETempDir(), "ae_command.json");
  }
  return cachedCommandFilePath;
}

export function getAEResultFilePath(): string {
  if (!cachedResultFilePath) {
    cachedResultFilePath = path.join(getAETempDir(), "ae_mcp_result.json");
  }
  return cachedResultFilePath;
}
