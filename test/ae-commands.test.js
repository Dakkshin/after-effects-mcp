// Behavioural tests of the ExtendScript commands importFootage / addFootageLayer /
// setLayerTimeRemap against an After Effects DOM mock (spec §7, incl. review round 1 items).
// The jsx runs in an ES3 vm context with the file's own JSON polyfill (see helpers/ae-mock.js).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createAeWorld, ROOT_ID } from "./helpers/ae-mock.js";
import { assertClose } from "./helpers/load-pure.js";

const PARTIAL = " (changes may be partially applied; use Edit > Undo)";

function assertErrorJson(json, code, extra = {}) {
  assert.equal(json.status, "error", `expected error ${code}, got ${JSON.stringify(json)}`);
  assert.equal(json.code, code, `code (message: ${json.message})`);
  assert.equal(typeof json.message, "string");
  assert.ok(json.message.length > 0, "message must be non-empty");
  if ("field" in extra) {
    if (extra.field === null) assert.ok(!("field" in json), `field must be omitted when null, got ${json.field}`);
    else assert.equal(json.field, extra.field, "field");
  }
  if ("index" in extra) {
    if (extra.index === null) assert.ok(!("index" in json), `index must be omitted when null, got ${json.index}`);
    else assert.equal(json.index, extra.index, "index");
  }
  if (extra.messageIncludes) {
    for (const s of [].concat(extra.messageIncludes)) assert.ok(json.message.includes(s), `message should include '${s}': ${json.message}`);
  }
}

function assertUndoBalanced(w, expectedBegins) {
  const u = w.undoBalanced();
  assert.ok(u.balanced, `undo groups unbalanced: ${u.begins} begin(s), ${u.ends} end(s)`);
  if (expectedBegins !== undefined) assert.equal(u.begins, expectedBegins, "number of undo groups opened");
}

function assertSuccess(json) {
  assert.equal(json.status, "success", `expected success, got ${JSON.stringify(json)}`);
}

function warningCodes(json) {
  assert.ok(Array.isArray(json.warnings), "warnings must be an array");
  return json.warnings.map((w) => w.code);
}

function assertWarningKey(json) {
  if (json.warnings.length > 0) {
    assert.equal(typeof json.warning, "string", "warning string required when warnings exist");
    for (const w of json.warnings) assert.ok(json.warning.includes(w.message), "warning must join all messages");
  } else {
    assert.ok(!("warning" in json), "warning key must be absent when there are no warnings");
  }
}

// =============================================================================================
// importFootage (§7.2)
// =============================================================================================
const CLIP = "C:\\media\\clip.mp4";
const DIR = "C:\\media";

function importWorld(opts) {
  const w = createAeWorld(opts);
  w.fs.files.add(CLIP);
  w.fs.files.add("/Users/me/clip.mp4");
  w.fs.folders.add(DIR);
  w.importResult = { duration: 10, frameRate: 25, width: 1920, height: 1080, pixelAspect: 1, hasVideo: true, hasAudio: true };
  return w;
}

