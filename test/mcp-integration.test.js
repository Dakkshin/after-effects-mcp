// MCP integration test with a fake After Effects bridge (spec §9, §11).
//
// Spawns build/index.js over stdio with a temporary HOME/USERPROFILE so the bridge directory is
// <tmp>/Documents/ae-mcp-bridge, and plays the role of the "MCP Bridge Auto" panel by polling
// ae_command.json and writing ae_mcp_result.json.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { REPO_ROOT } from "./helpers/load-pure.js";

const BUILD_INDEX = path.join(REPO_ROOT, "build", "index.js");
const BRIDGE_TIMEOUT_MS = 1500;
const CALL_TIMEOUT_MS = 15000; // hard cap per MCP request so a broken server cannot hang the run
const TEST_TIMEOUT_MS = 30000;

let tmpHome;
let bridgeDir;
let commandFile;
let resultFile;
let client;
let transport;
let stderrBuf = "";

// ---------------------------------------------------------------------------------------------
// Fake bridge
// ---------------------------------------------------------------------------------------------
const fakeBridge = {
  timer: null,
  received: [],
  receivedRaw: [],
  responder: null,
  start(responder) {
    this.stop();
    this.responder = responder;
    this.timer = setInterval(() => this.poll(), 50);
  },
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },
  poll() {
    let cmd;
    let bytes;
    try {
      if (!fs.existsSync(commandFile)) return;
      bytes = fs.readFileSync(commandFile);
      cmd = JSON.parse(bytes.toString("utf8"));
    } catch {
      return; // partially written; try again next tick
    }
    if (!cmd || cmd.status !== "pending") return;
    this.received.push(cmd);
    this.receivedRaw.push(bytes);
    const canned = this.responder(cmd);
    const result = { ...canned, _commandExecuted: cmd.command, _responseTimestamp: new Date().toISOString() };
    try {
      fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
      fs.writeFileSync(commandFile, JSON.stringify({ ...cmd, status: "completed" }, null, 2));
    } catch {
      // ignore; the server will time out and the assertion will say so
    }
  },
};

