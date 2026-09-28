// Minimal After Effects DOM mock for behavioural tests of importFootage / addFootageLayer /
// setLayerTimeRemap (spec §7). Loads the jsx text from `// PURE-BLOCK-BEGIN footage-timing` up to
// `// JSON polyfill for ExtendScript`, plus the polyfill section itself, into an ES3 vm context
// (native JSON removed, so the file's own polyfill is used exactly as in ExtendScript — it emits
// NaN/Infinity literally, which is what the _mcpNum sanitiser must prevent).
//
// Only the behaviour the contract relies on is modelled. Everything records calls so tests can
// assert ordering (setters, keyframe add/remove, undo groups, remove()).

import fs from "node:fs";
import vm from "node:vm";
import { JSX_PATH, MARKER_BEGIN, findMarkerLines, createEs3Context } from "./load-pure.js";

const POLYFILL_MARK = "// JSON polyfill for ExtendScript";

/** Returns { commands, polyfill } source texts from the jsx (throws with a clear message). */
// Test-only override: AE_MCP_JSX_SOURCE points at another copy of the jsx (used for mutation checks).
const COMMAND_SOURCE_PATH = process.env.AE_MCP_JSX_SOURCE || JSX_PATH;

export function extractCommandSources(source = fs.readFileSync(COMMAND_SOURCE_PATH, "utf8")) {
  const lines = source.split(/\r?\n/);
  const begins = findMarkerLines(lines, MARKER_BEGIN);
  if (begins.length !== 1) throw new Error(`expected one '${MARKER_BEGIN}' line, found ${begins.length}`);
  const poly = lines.findIndex((l) => l.includes(POLYFILL_MARK));
  if (poly < begins[0]) throw new Error(`'${POLYFILL_MARK}' not found after the pure block`);
  // The polyfill ends where the panel UI code starts (first top-level `var` after it).
  let polyEnd = lines.findIndex((l, i) => i > poly && /^var\s/.test(l));
  if (polyEnd < 0) polyEnd = lines.length;
  // Drop a trailing comment line that belongs to the following section.
  let end = polyEnd;
  while (end > poly && (/^\s*\/\//.test(lines[end - 1]) || lines[end - 1].trim() === "")) end--;
  return {
    commands: lines.slice(begins[0] + 1, poly).join("\n"),
    polyfill: lines.slice(poly, end).join("\n"),
  };
}

export const ROOT_ID = 1;

/**
 * Builds a fresh mock world + vm context.
 * opts.fs: "Windows" | "Macintosh" (File.fs), default "Windows".
 */
export function createAeWorld(opts = {}) {
  const ctx = createEs3Context(); // ES3 prelude; JSON = undefined
  const CtxArray = vm.runInContext("Array", ctx);
  const arr = (xs) => {
    const a = new CtxArray();
    for (const x of xs) a.push(x);
    return a;
  };

  const log = []; // global ordered log of interesting calls
  const counters = { fileCtor: 0, importOptionsCtor: 0, importFile: 0, addFolder: 0, layersAdd: 0 };
  let nextId = 100;

  // ---- item classes (instanceof works because the jsx sees these very constructors) ----
  function Item() {}
  function FolderItem(props = {}) {
    this.id = props.id !== undefined ? props.id : nextId++;
    this.name = props.name || "Folder";
    this.parentFolder = props.parentFolder || null;
  }
  FolderItem.prototype = Object.create(Item.prototype);
  FolderItem.prototype.constructor = FolderItem;

  function FootageItem(props = {}) {
    this.id = props.id !== undefined ? props.id : nextId++;
    this.name = props.name || "footage";
    this.file = props.fsName ? { fsName: props.fsName } : props.file !== undefined ? props.file : null;
    this.duration = props.duration !== undefined ? props.duration : 10;
    this.frameRate = props.frameRate !== undefined ? props.frameRate : 25;
    this.width = props.width !== undefined ? props.width : 1920;
    this.height = props.height !== undefined ? props.height : 1080;
    this.pixelAspect = props.pixelAspect !== undefined ? props.pixelAspect : 1;
    this.hasVideo = props.hasVideo !== undefined ? props.hasVideo : true;
    this.hasAudio = props.hasAudio !== undefined ? props.hasAudio : true;
    this.mainSource = { isStill: props.isStill === true };
    this._parent = props.parentFolder || world.rootFolderObject();
    this._throwOnParentSet = props.throwOnParentSet === true;
    this.removed = false;
    // Layer defaults when added to a comp (still length models AE's still-footage preference).
    this.stillLayerLength = props.stillLayerLength !== undefined ? props.stillLayerLength : 2;
    this.layerOptions = props.layerOptions || {};
  }
  FootageItem.prototype = Object.create(Item.prototype);
  FootageItem.prototype.constructor = FootageItem;
  Object.defineProperty(FootageItem.prototype, "parentFolder", {
    get() { return this._parent; },
    set(v) {
      log.push(["parentFolder=", this.id, v && v.id]);
      if (this._throwOnParentSet) throw new Error("mock: cannot move item");
      this._parent = v;
    },
  });
  FootageItem.prototype.remove = function () {
    log.push(["item.remove", this.id]);
    this.removed = true;
    const i = world.items.indexOf(this);
    if (i >= 0) world.items.splice(i, 1);
  };

  function CompItem(props = {}) {
    this.id = props.id !== undefined ? props.id : nextId++;
    this.name = props.name || "Comp";
    this.frameDuration = props.frameDuration !== undefined ? props.frameDuration : 0.04;
    this.frameRate = props.frameRate !== undefined ? props.frameRate : 25;
    this.duration = props.duration !== undefined ? props.duration : 10;
    this.parentFolder = world.rootFolderObject();
    this._layers = [];
    this.throwOnLayersAdd = props.throwOnLayersAdd === true;
    const comp = this;
    this.layers = {
      add(footage) {
        counters.layersAdd++;
        log.push(["layers.add", footage && footage.id]);
        if (comp.throwOnLayersAdd) throw new Error("mock: layers.add failed");
        const isStill = footage.mainSource && footage.mainSource.isStill === true || footage.duration === 0;
        const len = isStill ? footage.stillLayerLength : footage.duration;
        const layer = new AVLayer({ source: footage, hasVideo: footage.hasVideo, hasAudio: footage.hasAudio,
          name: footage.name, outPoint: len, ...footage.layerOptions });
        layer._comp = comp;
        comp._layers.unshift(layer); // AE inserts new layers at the top (index 1)
        return layer;
      },
    };
  }
  CompItem.prototype = Object.create(Item.prototype);
  CompItem.prototype.constructor = CompItem;
  Object.defineProperty(CompItem.prototype, "numLayers", { get() { return this._layers.length; } });
  CompItem.prototype.layer = function (i) {
    if (typeof i !== "number" || i < 1 || i > this._layers.length || Math.floor(i) !== i) {
      throw new Error(`mock: layer index ${i} out of range`);
    }
    return this._layers[i - 1];
  };
  CompItem.prototype.addLayer = function (layer) {
    layer._comp = this;
    this._layers.push(layer);
    return layer;
  };

  // ---- layers ----
  function TimeRemapProperty(layer) {
    this._layer = layer;
    this.keys = []; // {t, v}
    this.calls = [];
    this.minKeysAfterFirstSet = Infinity;
    this.throwOnSet = false;
    this.corruptReadValueAt = null; // 1-based key index whose keyValue() returns NaN
  }
  Object.defineProperty(TimeRemapProperty.prototype, "numKeys", { get() { return this.keys.length; } });
  TimeRemapProperty.prototype._check = function (i) {
    if (typeof i !== "number" || i < 1 || i > this.keys.length) throw new Error(`mock: key index ${i} out of range`);
  };
  TimeRemapProperty.prototype.keyTime = function (i) { this._check(i); return this.keys[i - 1].t; };
  TimeRemapProperty.prototype.keyValue = function (i) {
    this._check(i);
    if (this.corruptReadValueAt === i) return NaN;
    return this.keys[i - 1].v;
  };
  TimeRemapProperty.prototype._setOne = function (t, v) {
    const k = this.keys.find((x) => x.t === t);
    if (k) k.v = v;
    else {
      this.keys.push({ t, v });
      this.keys.sort((a, b) => a.t - b.t);
    }
  };
  TimeRemapProperty.prototype.setValuesAtTimes = function (times, values) {
    const ts = Array.from(times);
    const vs = Array.from(values);
    this.calls.push(["set", ts, vs]);
    log.push(["remap.setValuesAtTimes", ts, vs]);
    if (this.throwOnSet) throw new Error("mock: setValuesAtTimes failed");
    if (ts.length !== vs.length) throw new Error("mock: times/values length mismatch");
    ts.forEach((t, i) => this._setOne(t, vs[i]));
    this.minKeysAfterFirstSet = Math.min(this.minKeysAfterFirstSet, this.keys.length);
  };
  TimeRemapProperty.prototype.setValueAtTime = function (t, v) {
    this.calls.push(["set", [t], [v]]);
    log.push(["remap.setValueAtTime", t, v]);
    if (this.throwOnSet) throw new Error("mock: setValueAtTime failed");
    this._setOne(t, v);
    this.minKeysAfterFirstSet = Math.min(this.minKeysAfterFirstSet, this.keys.length);
  };
  TimeRemapProperty.prototype.removeKey = function (i) {
    this._check(i);
    this.calls.push(["remove", i, this.keys[i - 1].t]);
    log.push(["remap.removeKey", i]);
    this.keys.splice(i - 1, 1);
    if (this.calls.some((c) => c[0] === "set")) {
      this.minKeysAfterFirstSet = Math.min(this.minKeysAfterFirstSet, this.keys.length);
    }
  };

  function PositionProperty(value, owner) {
    this._value = value;
    this._owner = owner;
    this.setCalls = [];
  }
  Object.defineProperty(PositionProperty.prototype, "value", {
    get() {
      if (this._owner && this._owner.corruptPosition) return arr([NaN, this._value[1], this._value[2] || 0]);
      return arr(this._value);
    },
  });
  PositionProperty.prototype.setValue = function (v) {
    const copy = Array.from(v);
    this.setCalls.push(copy);
    log.push(["position.setValue", copy]);
    this._value = copy.length === 2 ? [copy[0], copy[1], 0] : copy;
  };

  function AVLayer(props = {}) {
    this.name = props.name || "Layer";
    this.source = props.source !== undefined ? props.source : null;
    this.hasVideo = props.hasVideo !== undefined ? props.hasVideo : true;
    this.hasAudio = props.hasAudio !== undefined ? props.hasAudio : false;
    this._start = props.startTime || 0;
    this._in = props.inPoint !== undefined ? props.inPoint : 0;
    this._out = props.outPoint !== undefined ? props.outPoint : 10;
    this.setterLog = [];
    this.canSetTimeRemapEnabled = props.canSetTimeRemapEnabled !== undefined ? props.canSetTimeRemapEnabled : true;
    this._remapEnabled = props.timeRemapEnabled === true;
    this.remap = new TimeRemapProperty(this);
    if (props.remapKeys) this.remap.keys = props.remapKeys.map(([t, v]) => ({ t, v }));
    this.hasTransform = props.hasTransform !== undefined ? props.hasTransform : this.hasVideo;
    this.throwOnTransformLookup = props.throwOnTransformLookup === true;
    this.position = new PositionProperty([960, 540, 0], this);
    this.corruptPosition = props.corruptPosition === true;
    this.throwOnInPointSet = props.throwOnInPointSet === true;
    this.snapStartTo = props.snapStartTo; // simulate AE adjusting startTime
    this.autoKeyEnd = props.autoKeyEnd; // time of AE's second auto key (default: start + source duration)
    this.removed = false;
    this._comp = null;
    this.throwOnSourceDuration = props.throwOnSourceDuration === true;
  }
  AVLayer.prototype = Object.create(Object.prototype);
  AVLayer.prototype.constructor = AVLayer;
  Object.defineProperty(AVLayer.prototype, "index", {
    get() { return this._comp ? this._comp._layers.indexOf(this) + 1 : 0; },
  });
  Object.defineProperty(AVLayer.prototype, "startTime", {
    get() { return this._start; },
    set(v) {
      this.setterLog.push(["startTime", v]);
      log.push(["layer.startTime=", v]);
      const target = this.snapStartTo !== undefined ? this.snapStartTo : v;
      const d = target - this._start; // AE moves the whole layer: in/out shift with startTime
      this._start = target;
      this._in += d;
      this._out += d;
    },
  });
  Object.defineProperty(AVLayer.prototype, "inPoint", {
    get() { return this._in; },
    set(v) {
      this.setterLog.push(["inPoint", v]);
      log.push(["layer.inPoint=", v]);
      if (this.throwOnInPointSet) throw new Error("mock: inPoint rejected");
      if (!(v < this._out)) throw new Error(`mock: inPoint ${v} must be < outPoint ${this._out}`);
      this._in = v;
    },
  });
  Object.defineProperty(AVLayer.prototype, "outPoint", {
    get() { return this._out; },
    set(v) {
      this.setterLog.push(["outPoint", v]);
      log.push(["layer.outPoint=", v]);
      if (!(v > this._in)) throw new Error(`mock: outPoint ${v} must be > inPoint ${this._in}`);
      this._out = v;
    },
  });
  Object.defineProperty(AVLayer.prototype, "timeRemapEnabled", {
    get() { return this._remapEnabled; },
    set(v) {
      log.push(["layer.timeRemapEnabled=", v]);
      if (v === true && !this._remapEnabled) {
        if (!this.canSetTimeRemapEnabled) throw new Error("mock: cannot enable time remap");
        const d = this.source && typeof this.source.duration === "number" ? this.source.duration : 10;
        const end = this.autoKeyEnd !== undefined ? this.autoKeyEnd : this._start + d;
        this.remap.keys = [{ t: this._start, v: 0 }, { t: end, v: d }];
      }
      this._remapEnabled = v === true;
    },
  });
  AVLayer.prototype.property = function (name) {
    if (name === "ADBE Transform Group") {
      if (this.throwOnTransformLookup) throw new Error("mock: no transform group");
      if (!this.hasTransform) return null;
      const layer = this;
      return { property(n) { return n === "ADBE Position" ? layer.position : null; } };
    }
    if (name === "ADBE Time Remapping") return this._remapEnabled ? this.remap : this.remap;
    return null;
  };
  AVLayer.prototype.remove = function () {
    log.push(["layer.remove"]);
    this.removed = true;
    if (this._comp) {
      const i = this._comp._layers.indexOf(this);
      if (i >= 0) this._comp._layers.splice(i, 1);
    }
  };

  /** Non-AV layer (text/shape/camera) — not instanceof AVLayer. */
  function TextLayer(name = "Text") {
    this.name = name;
    this.source = null;
  }

  // ---- files ----
  function Folder(p) {
    this.fsName = p;
    this.exists = true;
  }
  function File(p) {
    counters.fileCtor++;
    log.push(["new File", p]);
    if (world.fs.folders.has(p)) return new Folder(p);
    this.fsName = p;
    this.exists = world.fs.files.has(p);
    this.name = String(p).split(/[\\/]/).pop();
  }
  File.fs = opts.fs || "Windows";

  const ImportAsType = { COMP: 1, COMP_CROPPED_LAYERS: 2, FOOTAGE: 3, PROJECT: 4 };
  function ImportOptions(f) {
    counters.importOptionsCtor++;
    log.push(["new ImportOptions", f && f.fsName]);
    if (world.importOptionsThrows) throw new Error("mock: unsupported file");
    this.file = f;
    this.importAs = null;
    this.sequence = true;
    world.lastImportOptions = this;
  }
  ImportOptions.prototype.canImportAs = function (t) {
    return t === ImportAsType.FOOTAGE ? world.canImport : false;
  };

  // ---- app / project ----
  const app = {
    undoLog: [],
    undoDepth: 0,
    endUndoThrows: false,
    beginUndoGroup(name) {
      this.undoLog.push(["begin", name]);
      log.push(["beginUndoGroup", name]);
      this.undoDepth++;
    },
    endUndoGroup() {
      this.undoLog.push(["end"]);
      log.push(["endUndoGroup"]);
      this.undoDepth--;
      if (this.endUndoThrows) throw new Error("mock: endUndoGroup failed");
    },
    project: null,
  };

  const world = {
    ctx, app, log, counters, arr,
    items: [],
    fs: { files: new Set(), folders: new Set() },
    canImport: true,
    importOptionsThrows: false,
    importFileThrows: false,
    importResult: null, // props for the FootageItem importFile creates (function(io) or object)
    lastImportOptions: null,
    itemByIdMode: "normal", // "normal" | "absent" | "throws" | "null"
    rootFolderObject() { return new FolderItem({ id: ROOT_ID, name: "Root", parentFolder: null }); },
    FootageItem, CompItem, FolderItem, AVLayer, TextLayer, File, Folder,
    addItem(item) { this.items.push(item); return item; },
    footage(props) { return this.addItem(new FootageItem(props)); },
    comp(props) { return this.addItem(new CompItem(props)); },
    folder(props = {}) {
      return this.addItem(new FolderItem({ parentFolder: this.rootFolderObject(), ...props }));
    },
    indexOf(item) { return this.items.indexOf(item) + 1; },
    undoBalanced() {
      const b = app.undoLog.filter((x) => x[0] === "begin").length;
      const e = app.undoLog.filter((x) => x[0] === "end").length;
      return { begins: b, ends: e, balanced: b === e };
    },
  };

  const project = {
    get numItems() { return world.items.length; },
    item(i) {
      if (typeof i !== "number" || i < 1 || i > world.items.length || Math.floor(i) !== i) {
        throw new Error(`mock: After Effects error: item index ${i} out of range`);
      }
      return world.items[i - 1];
    },
    get rootFolder() { return world.rootFolderObject(); }, // new object each time: compare by id!
    importFile(io) {
      counters.importFile++;
      log.push(["importFile"]);
      if (world.importFileThrows) throw new Error("mock: import failed");
      const base = typeof world.importResult === "function" ? world.importResult(io) : world.importResult || {};
      const name = base.name || (io.file ? io.file.name : "imported");
      const item = new FootageItem({ fsName: io.file ? io.file.fsName : "x", name, ...base });
      world.items.push(item);
      return item;
    },
    items: {
      addFolder(name) {
        counters.addFolder++;
        log.push(["addFolder", name]);
        const f = new FolderItem({ name, parentFolder: world.rootFolderObject() });
        world.items.push(f);
        return f;
      },
    },
  };
  Object.defineProperty(project, "itemByID", {
    get() {
      if (world.itemByIdMode === "absent") return undefined;
      return function (id) {
        log.push(["itemByID", id]);
        if (world.itemByIdMode === "throws") throw new Error("mock: itemByID failed");
        if (world.itemByIdMode === "null") return null;
        return world.items.find((x) => x.id === id) || null;
      };
    },
  });
  app.project = project;

  Object.assign(ctx, {
    app, File, Folder, ImportOptions, ImportAsType, CompItem, FootageItem, FolderItem, AVLayer,
    logToPanel() {},
  });

  const { commands, polyfill } = extractCommandSources();
  vm.runInContext(polyfill, ctx, { filename: "json-polyfill.jsx" });
  vm.runInContext(commands, ctx, { filename: "footage-commands.jsx" });

  /** Converts Node-realm args into vm-realm objects/arrays (as ExtendScript's JSON.parse would). */
  world.toCtx = function toCtx(x) {
    if (Array.isArray(x)) return arr(x.map(toCtx));
    if (x !== null && typeof x === "object") {
      const o = vm.runInContext("({})", ctx);
      for (const k of Object.keys(x)) o[k] = toCtx(x[k]);
      return o;
    }
    return x;
  };

  /** Runs a command; asserts it returns a string that parses as JSON; returns { raw, json }. */
  world.run = function run(command, args) {
    const fn = ctx[command];
    if (typeof fn !== "function") throw new Error(`command ${command} is not defined`);
    const raw = fn(args === undefined ? undefined : world.toCtx(args));
    if (typeof raw !== "string") throw new Error(`${command} must return a string, got ${typeof raw}`);
    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      throw new Error(`${command} returned invalid JSON (${e.message}): ${raw.slice(0, 400)}`);
    }
    return { raw, json };
  };

  return world;
}