describe("importFootage — validation (§7.2, in order)", () => {
  const rows = [
    // [label, args, code, { fileCtor0?: bool, messageIncludes? }]
    ["args undefined", undefined, "INVALID_ARGS", { fileCtor0: true }],
    ["args {}", {}, "INVALID_ARGS", { fileCtor0: true }],
    ["filePath empty", { filePath: "" }, "INVALID_ARGS", { fileCtor0: true }],
    ["filePath number", { filePath: 5 }, "INVALID_ARGS", { fileCtor0: true }],
    ["filePath null", { filePath: null }, "INVALID_ARGS", { fileCtor0: true }],
    ["folderName empty string", { filePath: CLIP, folderName: "" }, "INVALID_ARGS", { fileCtor0: true }],
    ["folderName number", { filePath: CLIP, folderName: 5 }, "INVALID_ARGS", { fileCtor0: true }],
    // 2a: absolute local paths only (review round 1)
    ["relative file name", { filePath: "clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["relative subdir", { filePath: "media\\clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["dot-relative", { filePath: "./clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["drive-relative C:clip.mp4", { filePath: "C:clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["root-relative \\media\\clip.mp4", { filePath: "\\media\\clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["~ without slash", { filePath: "~clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["UNC backslashes", { filePath: "\\\\server\\share\\clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["UNC forward slashes", { filePath: "//server/share/clip.mp4" }, "INVALID_ARGS", { fileCtor0: true }],
    ["relative path + bad folderName", { filePath: "clip.mp4", folderName: "" }, "INVALID_ARGS", { fileCtor0: true }],
    // 3–5
    ["missing file (Windows abs)", { filePath: "C:\\media\\missing.mp4" }, "FILE_NOT_FOUND", { messageIncludes: "C:\\media\\missing.mp4" }],
    ["missing file (forward slashes)", { filePath: "C:/media/missing.mp4" }, "FILE_NOT_FOUND", {}],
    ["missing file (POSIX abs)", { filePath: "/Users/me/missing.mp4" }, "FILE_NOT_FOUND", {}],
    ["missing file (~/)", { filePath: "~/missing.mp4" }, "FILE_NOT_FOUND", {}],
    ["bad folderName before missing file", { filePath: "C:\\media\\missing.mp4", folderName: "" }, "INVALID_ARGS", {}],
    ["folder path", { filePath: DIR }, "NOT_A_FILE", {}],
  ];
  for (const [label, args, code, o] of rows) {
    test(`${label} → ${code}`, () => {
      const w = importWorld();
      const { json } = w.run("importFootage", args);
      assertErrorJson(json, code, { messageIncludes: o.messageIncludes });
      if (o.fileCtor0) assert.equal(w.counters.fileCtor, 0, "no File object may be created before this check");
      assert.equal(w.counters.importOptionsCtor, 0, "ImportOptions must not be created");
      assert.equal(w.counters.importFile, 0, "importFile must not be called");
      assertUndoBalanced(w, 0);
    });
  }

  test("ImportOptions throws → CANNOT_IMPORT with exception text", () => {
    const w = importWorld();
    w.importOptionsThrows = true;
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertErrorJson(json, "CANNOT_IMPORT", { messageIncludes: [CLIP, "unsupported file"] });
    assert.equal(w.counters.importFile, 0);
    assertUndoBalanced(w, 0);
  });

  test("canImportAs(FOOTAGE) false → CANNOT_IMPORT", () => {
    const w = importWorld();
    w.canImport = false;
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertErrorJson(json, "CANNOT_IMPORT", { messageIncludes: CLIP });
    assert.equal(w.counters.importFile, 0);
    assertUndoBalanced(w, 0);
  });

  test("a folder that cannot be imported still reports NOT_A_FILE first", () => {
    const w = importWorld();
    w.canImport = false;
    assertErrorJson(w.run("importFootage", { filePath: DIR }).json, "NOT_A_FILE");
  });
});

describe("importFootage — success paths", () => {
  test("video: fields, import options, undo group, folder null", () => {
    const w = importWorld();
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertSuccess(json);
    assert.equal(json.message, "Footage imported successfully");
    const f = json.footage;
    assert.equal(typeof f.id, "number");
    assert.equal(f.name, "clip.mp4");
    assert.equal(f.filePath, CLIP);
    assert.equal(f.width, 1920);
    assert.equal(f.height, 1080);
    assert.equal(f.duration, 10);
    assert.equal(f.frameRate, 25);
    assert.equal(f.pixelAspect, 1);
    assert.equal(f.isStill, false);
    assert.equal(f.hasVideo, true);
    assert.equal(f.hasAudio, true);
    assert.deepEqual(f.parentFolder, { id: ROOT_ID, name: "Root" });
    assert.equal(json.alreadyInProject, false);
    assert.deepEqual(json.existingItemIds, []);
    assert.equal(json.folder, null);
    assert.equal(w.lastImportOptions.importAs, 3 /* ImportAsType.FOOTAGE */);
    assert.equal(w.lastImportOptions.sequence, false);
    assert.equal(w.counters.importFile, 1);
    assert.deepEqual(w.app.undoLog, [["begin", "MCP: Import Footage"], ["end"]]);
  });

  test("POSIX absolute path is accepted", () => {
    const w = importWorld({ fs: "Macintosh" });
    assertSuccess(w.run("importFootage", { filePath: "/Users/me/clip.mp4" }).json);
  });

  test("folderName null is treated as omitted", () => {
    const w = importWorld();
    const { json } = w.run("importFootage", { filePath: CLIP, folderName: null });
    assertSuccess(json);
    assert.equal(json.folder, null);
    assert.equal(w.counters.addFolder, 0);
  });

  test("audio only: width/height/frameRate/pixelAspect null", () => {
    const w = importWorld();
    w.importResult = { hasVideo: false, hasAudio: true, duration: 5, width: 0, height: 0, frameRate: 0, pixelAspect: 1 };
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertSuccess(json);
    const f = json.footage;
    assert.equal(f.width, null);
    assert.equal(f.height, null);
    assert.equal(f.frameRate, null);
    assert.equal(f.pixelAspect, null);
    assert.equal(f.duration, 5);
    assert.equal(f.isStill, false);
    assert.equal(f.hasVideo, false);
    assert.equal(f.hasAudio, true);
  });

  test("still (mainSource.isStill): isStill true, frameRate null, duration 0", () => {
    const w = importWorld();
    w.importResult = { isStill: true, duration: 0, frameRate: 0, hasAudio: false };
    const f = w.run("importFootage", { filePath: CLIP }).json.footage;
    assert.equal(f.isStill, true);
    assert.equal(f.frameRate, null);
    assert.equal(f.duration, 0);
    assert.equal(f.width, 1920);
  });

  test("still detected by duration 0 alone", () => {
    const w = importWorld();
    w.importResult = { isStill: false, duration: 0, frameRate: 25 };
    const f = w.run("importFootage", { filePath: CLIP }).json.footage;
    assert.equal(f.isStill, true);
    assert.equal(f.frameRate, null);
  });

  test("NaN/Infinity from AE become null and the output is valid JSON (polyfill in use)", () => {
    const w = importWorld();
    w.importResult = { duration: NaN, frameRate: Infinity, width: NaN, height: -Infinity, pixelAspect: NaN };
    const { json, raw } = w.run("importFootage", { filePath: CLIP });
    assertSuccess(json);
    assert.ok(!/NaN|Infinity/.test(raw), `raw output contains NaN/Infinity: ${raw}`);
    const f = json.footage;
    assert.equal(f.duration, null);
    assert.equal(f.frameRate, null);
    assert.equal(f.width, null);
    assert.equal(f.height, null);
    assert.equal(f.pixelAspect, null);
  });

  test("endUndoGroup throwing on the success path does not turn success into an error (§7.6)", () => {
    const w = importWorld();
    w.app.endUndoThrows = true;
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertSuccess(json);
    assert.equal(w.app.undoLog.filter((x) => x[0] === "end").length, 1, "endUndoGroup must be called exactly once");
  });
});

describe("importFootage — alreadyInProject / existingItemIds", () => {
  function seed(w) {
    w.footage({ id: 7, name: "clip.mp4", fsName: "C:\\Media\\CLIP.MP4" }); // case differs
    w.comp({ id: 8, name: "clip.mp4" });
    w.folder({ id: 9, name: "clip.mp4" });
    w.footage({ id: 10, name: "solid", file: null }); // solids have no file
    w.footage({ id: 11, name: "other.mp4", fsName: "C:\\media\\other.mp4" });
    w.footage({ id: 12, name: "clip copy", fsName: CLIP }); // exact match
  }

  test("Windows: path comparison is case-insensitive; ids in project order; still imports", () => {
    const w = importWorld({ fs: "Windows" });
    seed(w);
    const before = w.items.length;
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertSuccess(json);
    assert.equal(json.alreadyInProject, true);
    assert.deepEqual(json.existingItemIds, [7, 12]);
    assert.equal(w.items.length, before + 1, "decision 3: always imports a new item");
    assert.ok(![7, 12].includes(json.footage.id), "new item id must differ from existing ids");
  });

  test("Macintosh: comparison is case-sensitive", () => {
    const w = importWorld({ fs: "Macintosh" });
    seed(w);
    const { json } = w.run("importFootage", { filePath: CLIP });
    assert.equal(json.alreadyInProject, true);
    assert.deepEqual(json.existingItemIds, [12]);
  });

  test("no match → false and []", () => {
    const w = importWorld();
    w.footage({ id: 11, name: "other.mp4", fsName: "C:\\media\\other.mp4" });
    const { json } = w.run("importFootage", { filePath: CLIP });
    assert.equal(json.alreadyInProject, false);
    assert.deepEqual(json.existingItemIds, []);
  });

  test("existingItemIds computed before import (new item not included)", () => {
    const w = importWorld();
    const { json } = w.run("importFootage", { filePath: CLIP });
    assert.deepEqual(json.existingItemIds, []);
    const second = w.run("importFootage", { filePath: CLIP }).json;
    assert.deepEqual(second.existingItemIds, [json.footage.id]);
  });
});

describe("importFootage — folder find-or-create at project root", () => {
  test("no such folder → created at root, item moved into it", () => {
    const w = importWorld();
    const { json } = w.run("importFootage", { filePath: CLIP, folderName: "Footage" });
    assertSuccess(json);
    assert.equal(w.counters.addFolder, 1);
    assert.equal(json.folder.name, "Footage");
    assert.equal(json.folder.created, true);
    assert.equal(typeof json.folder.id, "number");
    assert.deepEqual(json.footage.parentFolder, { id: json.folder.id, name: "Footage" });
    assert.ok(w.log.some((e) => e[0] === "parentFolder=" && e[2] === json.folder.id), "item.parentFolder must be set");
  });

  test("existing root-level folder is reused (first by index); nested/non-folder namesakes ignored; root compared by id", () => {
    const w = importWorld();
    const other = w.folder({ id: 30, name: "Other" });
    w.addItem(new w.FolderItem({ id: 31, name: "Footage", parentFolder: other })); // nested, lower index
    w.footage({ id: 32, name: "Footage", fsName: "C:\\x\\Footage" }); // not a folder
    w.folder({ id: 33, name: "Footage" }); // root-level (parentFolder is a distinct object with id ROOT_ID)
    w.folder({ id: 34, name: "Footage" }); // second root-level namesake
    const { json } = w.run("importFootage", { filePath: CLIP, folderName: "Footage" });
    assertSuccess(json);
    assert.deepEqual(json.folder, { id: 33, name: "Footage", created: false });
    assert.equal(w.counters.addFolder, 0);
    assert.equal(json.footage.parentFolder.id, 33);
  });

  test("second import into the same new folder reports created:false", () => {
    const w = importWorld();
    const first = w.run("importFootage", { filePath: CLIP, folderName: "Audio" }).json;
    const second = w.run("importFootage", { filePath: CLIP, folderName: "Audio" }).json;
    assert.equal(first.folder.created, true);
    assert.equal(second.folder.created, false);
    assert.equal(second.folder.id, first.folder.id);
  });
});

describe("importFootage — failures after import", () => {
  test("throw after importFile (moving to folder) → item.remove(), AE_ERROR, undo balanced", () => {
    const w = importWorld();
    w.importResult = { throwOnParentSet: true };
    const { json } = w.run("importFootage", { filePath: CLIP, folderName: "Footage" });
    assertErrorJson(json, "AE_ERROR", { messageIncludes: "cannot move item" });
    assert.ok(w.log.some((e) => e[0] === "item.remove"), "imported item must be removed");
    assert.ok(!w.items.some((i) => i instanceof w.FootageItem), "no footage item may remain in the project");
    assertUndoBalanced(w, 1);
  });

  test("importFile throws → AE_ERROR, undo balanced, nothing to remove", () => {
    const w = importWorld();
    w.importFileThrows = true;
    const { json } = w.run("importFootage", { filePath: CLIP });
    assertErrorJson(json, "AE_ERROR", { messageIncludes: "import failed" });
    assert.ok(!w.log.some((e) => e[0] === "item.remove"));
    assertUndoBalanced(w, 1);
  });
});

// =============================================================================================
// addFootageLayer (§7.3)
// =============================================================================================
function layerWorld(opts) {
  const w = createAeWorld(opts);
  const folder = w.folder({ id: 40, name: "Stuff" }); // index 1
  const comp = w.comp({ id: 50, name: "Main", frameDuration: 0.04, frameRate: 25, duration: 10 }); // index 2
  const clip = w.footage({ id: 10, name: "clip.mp4", fsName: CLIP, duration: 10 }); // index 3
  const still = w.footage({ id: 11, name: "still.png", fsName: "C:\\media\\still.png", isStill: true, duration: 0, hasAudio: false, stillLayerLength: 2 }); // 4
  const wav = w.footage({ id: 12, name: "tone.wav", fsName: "C:\\media\\tone.wav", hasVideo: false, hasAudio: true, duration: 5 }); // 5
  return { w, folder, comp, clip, still, wav };
}

const base = (o = {}) => ({ compIndex: 2, footageId: 10, compStartTime: 0, ...o });

describe("addFootageLayer — validation (§7.3, in order)", () => {
  const rows = [
    ["compIndex missing", { footageId: 10, compStartTime: 0 }, "INVALID_ARGS", {}],
    ["compIndex 'abc'", base({ compIndex: "abc" }), "INVALID_ARGS", {}],
    ["compIndex 0", base({ compIndex: 0 }), "INVALID_ARGS", {}],
    ["compIndex 1.5", base({ compIndex: 1.5 }), "INVALID_ARGS", {}],
    ["compIndex -1", base({ compIndex: -1 }), "INVALID_ARGS", {}],
    ["compIndex beyond numItems", base({ compIndex: 99 }), "COMP_NOT_FOUND", { messageIncludes: ["99", "5"] }],
    ["compIndex → footage item", base({ compIndex: 3 }), "NOT_A_COMP", { messageIncludes: "FootageItem" }],
    ["compIndex → folder item", base({ compIndex: 1 }), "NOT_A_COMP", { messageIncludes: "FolderItem" }],
    ["comp checked before footage", { compIndex: 99, compStartTime: 0 }, "COMP_NOT_FOUND", {}],
    ["both selectors", base({ footageName: "clip.mp4" }), "INVALID_ARGS", {}],
    ["neither selector", { compIndex: 2, compStartTime: 0 }, "INVALID_ARGS", {}],
    ["footageName '' only (not present)", { compIndex: 2, footageName: "", compStartTime: 0 }, "INVALID_ARGS", {}],
    ["footageId 'abc'", base({ footageId: "abc" }), "INVALID_ARGS", {}],
    ["footageId 0", base({ footageId: 0 }), "INVALID_ARGS", {}],
    ["footageId 1.5", base({ footageId: 1.5 }), "INVALID_ARGS", {}],
    ["footageId unknown", base({ footageId: 999 }), "FOOTAGE_NOT_FOUND", { messageIncludes: "999" }],
    ["footageId → comp", base({ footageId: 50 }), "NOT_FOOTAGE", { messageIncludes: ["50", "Main", "CompItem"] }],
    ["footageId → folder", base({ footageId: 40 }), "NOT_FOOTAGE", { messageIncludes: "FolderItem" }],
    ["footageName unknown", { compIndex: 2, footageName: "nope.mp4", compStartTime: 0 }, "FOOTAGE_NOT_FOUND", { messageIncludes: "nope.mp4" }],
    ["footageName of a comp", { compIndex: 2, footageName: "Main", compStartTime: 0 }, "FOOTAGE_NOT_FOUND", {}],
    ["footage checked before position", base({ footageId: 999, position: "x" }), "FOOTAGE_NOT_FOUND", {}],
    ["position length 1", base({ position: [1] }), "INVALID_ARGS", {}],
    ["position length 4", base({ position: [1, 2, 3, 4] }), "INVALID_ARGS", {}],
    ["position string", base({ position: "1,2" }), "INVALID_ARGS", {}],
    ["position object", base({ position: { x: 1, y: 2 } }), "INVALID_ARGS", {}],
    ["position with NaN", base({ position: [1, NaN] }), "INVALID_ARGS", {}],
    ["position with string element", base({ position: [1, "2"] }), "INVALID_ARGS", {}],
    ["position checked before placement", base({ position: [1], sourceOutPoint: 12 }), "INVALID_ARGS", {}],
    ["sourceOutPoint beyond duration", base({ sourceOutPoint: 12 }), "OUT_EXCEEDS_DURATION", { field: "sourceOutPoint" }],
    ["sourceIn >= sourceOut", base({ sourceInPoint: 5, sourceOutPoint: 4 }), "IN_NOT_BEFORE_OUT", { field: "sourceOutPoint" }],
    ["compStartTime missing", { compIndex: 2, footageId: 10 }, "MISSING_VALUE", { field: "compStartTime" }],
    ["compStartTime 'abc'", base({ compStartTime: "abc" }), "INVALID_NUMBER", { field: "compStartTime" }],
    ["negative sourceInPoint", base({ sourceInPoint: -1 }), "NEGATIVE_VALUE", { field: "sourceInPoint" }],
    ["range shorter than a frame", base({ sourceInPoint: 1, sourceOutPoint: 1.01 }), "RANGE_TOO_SHORT", { field: "sourceOutPoint" }],
  ];
  for (const [label, args, code, o] of rows) {
    test(`${label} → ${code}`, () => {
      const { w } = layerWorld();
      const { json } = w.run("addFootageLayer", args);
      assertErrorJson(json, code, o);
      assert.equal(w.counters.layersAdd, 0, "layers.add must not be called");
      assertUndoBalanced(w, 0);
    });
  }

  test("AMBIGUOUS_FOOTAGE_NAME lists all ids", () => {
    const { w } = layerWorld();
    w.footage({ id: 20, name: "clip.mp4", fsName: "D:\\other\\clip.mp4" });
    const { json } = w.run("addFootageLayer", { compIndex: 2, footageName: "clip.mp4", compStartTime: 0 });
    assertErrorJson(json, "AMBIGUOUS_FOOTAGE_NAME", { messageIncludes: ["clip.mp4", "10", "20", "footageId"] });
    assert.equal(w.counters.layersAdd, 0);
    assertUndoBalanced(w, 0);
  });
});

describe("addFootageLayer — selector and lookup variants", () => {
  for (const [label, args] of [
    ["compIndex as numeric string", base({ compIndex: "2" })],
    ["footageId as numeric string", base({ footageId: "10" })],
    ["footageId null + footageName", { compIndex: 2, footageId: null, footageName: "clip.mp4", compStartTime: 0 }],
    ["footageId + footageName ''", base({ footageName: "" })],
  ]) {
    test(`${label} → success`, () => {
      const { w } = layerWorld();
      const { json } = w.run("addFootageLayer", args);
      assertSuccess(json);
      assert.equal(json.footage.id, 10);
    });
  }

  for (const mode of ["absent", "throws", "null"]) {
    test(`itemByID ${mode} → falls back to scanning items`, () => {
      const { w } = layerWorld();
      w.itemByIdMode = mode;
      const { json } = w.run("addFootageLayer", base());
      assertSuccess(json);
      assert.equal(json.footage.id, 10);
    });
  }
});

describe("addFootageLayer — placement and AE writes", () => {
  test("trimmed video: startTime set before in/out; result fields", () => {
    const { w, comp } = layerWorld();
    const { json } = w.run("addFootageLayer", base({ compStartTime: 1, sourceInPoint: 2, sourceOutPoint: 5 }));
    assertSuccess(json);
    const layer = comp.layer(1);
    assert.deepEqual(layer.setterLog, [["startTime", -1], ["inPoint", 1], ["outPoint", 4]]);
    assert.equal(json.message, "Footage layer added successfully");
    assert.equal(json.layer.index, 1);
    assert.equal(json.layer.name, "clip.mp4");
    assertClose(json.layer.startTime, -1, "layer.startTime");
    assertClose(json.layer.inPoint, 1, "layer.inPoint");
    assertClose(json.layer.outPoint, 4, "layer.outPoint");
    assertClose(json.layer.duration, 3, "layer.duration");
    assert.deepEqual(json.layer.position, [960, 540, 0]);
    assert.equal(json.layer.hasVideo, true);
    assert.equal(json.layer.hasAudio, true);
    assert.deepEqual(json.footage, { id: 10, name: "clip.mp4", isStill: false });
    assert.deepEqual(json.composition, { index: 2, id: 50, name: "Main", frameRate: 25, duration: 10 });
    assertClose(json.computed.startTime, -1, "computed.startTime");
    assertClose(json.computed.inPoint, 1, "computed.inPoint");
    assertClose(json.computed.outPoint, 4, "computed.outPoint");
    assertClose(json.computed.sourceInPoint, 2, "computed.sourceInPoint");
    assertClose(json.computed.sourceOutPoint, 5, "computed.sourceOutPoint");
    assert.deepEqual(json.warnings, []);
    assertWarningKey(json);
    assert.deepEqual(w.app.undoLog, [["begin", "MCP: Add Footage Layer"], ["end"]]);
  });

  test("still whose default layer ends before the requested inPoint: outPoint set before inPoint", () => {
    const { w, comp } = layerWorld();
    // still default layer length 2 s: after startTime=5 the layer spans 5..7, and inPoint 8 >= 7.
    const { json } = w.run("addFootageLayer", { compIndex: 2, footageId: 11, compStartTime: 8, sourceInPoint: 3 });
    assertSuccess(json);
    assert.deepEqual(comp.layer(1).setterLog.map((s) => s[0]), ["startTime", "outPoint", "inPoint"]);
    assertClose(json.layer.startTime, 5, "startTime");
    assertClose(json.layer.inPoint, 8, "inPoint");
    assertClose(json.layer.outPoint, 13, "outPoint");
    assert.equal(json.footage.isStill, true);
    assert.deepEqual(warningCodes(json), ["OUT_BEYOND_COMP_END"]);
    assertWarningKey(json);
  });

  test("still default (5 s): startTime, inPoint, outPoint", () => {
    const { w, comp } = layerWorld();
    const { json } = w.run("addFootageLayer", { compIndex: 2, footageId: 11, compStartTime: 0 });
    assertSuccess(json);
    assert.deepEqual(comp.layer(1).setterLog.map((s) => s[0]), ["startTime", "inPoint", "outPoint"]);
    assertClose(json.layer.inPoint, 0, "inPoint");
    assertClose(json.layer.outPoint, 5, "outPoint");
    assertClose(json.layer.duration, 5, "duration");
  });

  test("23.976 comp: frame-snapped values (P39)", () => {
    const { w, comp } = layerWorld();
    comp.frameDuration = 1001 / 24000;
    comp.frameRate = 23.976;
    const { json } = w.run("addFootageLayer", base({ compStartTime: 1, sourceInPoint: 0.5, sourceOutPoint: 2.5 }));
    assertSuccess(json);
    assertClose(json.computed.startTime, 0.501, "computed.startTime");
    assertClose(json.computed.inPoint, 1.001, "computed.inPoint");
    assertClose(json.computed.outPoint, 3.003, "computed.outPoint");
    assertClose(json.computed.sourceOutPoint, 2.502, "computed.sourceOutPoint");
    assert.deepEqual(json.warnings, []);
  });

  test("position on video footage is applied", () => {
    const { w, comp } = layerWorld();
    const { json } = w.run("addFootageLayer", base({ position: [100, 200] }));
    assertSuccess(json);
    assert.deepEqual(comp.layer(1).position.setCalls, [[100, 200]]);
    assert.deepEqual(json.layer.position, [100, 200, 0]);
    assert.deepEqual(json.warnings, []);
  });

  test("audio-only + position → POSITION_IGNORED_AUDIO_ONLY, no setValue, position null", () => {
    const { w, comp } = layerWorld();
    const { json } = w.run("addFootageLayer", { compIndex: 2, footageId: 12, compStartTime: 0, position: [1, 2] });
    assertSuccess(json);
    assert.deepEqual(warningCodes(json), ["POSITION_IGNORED_AUDIO_ONLY"]);
    assert.equal(comp.layer(1).position.setCalls.length, 0);
    assert.equal(json.layer.position, null);
    assert.equal(json.layer.hasVideo, false);
    assertWarningKey(json);
  });

  test("video without a Transform group + position → POSITION_NOT_SET", () => {
    const { w, comp, clip } = layerWorld();
    clip.layerOptions = { hasTransform: false };
    const { json } = w.run("addFootageLayer", base({ position: [1, 2] }));
    assertSuccess(json);
    assert.deepEqual(warningCodes(json), ["POSITION_NOT_SET"]);
    assert.equal(comp.layer(1).position.setCalls.length, 0);
    assert.equal(json.layer.position, null);
  });

  test("video whose Transform lookup throws + position → POSITION_NOT_SET (not AE_ERROR)", () => {
    const { w, clip } = layerWorld();
    clip.layerOptions = { throwOnTransformLookup: true };
    const { json } = w.run("addFootageLayer", base({ position: [1, 2] }));
    assertSuccess(json);
    assert.deepEqual(warningCodes(json), ["POSITION_NOT_SET"]);
    assert.equal(json.layer.position, null);
  });

  test("no position requested and no Transform group → no position warning, position null", () => {
    const { w, clip } = layerWorld();
    clip.layerOptions = { hasTransform: false };
    const { json } = w.run("addFootageLayer", base());
    assertSuccess(json);
    assert.deepEqual(json.warnings, []);
    assert.equal(json.layer.position, null);
  });

  test("warning order: pure warnings, then position warning, then AE_ADJUSTED_TIMES", () => {
    const { w, clip } = layerWorld();
    clip.layerOptions = { hasTransform: false, snapStartTo: -1.96 };
    const { json } = w.run("addFootageLayer", base({ compStartTime: -2, position: [1, 2] }));
    assertSuccess(json);
    assert.deepEqual(warningCodes(json), ["IN_BEFORE_COMP_START", "POSITION_NOT_SET", "AE_ADJUSTED_TIMES"]);
    assertClose(json.layer.startTime, -1.96, "layer.startTime (actual, read back)");
    assertClose(json.computed.startTime, -2, "computed.startTime");
    assertWarningKey(json);
  });

  test("throw after layers.add → layer.remove(), AE_ERROR, undo balanced", () => {
    const { w, comp, clip } = layerWorld();
    clip.layerOptions = { throwOnInPointSet: true };
    const { json } = w.run("addFootageLayer", base({ compStartTime: 1, sourceInPoint: 2, sourceOutPoint: 5 }));
    assertErrorJson(json, "AE_ERROR", { messageIncludes: "inPoint rejected" });
    assert.ok(w.log.some((e) => e[0] === "layer.remove"), "layer must be removed");
    assert.equal(comp.numLayers, 0);
    assertUndoBalanced(w, 1);
  });

  test("layers.add throws → AE_ERROR, undo balanced, nothing removed", () => {
    const { w, comp } = layerWorld();
    comp.throwOnLayersAdd = true;
    const { json } = w.run("addFootageLayer", base());
    assertErrorJson(json, "AE_ERROR");
    assert.ok(!w.log.some((e) => e[0] === "layer.remove"));
    assertUndoBalanced(w, 1);
  });

  test("NaN/Infinity from AE become null; output is valid JSON", () => {
    const { w, comp, clip } = layerWorld();
    comp.frameRate = NaN;
    clip.layerOptions = { corruptPosition: true };
    const { json, raw } = w.run("addFootageLayer", base());
    assertSuccess(json);
    assert.ok(!/NaN|Infinity/.test(raw), `raw output contains NaN/Infinity: ${raw}`);
    assert.equal(json.composition.frameRate, null);
    assert.equal(json.layer.position[0], null);
  });

  test("endUndoGroup throwing on the success path does not turn success into an error (§7.6)", () => {
    const { w } = layerWorld();
    w.app.endUndoThrows = true;
    const { json } = w.run("addFootageLayer", base());
    assertSuccess(json);
    assert.equal(w.app.undoLog.filter((x) => x[0] === "end").length, 1);
  });
});

// =============================================================================================
// setLayerTimeRemap (§7.4)
// =============================================================================================
function remapWorld() {
  const w = createAeWorld();
  const comp = w.comp({ id: 60, name: "Remap" }); // index 1
  const clip = w.footage({ id: 10, name: "clip.mp4", fsName: CLIP, duration: 10 }); // index 2
  const still = w.footage({ id: 11, name: "still.png", fsName: "C:\\media\\still.png", isStill: true, duration: 0 }); // 3
  const pre = w.comp({ id: 61, name: "Pre", duration: 8 }); // 4
  const L = {};
  L.clip = comp.addLayer(new w.AVLayer({ name: "clip", source: clip, inPoint: 0, outPoint: 10 })); // 1
  L.text = comp.addLayer(new w.TextLayer("Title")); // 2
  L.noSource = comp.addLayer(new w.AVLayer({ name: "null", source: null })); // 3
  L.still = comp.addLayer(new w.AVLayer({ name: "still", source: still, canSetTimeRemapEnabled: false })); // 4
  L.pre = comp.addLayer(new w.AVLayer({ name: "precomp", source: pre, inPoint: 0, outPoint: 8 })); // 5
  L.merged = comp.addLayer(new w.AVLayer({ name: "remapped", source: clip, inPoint: 0, outPoint: 10,
    timeRemapEnabled: true, remapKeys: [[0, 0], [2, 2], [5, 5]] })); // 6
  return { w, comp, L };
}

const kf = (t, s) => ({ timeInSeconds: t, sourceTimeInSeconds: s });
const rargs = (layerIndex, keyframes, o = {}) => ({ compIndex: 1, layerIndex, keyframes, ...o });

function assertNoRemapWrites(w) {
  assert.ok(!w.log.some((e) => e[0] === "layer.timeRemapEnabled="), "timeRemapEnabled must not be touched");
  assert.ok(!w.log.some((e) => String(e[0]).startsWith("remap.")), "no keyframe writes allowed");
}

describe("setLayerTimeRemap — validation (§7.4, in order)", () => {
  const rows = [
    ["compIndex 'x'", rargs(1, [kf(0, 0)], { compIndex: "x" }), "INVALID_ARGS", {}],
    ["compIndex beyond numItems", rargs(1, [kf(0, 0)], { compIndex: 99 }), "COMP_NOT_FOUND", {}],
    ["compIndex → footage", rargs(1, [kf(0, 0)], { compIndex: 2 }), "NOT_A_COMP", { messageIncludes: "FootageItem" }],
    ["layerIndex missing", { compIndex: 1, keyframes: [kf(0, 0)] }, "INVALID_ARGS", {}],
    ["layerIndex 0", rargs(0, [kf(0, 0)]), "INVALID_ARGS", {}],
    ["layerIndex 'x'", rargs("x", [kf(0, 0)]), "INVALID_ARGS", {}],
    ["layerIndex beyond numLayers", rargs(99, [kf(0, 0)]), "LAYER_NOT_FOUND", { messageIncludes: ["99", "Remap", "6"] }],
    ["text layer", rargs(2, [kf(0, 0)]), "NO_FOOTAGE_SOURCE", { messageIncludes: "Title" }],
    ["AV layer without source", rargs(3, [kf(0, 0)]), "NO_FOOTAGE_SOURCE", {}],
    ["source checked before keyframes", rargs(2, []), "NO_FOOTAGE_SOURCE", {}],
    ["still (cannot set time remap)", rargs(4, [kf(0, 0)]), "TIME_REMAP_NOT_SUPPORTED", { messageIncludes: "still" }],
    ["support checked before keyframes", rargs(4, []), "TIME_REMAP_NOT_SUPPORTED", {}],
    ["keyframes []", rargs(1, []), "EMPTY_KEYFRAMES", { field: "keyframes", index: null }],
    ["keyframes not an array", rargs(1, "x"), "INVALID_INPUT", { field: "keyframes", index: null }],
    ["source time beyond duration", rargs(1, [kf(0, 11)]), "SOURCE_TIME_OUT_OF_RANGE", { field: "sourceTimeInSeconds", index: 0 }],
    ["precomp duration used (8 s)", rargs(5, [kf(0, 0), kf(1, 9)]), "SOURCE_TIME_OUT_OF_RANGE", { field: "sourceTimeInSeconds", index: 1 }],
    ["duplicate times", rargs(1, [kf(1, 0), kf(1.0004, 2)]), "DUPLICATE_TIME", { field: "timeInSeconds", index: 1 }],
    ["missing sourceTimeInSeconds", rargs(1, [{ timeInSeconds: 0 }]), "MISSING_VALUE", { field: "sourceTimeInSeconds", index: 0 }],
    ["invalid timeInSeconds", rargs(1, [kf(0, 0), kf("x", 1)]), "INVALID_NUMBER", { field: "timeInSeconds", index: 1 }],
    ["null keyframe element", rargs(1, [kf(0, 0), null]), "INVALID_KEYFRAME", { field: null, index: 1 }],
  ];
  for (const [label, args, code, o] of rows) {
    test(`${label} → ${code}`, () => {
      const { w } = remapWorld();
      const { json } = w.run("setLayerTimeRemap", args);
      assertErrorJson(json, code, o);
      assert.ok(!json.message.includes("partially applied"), "validation errors must not carry the partial suffix");
      assertNoRemapWrites(w);
      assertUndoBalanced(w, 0);
    });
  }
});

describe("setLayerTimeRemap — keyframe writes", () => {
  test("remap newly enabled: auto keys removed after caller keys are added, from the end", () => {
    const { w, L } = remapWorld();
    const { json } = w.run("setLayerTimeRemap", rargs(1, [kf(3, 5), kf(1, 0)]));
    assertSuccess(json);
    assert.equal(json.message, "Time remap keyframes set successfully");
    assert.ok(w.log.some((e) => e[0] === "layer.timeRemapEnabled=" && e[1] === true), "remap must be enabled");
    const calls = L.clip.remap.calls;
    const lastSet = calls.map((c) => c[0]).lastIndexOf("set");
    const firstRemove = calls.findIndex((c) => c[0] === "remove");
    assert.ok(lastSet >= 0, "keys must be set");
    assert.ok(firstRemove > lastSet, "all caller keys must be added before any key is removed");
    const setTimes = calls.filter((c) => c[0] === "set").flatMap((c) => c[1]);
    const setValues = calls.filter((c) => c[0] === "set").flatMap((c) => c[2]);
    assert.deepEqual(setTimes, [1, 3]);
    assert.deepEqual(setValues, [0, 5]);
    const removed = calls.filter((c) => c[0] === "remove");
    assert.deepEqual(removed.map((c) => c[2]).sort((a, b) => a - b), [0, 10], "both auto keys removed");
    const idx = removed.map((c) => c[1]);
    for (let i = 1; i < idx.length; i++) assert.ok(idx[i] < idx[i - 1], `removal must run from the end (indices ${idx})`);
    assert.ok(L.clip.remap.minKeysAfterFirstSet >= 1, "property must never reach zero keys");
    assert.equal(json.timeRemapWasEnabled, false);
    assert.equal(json.autoKeyframesRemoved, 2);
    assert.equal(json.keyframesAdded, 2);
    assert.equal(json.keyframesReplaced, 0);
    assert.deepEqual(json.keyframes, [kf(1, 0), kf(3, 5)]);
    assert.deepEqual(json.layer, { index: 1, name: "clip", inPoint: 0, outPoint: 10 });
    assert.deepEqual(json.composition, { index: 1, id: 60, name: "Remap" });
    assert.deepEqual(json.warnings, []);
    assertWarningKey(json);
    assert.deepEqual(w.app.undoLog, [["begin", "MCP: Set Time Remap"], ["end"]]);
  });

  test("remap newly enabled with a caller key on an auto key time: replaced, other auto key removed", () => {
    const { w } = remapWorld();
    const { json } = w.run("setLayerTimeRemap", rargs(1, [kf(0, 2), kf(4, 6)]));
    assertSuccess(json);
    assert.equal(json.keyframesReplaced, 1);
    assert.equal(json.keyframesAdded, 1);
    assert.equal(json.autoKeyframesRemoved, 1);
    assert.deepEqual(json.keyframes, [kf(0, 2), kf(4, 6)]);
  });

  test("remap already enabled: keys merged, nothing removed, timeRemapEnabled untouched", () => {
    const { w, L } = remapWorld();
    const { json } = w.run("setLayerTimeRemap", rargs(6, [kf(2.0004, 1), kf(3, 4)]));
    assertSuccess(json);
    assert.ok(!w.log.some((e) => e[0] === "layer.timeRemapEnabled="), "must not re-enable remap");
    assert.ok(!L.merged.remap.calls.some((c) => c[0] === "remove"), "merge must not remove keys");
    assert.equal(json.timeRemapWasEnabled, true);
    assert.equal(json.autoKeyframesRemoved, 0);
    assert.equal(json.keyframesReplaced, 1);
    assert.equal(json.keyframesAdded, 1);
    assert.deepEqual(json.keyframes, [kf(0, 0), kf(2, 1), kf(3, 4), kf(5, 5)]);
  });

  test("precomp layer is allowed", () => {
    const { w } = remapWorld();
    const { json } = w.run("setLayerTimeRemap", rargs(5, [kf(0, 0), kf(2, 8)]));
    assertSuccess(json);
    assert.deepEqual(json.keyframes, [kf(0, 0), kf(2, 8)]);
  });

  test("key outside the layer range → KEY_OUTSIDE_LAYER_RANGE warning", () => {
    const { w } = remapWorld();
    const { json } = w.run("setLayerTimeRemap", rargs(1, [kf(1, 0), kf(12, 2)]));
    assertSuccess(json);
    assert.deepEqual(warningCodes(json), ["KEY_OUTSIDE_LAYER_RANGE"]);
    assertWarningKey(json);
  });

  test("throw while writing keys → AE_ERROR with 'partially applied' suffix, undo balanced", () => {
    const { w, L } = remapWorld();
    L.clip.remap.throwOnSet = true;
    const { json } = w.run("setLayerTimeRemap", rargs(1, [kf(1, 0), kf(3, 5)]));
    assertErrorJson(json, "AE_ERROR", { messageIncludes: "failed" });
    assert.ok(json.message.endsWith(PARTIAL), `message must end with the partial suffix: ${json.message}`);
    assertUndoBalanced(w, 1);
  });

  test("throw before the undo group opens → AE_ERROR without the suffix", () => {
    const { w, L } = remapWorld();
    const src = new w.FootageItem({ id: 70, name: "broken", fsName: "C:\\b.mp4" });
    Object.defineProperty(src, "duration", { get() { throw new Error("mock: duration unavailable"); } });
    L.clip.source = src;
    const { json } = w.run("setLayerTimeRemap", rargs(1, [kf(1, 0)]));
    assertErrorJson(json, "AE_ERROR", { messageIncludes: "duration unavailable" });
    assert.ok(!json.message.includes("partially applied"), `suffix must not appear before the undo group: ${json.message}`);
    assertUndoBalanced(w, 0);
  });

  test("NaN read back from AE becomes null; output is valid JSON", () => {
    const { w, L } = remapWorld();
    L.clip.remap.corruptReadValueAt = 1;
    const { json, raw } = w.run("setLayerTimeRemap", rargs(1, [kf(1, 0), kf(3, 5)]));
    assertSuccess(json);
    assert.ok(!/NaN|Infinity/.test(raw), `raw output contains NaN/Infinity: ${raw}`);
    assert.equal(json.keyframes[0].sourceTimeInSeconds, null);
  });

  test("endUndoGroup throwing on the success path does not turn success into an error (§7.6)", () => {
    const { w } = remapWorld();
    w.app.endUndoThrows = true;
    const { json } = w.run("setLayerTimeRemap", rargs(1, [kf(1, 0), kf(3, 5)]));
    assertSuccess(json);
    assert.equal(w.app.undoLog.filter((x) => x[0] === "end").length, 1);
  });
});

describe("commands never throw on hostile args", () => {
  for (const command of ["importFootage", "addFootageLayer", "setLayerTimeRemap"]) {
    for (const [label, args] of [["undefined", undefined], ["null", null], ["string", "x"], ["number", 5], ["array", [1]]]) {
      test(`${command}(${label}) → error JSON`, () => {
        const w = createAeWorld();
        w.comp({ id: 1, name: "C" });
        const { json } = w.run(command, args);
        assert.equal(json.status, "error");
        assert.equal(typeof json.code, "string");
        assertUndoBalanced(w, 0);
      });
    }
  }
});