function cannedSuccess(cmd) {
  switch (cmd.command) {
    case "importFootage":
      return {
        status: "success",
        message: "Footage imported successfully",
        footage: {
          id: 42, name: path.basename(cmd.args.filePath || "x"), filePath: cmd.args.filePath,
          width: 1920, height: 1080, duration: 10, frameRate: 25, pixelAspect: 1,
          isStill: false, hasVideo: true, hasAudio: true, parentFolder: { id: 1, name: "Root" },
        },
        alreadyInProject: false,
        existingItemIds: [],
        folder: null,
      };
    case "addFootageLayer":
      return {
        status: "success",
        message: "Footage layer added successfully",
        layer: { index: 1, name: "clip", startTime: -1, inPoint: 1, outPoint: 4, duration: 3, position: null, hasVideo: true, hasAudio: true },
        footage: { id: 42, name: "clip", isStill: false },
        composition: { index: 1, id: 7, name: "Comp 1", frameRate: 25, duration: 10 },
        computed: { startTime: -1, inPoint: 1, outPoint: 4, sourceInPoint: 2, sourceOutPoint: 5 },
        warnings: [],
      };
    case "setLayerTimeRemap":
      return {
        status: "success",
        message: "Time remap keyframes set successfully",
        layer: { index: 1, name: "clip", inPoint: 0, outPoint: 10 },
        composition: { index: 1, id: 7, name: "Comp 1" },
        timeRemapWasEnabled: false,
        autoKeyframesRemoved: 2,
        keyframesAdded: 2,
        keyframesReplaced: 0,
        keyframes: [{ timeInSeconds: 0, sourceTimeInSeconds: 0 }, { timeInSeconds: 2, sourceTimeInSeconds: 5 }],
        warnings: [],
      };
    default:
      return { status: "success", message: `fake result for ${cmd.command}` };
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
async function call(name, args) {
  return client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
}

function textOf(res) {
  assert.ok(res && Array.isArray(res.content) && res.content.length > 0, `tool result has no content: ${JSON.stringify(res)}`);
  const t = res.content.find((c) => c.type === "text");
  assert.ok(t, "tool result has no text content");
  return t.text;
}

function jsonOf(res) {
  const text = textOf(res);
  try {
    return JSON.parse(text);
  } catch {
    assert.fail(`tool result text is not JSON: ${text}`);
  }
}

function removeBridgeFiles() {
  for (const f of [commandFile, resultFile]) {
    try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
  }
}

function readCommandFile() {
  if (!fs.existsSync(commandFile)) return null;
  return JSON.parse(fs.readFileSync(commandFile, "utf8"));
}

async function expectNodeSideError(name, args, code) {
  const res = await call(name, args);
  assert.equal(res.isError, true, `expected isError for ${name} ${JSON.stringify(args)}; got ${JSON.stringify(res)}`);
  const body = jsonOf(res);
  assert.equal(body.status, "error");
  assert.equal(body.code, code);
  assert.equal(typeof body.message, "string");
  assert.ok(body.message.length > 0);
  assert.equal(readCommandFile(), null, `no command file may be written for a Node-side validation error (${name})`);
  assert.equal(fakeBridge.received.length, 0, "fake bridge must not receive a command");
}

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------
before(async () => {
  assert.ok(fs.existsSync(BUILD_INDEX), `${BUILD_INDEX} not found — run "npm run build" (npm test runs it via pretest)`);
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ae-mcp-test-"));
  bridgeDir = path.join(tmpHome, "Documents", "ae-mcp-bridge");
  fs.mkdirSync(bridgeDir, { recursive: true });
  commandFile = path.join(bridgeDir, "ae_command.json");
  resultFile = path.join(bridgeDir, "ae_mcp_result.json");

  transport = new StdioClientTransport({
    command: process.execPath,
    args: [BUILD_INDEX],
    env: { ...process.env, USERPROFILE: tmpHome, HOME: tmpHome, AE_MCP_BRIDGE_TIMEOUT_MS: String(BRIDGE_TIMEOUT_MS) },
    stderr: "pipe",
    cwd: REPO_ROOT,
  });
  const errStream = transport.stderr;
  if (errStream) errStream.on("data", (d) => { stderrBuf = (stderrBuf + d.toString()).slice(-20000); });
  client = new Client({ name: "ae-mcp-integration-test", version: "1.0.0" });
  await client.connect(transport, { timeout: CALL_TIMEOUT_MS });
}, { timeout: TEST_TIMEOUT_MS });

after(async () => {
  fakeBridge.stop();
  try { if (client) await client.close(); } catch { /* ignore */ }
  try { if (transport) await transport.close(); } catch { /* ignore */ }
  if (tmpHome) {
    try { fs.rmSync(tmpHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

beforeEach(() => {
  fakeBridge.stop();
  fakeBridge.received = [];
  fakeBridge.receivedRaw = [];
  removeBridgeFiles();
});

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------
describe("MCP footage tools (fake bridge)", { timeout: 120000 }, () => {
  test("listTools exposes the three footage tools with the expected input schemas", { timeout: TEST_TIMEOUT_MS }, async () => {
    const { tools } = await client.listTools(undefined, { timeout: CALL_TIMEOUT_MS });
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const expected = {
      importFootage: { props: ["filePath", "folderName"], required: ["filePath"] },
      addFootageLayer: {
        props: ["compIndex", "footageId", "footageName", "compStartTime", "sourceInPoint", "sourceOutPoint", "position"],
        required: ["compIndex", "compStartTime"],
      },
      setLayerTimeRemap: { props: ["compIndex", "layerIndex", "keyframes"], required: ["compIndex", "layerIndex", "keyframes"] },
    };
    for (const [name, exp] of Object.entries(expected)) {
      const t = byName[name];
      assert.ok(t, `tool ${name} not listed (tools: ${Object.keys(byName).join(", ")})`);
      assert.ok(typeof t.description === "string" && t.description.length > 20, `${name} needs a description`);
      const props = Object.keys((t.inputSchema && t.inputSchema.properties) || {}).sort();
      assert.deepEqual(props, [...exp.props].sort(), `${name} inputSchema.properties`);
      assert.deepEqual([...(t.inputSchema.required || [])].sort(), [...exp.required].sort(), `${name} inputSchema.required`);
    }
    const kf = byName.setLayerTimeRemap.inputSchema.properties.keyframes;
    assert.equal(kf.type, "array");
    assert.deepEqual(Object.keys(kf.items.properties).sort(), ["sourceTimeInSeconds", "timeInSeconds"]);
    // Existing tools are still there.
    for (const n of ["run-script", "get-results", "get-help"]) assert.ok(byName[n], `existing tool ${n} missing`);
  });

  test("importFootage: relative path → INVALID_ARGS, no command written", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("importFootage", { filePath: path.join("relative", "clip.mp4") }, "INVALID_ARGS");
  });

  test("importFootage: missing absolute path → FILE_NOT_FOUND, no command written", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("importFootage", { filePath: path.join(tmpHome, "does-not-exist.mp4") }, "FILE_NOT_FOUND");
  });

  test("importFootage: directory → NOT_A_FILE, no command written", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("importFootage", { filePath: tmpHome }, "NOT_A_FILE");
  });

  test("importFootage: UNC path (backslashes) → INVALID_ARGS, no command written", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("importFootage", { filePath: "\\\\server\\share\\clip.mp4" }, "INVALID_ARGS");
  });

  test("importFootage: UNC path (forward slashes) → INVALID_ARGS, no command written", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("importFootage", { filePath: "//server/share/clip.mp4" }, "INVALID_ARGS");
  });

  test("importFootage: drive-relative path \\foo → INVALID_ARGS on win32", {
    timeout: TEST_TIMEOUT_MS,
    skip: process.platform !== "win32" ? "win32-only rule" : false,
  }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("importFootage", { filePath: "\\foo\\clip.mp4" }, "INVALID_ARGS");
    await expectNodeSideError("importFootage", { filePath: "/foo/clip.mp4" }, "INVALID_ARGS");
  });

  test("importFootage: non-ASCII (Cyrillic) file name is forwarded intact", { timeout: TEST_TIMEOUT_MS }, async () => {
    const file = path.join(tmpHome, "кадр.png");
    fs.writeFileSync(file, "png");
    fakeBridge.start(cannedSuccess);
    const res = await call("importFootage", { filePath: file });
    assert.ok(!res.isError, textOf(res));
    assert.equal(fakeBridge.received[0].args.filePath, path.resolve(file));
    // The command file must be UTF-8 without BOM (ExtendScript reads it with encoding = "UTF-8").
    const bytes = fakeBridge.receivedRaw[0];
    assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), "command file must not start with a BOM");
    assert.ok(bytes.includes(Buffer.from("кадр.png", "utf8")), "file name must be UTF-8 encoded in the command file");
  });

  test("importFootage: valid file → forwarded with resolved path; bridge result returned verbatim", { timeout: TEST_TIMEOUT_MS }, async () => {
    const file = path.join(tmpHome, "media", "clip.mp4");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "not really a video");
    fakeBridge.start(cannedSuccess);
    // Non-normalised absolute path: the server must forward path.resolve(file).
    const unnormalised = [tmpHome, "media", ".", "..", "media", "clip.mp4"].join(path.sep);
    assert.notEqual(unnormalised, path.resolve(file));
    const res = await call("importFootage", { filePath: unnormalised, folderName: "Footage" });
    assert.ok(!res.isError, `unexpected isError: ${textOf(res)}`);
    const body = jsonOf(res);
    assert.equal(fakeBridge.received.length, 1, "bridge should receive exactly one command");
    const cmd = fakeBridge.received[0];
    assert.equal(cmd.command, "importFootage");
    assert.equal(cmd.args.filePath, path.resolve(file));
    assert.equal(cmd.args.folderName, "Footage");
    const expected = { ...cannedSuccess(cmd), _commandExecuted: "importFootage" };
    delete expected._responseTimestamp;
    const { _responseTimestamp, ...bodyRest } = body;
    assert.equal(typeof _responseTimestamp, "string", "_responseTimestamp must be passed through");
    assert.deepEqual(bodyRest, expected);
  });

  test("importFootage: folderName omitted → not forwarded", { timeout: TEST_TIMEOUT_MS }, async () => {
    const file = path.join(tmpHome, "still.png");
    fs.writeFileSync(file, "png");
    fakeBridge.start(cannedSuccess);
    const res = await call("importFootage", { filePath: file });
    assert.ok(!res.isError, textOf(res));
    assert.deepEqual(fakeBridge.received[0].args, { filePath: path.resolve(file) });
  });

  test("importFootage: bridge status:error → isError true, error JSON passed through", { timeout: TEST_TIMEOUT_MS }, async () => {
    const file = path.join(tmpHome, "bad.mp4");
    fs.writeFileSync(file, "x");
    fakeBridge.start(() => ({ status: "error", code: "CANNOT_IMPORT", message: "After Effects cannot import this file as footage" }));
    const res = await call("importFootage", { filePath: file });
    assert.equal(res.isError, true, textOf(res));
    const body = jsonOf(res);
    assert.equal(body.status, "error");
    assert.equal(body.code, "CANNOT_IMPORT");
    assert.equal(body._commandExecuted, "importFootage");
  });

  test("importFootage: no bridge → non-error timeout message after ~AE_MCP_BRIDGE_TIMEOUT_MS", { timeout: TEST_TIMEOUT_MS }, async () => {
    const file = path.join(tmpHome, "slow.mp4");
    fs.writeFileSync(file, "x");
    const t0 = Date.now();
    const res = await call("importFootage", { filePath: file });
    const elapsed = Date.now() - t0;
    assert.ok(!res.isError, `timeout must not be an error: ${JSON.stringify(res)}`);
    const text = textOf(res);
    assert.ok(text.includes("Timed out"), `text should include "Timed out": ${text}`);
    assert.ok(text.includes("get-results"), `text should mention get-results: ${text}`);
    assert.ok(text.includes("importFootage"), `text should name the command: ${text}`);
    assert.ok(elapsed >= BRIDGE_TIMEOUT_MS - 100, `returned too early (${elapsed} ms)`);
    assert.ok(elapsed < BRIDGE_TIMEOUT_MS + 4000, `took too long (${elapsed} ms); env override ignored? (default is 20 s)`);
    const cmd = readCommandFile();
    assert.ok(cmd && cmd.command === "importFootage" && cmd.status === "pending", "command should stay queued");
  });

  test("addFootageLayer: both footageId and footageName → INVALID_ARGS", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("addFootageLayer", { compIndex: 1, footageId: 3, footageName: "clip.mp4", compStartTime: 0 }, "INVALID_ARGS");
  });

  test("addFootageLayer: neither footageId nor footageName → INVALID_ARGS", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("addFootageLayer", { compIndex: 1, compStartTime: 0 }, "INVALID_ARGS");
  });

  test("addFootageLayer: sourceInPoint == sourceOutPoint → INVALID_ARGS", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("addFootageLayer", { compIndex: 1, footageId: 3, compStartTime: 0, sourceInPoint: 3, sourceOutPoint: 3 }, "INVALID_ARGS");
  });

  test("addFootageLayer: sourceInPoint > sourceOutPoint → INVALID_ARGS", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    await expectNodeSideError("addFootageLayer", { compIndex: 1, footageId: 3, compStartTime: 0, sourceInPoint: 5, sourceOutPoint: 2 }, "INVALID_ARGS");
  });

  test("addFootageLayer: valid params are forwarded unchanged and the result returned", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    const params = { compIndex: 1, footageId: 42, compStartTime: 1, sourceInPoint: 2, sourceOutPoint: 5, position: [960, 540] };
    const res = await call("addFootageLayer", params);
    assert.ok(!res.isError, textOf(res));
    assert.equal(fakeBridge.received.length, 1);
    assert.equal(fakeBridge.received[0].command, "addFootageLayer");
    assert.deepEqual(fakeBridge.received[0].args, params);
    const body = jsonOf(res);
    assert.equal(body._commandExecuted, "addFootageLayer");
    assert.equal(body.layer.startTime, -1);
  });

  test("addFootageLayer: footageName selector with negative compStartTime is forwarded", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    const params = { compIndex: 2, footageName: "still.png", compStartTime: -0.5 };
    const res = await call("addFootageLayer", params);
    assert.ok(!res.isError, textOf(res));
    assert.deepEqual(fakeBridge.received[0].args, params);
  });

  test("addFootageLayer: bridge error (e.g. OUT_EXCEEDS_DURATION) → isError true", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(() => ({ status: "error", code: "OUT_EXCEEDS_DURATION", field: "sourceOutPoint", message: "sourceOutPoint (12 s) exceeds the source duration (10 s)" }));
    const res = await call("addFootageLayer", { compIndex: 1, footageId: 42, compStartTime: 0, sourceOutPoint: 12 });
    assert.equal(res.isError, true, textOf(res));
    const body = jsonOf(res);
    assert.equal(body.code, "OUT_EXCEEDS_DURATION");
    assert.equal(body.field, "sourceOutPoint");
  });

  test("setLayerTimeRemap: keyframes [] → rejected by schema", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    let res = null;
    let rejected = null;
    try {
      res = await call("setLayerTimeRemap", { compIndex: 1, layerIndex: 1, keyframes: [] });
    } catch (e) {
      rejected = e;
    }
    assert.ok(rejected || (res && res.isError === true), `expected rejection or isError, got ${JSON.stringify(res)}`);
    assert.equal(fakeBridge.received.length, 0, "no command may reach the bridge");
  });

  test("setLayerTimeRemap: valid keyframes forwarded unchanged; result returned", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(cannedSuccess);
    const params = { compIndex: 1, layerIndex: 1, keyframes: [{ timeInSeconds: 0, sourceTimeInSeconds: 0 }, { timeInSeconds: 2, sourceTimeInSeconds: 5 }] };
    const res = await call("setLayerTimeRemap", params);
    assert.ok(!res.isError, textOf(res));
    assert.deepEqual(fakeBridge.received[0].args, params);
    assert.equal(jsonOf(res)._commandExecuted, "setLayerTimeRemap");
  });

  test("setLayerTimeRemap: bridge error (NO_FOOTAGE_SOURCE) → isError true", { timeout: TEST_TIMEOUT_MS }, async () => {
    fakeBridge.start(() => ({ status: "error", code: "NO_FOOTAGE_SOURCE", message: "Layer 'Text' has no footage source" }));
    const res = await call("setLayerTimeRemap", { compIndex: 1, layerIndex: 2, keyframes: [{ timeInSeconds: 0, sourceTimeInSeconds: 0 }] });
    assert.equal(res.isError, true, textOf(res));
    assert.equal(jsonOf(res).code, "NO_FOOTAGE_SOURCE");
  });

  test("run-script accepts importFootage (queued, not executed synchronously)", { timeout: TEST_TIMEOUT_MS }, async () => {
    const res = await call("run-script", { script: "importFootage", parameters: { filePath: "C:\\x.mp4" } });
    assert.ok(!res.isError, textOf(res));
    assert.ok(textOf(res).includes("has been queued"), textOf(res));
    const cmd = readCommandFile();
    assert.ok(cmd && cmd.command === "importFootage", "run-script should write the importFootage command");
  });

  for (const script of ["addFootageLayer", "setLayerTimeRemap"]) {
    test(`run-script accepts ${script}`, { timeout: TEST_TIMEOUT_MS }, async () => {
      const res = await call("run-script", { script, parameters: {} });
      assert.ok(!res.isError, textOf(res));
      assert.ok(textOf(res).includes("has been queued"), textOf(res));
    });
  }
});

process.on("exit", () => {
  // Surface server stderr only when something failed (process.exitCode set by node:test).
  if (process.exitCode && stderrBuf) {
    process.stderr.write(`\n--- build/index.js stderr (tail) ---\n${stderrBuf.slice(-4000)}\n`);
  }
});
