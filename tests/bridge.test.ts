// Test suite for the file-based IPC in src/bridge.ts (BL-013).
// Zero dependencies: Node's built-in runner, run with
//   node --experimental-strip-types --test tests/*.test.ts
// Each test points AE_MCP_BRIDGE_DIR at a throwaway directory, so the real
// ~/Documents/ae-mcp-bridge folder is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  clearResultsFile,
  getBridgeDir,
  isErrorResult,
  readResultsFromTempFile,
  runBridgeCommand,
  waitForBridgeResult,
  writeCommandFile,
} from "../src/bridge.ts";

function useTempBridgeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-mcp-bridge-"));
  process.env.AE_MCP_BRIDGE_DIR = dir;
  return dir;
}

function resultFile(dir: string): string {
  return path.join(dir, "ae_mcp_result.json");
}

function commandFile(dir: string): string {
  return path.join(dir, "ae_command.json");
}

test("getBridgeDir creates the configured directory", () => {
  const dir = path.join(useTempBridgeDir(), "nested", "deeper");
  process.env.AE_MCP_BRIDGE_DIR = dir;
  assert.equal(getBridgeDir(), dir);
  assert.ok(fs.statSync(dir).isDirectory());
});

test("writeCommandFile writes command, args, and pending status", () => {
  const dir = useTempBridgeDir();
  writeCommandFile("createComposition", { name: "Test", width: 1920 });

  const payload = JSON.parse(fs.readFileSync(commandFile(dir), "utf8"));
  assert.equal(payload.command, "createComposition");
  assert.deepEqual(payload.args, { name: "Test", width: 1920 });
  assert.equal(payload.status, "pending");
  assert.ok(!Number.isNaN(Date.parse(payload.timestamp)));
});

test("writeCommandFile throws when the bridge directory cannot be created", () => {
  const blocker = path.join(useTempBridgeDir(), "blocker");
  fs.writeFileSync(blocker, "not a directory");
  process.env.AE_MCP_BRIDGE_DIR = path.join(blocker, "child");

  assert.throws(() => writeCommandFile("anyCommand"));
});

test("clearResultsFile writes a waiting placeholder", () => {
  const dir = useTempBridgeDir();
  clearResultsFile();

  const payload = JSON.parse(fs.readFileSync(resultFile(dir), "utf8"));
  assert.equal(payload.status, "waiting");
});

test("readResultsFromTempFile returns fresh content unchanged", () => {
  const dir = useTempBridgeDir();
  const content = JSON.stringify({ success: true, _commandExecuted: "listCompositions" });
  fs.writeFileSync(resultFile(dir), content);

  assert.equal(readResultsFromTempFile(), content);
});

test("readResultsFromTempFile reports a stale result instead of returning it", () => {
  const dir = useTempBridgeDir();
  const file = resultFile(dir);
  fs.writeFileSync(file, JSON.stringify({ success: true }));
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(file, old, old);

  const payload = JSON.parse(readResultsFromTempFile());
  assert.equal(typeof payload.error, "string");
  assert.match(payload.error, /stale/i);
});

test("readResultsFromTempFile throws when no result has ever been written", () => {
  useTempBridgeDir();
  assert.throws(() => readResultsFromTempFile());
});

test("isErrorResult detects error payloads and unparseable content", () => {
  assert.equal(isErrorResult(JSON.stringify({ error: "boom" })), true);
  assert.equal(isErrorResult(JSON.stringify({ status: "error" })), true);
  assert.equal(isErrorResult("definitely not json"), true);
  assert.equal(isErrorResult(JSON.stringify({ status: "waiting" })), false);
  assert.equal(isErrorResult(JSON.stringify({ success: true })), false);
});

test("waitForBridgeResult resolves once the panel reports the expected command", async () => {
  const dir = useTempBridgeDir();
  const answer = JSON.stringify({ success: true, _commandExecuted: "listCompositions" });
  setTimeout(() => fs.writeFileSync(resultFile(dir), answer), 60);

  assert.equal(await waitForBridgeResult("listCompositions", 3000, 20), answer);
});

test("waitForBridgeResult ignores a result for a different command and times out", async () => {
  const dir = useTempBridgeDir();
  fs.writeFileSync(
    resultFile(dir),
    JSON.stringify({ success: true, _commandExecuted: "createComposition" })
  );

  const raw = await waitForBridgeResult("listCompositions", 200, 20);
  assert.equal(isErrorResult(raw), true);
  assert.match(JSON.parse(raw).error, /Timed out after 200ms/);
});

test("runBridgeCommand returns isError on timeout instead of stale success", async () => {
  useTempBridgeDir();
  const result = await runBridgeCommand("applyEffect", { compIndex: 1 }, 200);

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Timed out/);
});

test("runBridgeCommand returns the panel payload on success", async () => {
  const dir = useTempBridgeDir();
  const answer = JSON.stringify({ success: true, _commandExecuted: "applyEffect" });
  setTimeout(() => fs.writeFileSync(resultFile(dir), answer), 60);

  const result = await runBridgeCommand("applyEffect", { compIndex: 1 }, 3000);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].text, answer);
});
