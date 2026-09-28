// Loads the pure "footage-timing" block from src/scripts/mcp-bridge-auto.jsx into an
// isolated vm context that mimics ExtendScript's ES3 runtime (spec §11).
//
// The pure block is the text strictly between the two marker lines:
//   // @pure-begin footage-timing
//   // @pure-end footage-timing
//
// Test-only override: set AE_MCP_PURE_SOURCE to the path of another file containing the
// same markers (used by QA to validate the test tables against a reference implementation).

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");
export const JSX_PATH = path.join(REPO_ROOT, "src", "scripts", "mcp-bridge-auto.jsx");
export const INDEX_TS_PATH = path.join(REPO_ROOT, "src", "index.ts");

export const MARKER_BEGIN = "// @pure-begin footage-timing";
export const MARKER_END = "// @pure-end footage-timing";

export const PURE_FUNCTION_NAMES = [
  "parseNumericInput",
  "parsePositiveIntInput",
  "computeFootagePlacement",
  "validateTimeRemapKeyframes",
  "planTimeRemapKeyframes",
];
export const PURE_CONSTANT_NAMES = ["FOOTAGE_TIMING_EPSILON", "STILL_DEFAULT_DURATION"];

// Exactly as spec §11.
export const ES3_PRELUDE = [
  "delete Array.prototype.forEach; delete Array.prototype.map; delete Array.prototype.filter;",
  "delete Array.prototype.reduce; delete Array.prototype.some; delete Array.prototype.every;",
  "delete Array.prototype.indexOf; delete Array.isArray; delete String.prototype.trim;",
  "delete Number.isFinite; delete Number.isNaN; delete Object.keys; delete Date.now;",
  "JSON = undefined;",
].join("\n");

export const PURE_SOURCE_PATH = process.env.AE_MCP_PURE_SOURCE
  ? path.resolve(process.env.AE_MCP_PURE_SOURCE)
  : JSX_PATH;

/** Returns the marker line indices (0-based) found in `lines` for an exact marker (trailing \r tolerated). */
export function findMarkerLines(lines, marker) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, "") === marker) hits.push(i);
  }
  return hits;
}

/**
 * Extracts the pure block from a source text. Throws a descriptive Error if the markers are
 * missing, duplicated or out of order.
 */
export function extractPureBlock(source) {
  const lines = source.split(/\r?\n/);
  const begins = findMarkerLines(lines, MARKER_BEGIN);
  const ends = findMarkerLines(lines, MARKER_END);
  if (begins.length !== 1) {
    throw new Error(`Expected exactly one '${MARKER_BEGIN}' line, found ${begins.length}`);
  }
  if (ends.length !== 1) {
    throw new Error(`Expected exactly one '${MARKER_END}' line, found ${ends.length}`);
  }
  if (!(begins[0] < ends[0])) {
    throw new Error("Pure block begin marker must come before the end marker");
  }
  return lines.slice(begins[0] + 1, ends[0]).join("\n");
}

/** Creates a fresh vm context with the ES3 prelude applied. */
export function createEs3Context() {
  const ctx = vm.createContext({});
  vm.runInContext(ES3_PRELUDE, ctx, { filename: "es3-prelude.js" });
  return ctx;
}

/**
 * Loads the pure block into a fresh ES3 context. Returns { ctx, block, error }.
 * Never throws: `error` holds the reason if loading failed (so test files can report it per test
 * instead of crashing at import time while the implementation is still in progress).
 */
export function loadPureBlock(sourcePath = PURE_SOURCE_PATH) {
  let block = null;
  try {
    const source = fs.readFileSync(sourcePath, "utf8");
    block = extractPureBlock(source);
    const ctx = createEs3Context();
    vm.runInContext(block, ctx, { filename: "pure-block.js" });
    return { ctx, block, error: null };
  } catch (err) {
    return { ctx: null, block, error: err };
  }
}

const loaded = loadPureBlock();
export const pureLoadError = loaded.error;
export const pureBlock = loaded.block;
export const pureContext = loaded.ctx;

function pick(name) {
  const fn = loaded.ctx ? loaded.ctx[name] : undefined;
  if (typeof fn === "function") return fn;
  return function missingPureFunction() {
    const why = loaded.error ? loaded.error.message : `function ${name} is not defined in the pure block`;
    throw new Error(`Pure function '${name}' unavailable: ${why}`);
  };
}

export const parseNumericInput = pick("parseNumericInput");
export const parsePositiveIntInput = pick("parsePositiveIntInput");
export const computeFootagePlacement = pick("computeFootagePlacement");
export const validateTimeRemapKeyframes = pick("validateTimeRemapKeyframes");
export const planTimeRemapKeyframes = pick("planTimeRemapKeyframes");
export const FOOTAGE_TIMING_EPSILON = loaded.ctx ? loaded.ctx.FOOTAGE_TIMING_EPSILON : undefined;
export const STILL_DEFAULT_DURATION = loaded.ctx ? loaded.ctx.STILL_DEFAULT_DURATION : undefined;

/** Normalises a (possibly vm-realm) value for deepStrictEqual. */
export const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export const NUM_TOLERANCE = 1e-9;

/** True if |a - b| < tol. */
export function isClose(a, b, tol = NUM_TOLERANCE) {
  return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < tol;
}

/** Assertion helper: numbers within tolerance, with a useful message. */
export function assertClose(actual, expected, label = "value", tol = NUM_TOLERANCE) {
  if (typeof actual !== "number" || !isClose(actual, expected, tol)) {
    throw new Error(`${label}: expected ${expected} (±${tol}), got ${String(actual)} (${typeof actual})`);
  }
}

/** Asserts an array of numbers matches element-wise within tolerance. */
export function assertCloseArray(actual, expected, label = "array", tol = NUM_TOLERANCE) {
  if (Object.prototype.toString.call(actual) !== "[object Array]") {
    throw new Error(`${label}: expected an array, got ${Object.prototype.toString.call(actual)}`);
  }
  if (actual.length !== expected.length) {
    throw new Error(`${label}: expected length ${expected.length}, got ${actual.length} (${JSON.stringify(actual)})`);
  }
  expected.forEach((e, i) => assertClose(actual[i], e, `${label}[${i}]`, tol));
}

/** Throws if any own property anywhere in `x` has the value `undefined` (spec §1.3). */
export function assertNoUndefinedProps(x, label = "result", seen = new Set()) {
  if (x === null || typeof x !== "object" || seen.has(x)) return;
  seen.add(x);
  for (const key of Object.getOwnPropertyNames(x)) {
    if (Object.prototype.toString.call(x) === "[object Array]" && key === "length") continue;
    const v = x[key];
    if (v === undefined) throw new Error(`${label}.${key} is undefined (use null instead)`);
    assertNoUndefinedProps(v, `${label}.${key}`, seen);
  }
}

/** Deep snapshot that keeps NaN/Infinity/undefined (structuredClone), for mutation checks. */
export const snapshot = (x) => structuredClone(x);

const ctxArray = loaded.ctx ? vm.runInContext("Array", loaded.ctx) : null;
const ctxObject = loaded.ctx ? vm.runInContext("Object", loaded.ctx) : null;

/**
 * Recursively rebuilds plain objects/arrays using the vm context's own Array/Object
 * constructors. Such inputs lack the methods removed by the ES3 prelude (forEach, indexOf, ...),
 * so a pure function that calls them on its inputs fails the test.
 */
export function toContextRealm(x) {
  if (!ctxArray) return x;
  if (Object.prototype.toString.call(x) === "[object Array]") {
    const arr = new ctxArray();
    for (let i = 0; i < x.length; i++) arr.push(toContextRealm(x[i]));
    return arr;
  }
  if (x !== null && typeof x === "object") {
    const obj = new ctxObject();
    for (const key of Object.getOwnPropertyNames(x)) obj[key] = toContextRealm(x[key]);
    return obj;
  }
  return x;
}

/** Realms each table case runs in: Node-realm inputs (cross-realm) and vm-realm inputs (ES3). */
export const REALMS = [
  { name: "node-realm", convert: (x) => x },
  { name: "vm-realm", convert: toContextRealm },
];
