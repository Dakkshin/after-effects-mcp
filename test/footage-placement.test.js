// computeFootagePlacement — spec §3 and worked examples §6.1 (P1–P46, incl. "also" variants).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeFootagePlacement,
  plain,
  assertClose,
  assertNoUndefinedProps,
  snapshot,
  REALMS,
} from "./helpers/load-pure.js";

const fd24 = 1001 / 24000;
const fd30 = 1001 / 30000;

// Build an opts object from the spec's abbreviations. Only keys that are present in `a` are set
// (so `{sIn: undefined}` produces an own property with value undefined, as in P24).
function opts(a) {
  const map = {
    cst: "compStartTime",
    D: "sourceDuration",
    sIn: "sourceInPoint",
    sOut: "sourceOutPoint",
    fd: "frameDuration",
    compDuration: "compDuration",
    isStill: "isStill",
  };
  const o = {};
  for (const k of Object.keys(a)) {
    if (!(k in map)) throw new Error(`unknown abbreviation ${k}`);
    o[map[k]] = a[k];
  }
  return o;
}

// ok(start, in, out, dur, sOutEff, extra?) / err(code, field)
const ok = (start, inP, out, dur, sOut, extra = {}) => ({ ok: true, start, inP, out, dur, sOut, ...extra });
const err = (code, field) => ({ ok: false, code, field });

const W_IN = "IN_BEFORE_COMP_START";
const W_OUT = "OUT_BEYOND_COMP_END";

// Each row: [id, input (abbreviated object or raw non-object value), expected]
const P = [
  ["P1", opts({ cst: 0, D: 10 }), ok(0, 0, 10, 10, 10)],
  ["P2", opts({ cst: 5, sIn: 2, sOut: 6, D: 10 }), ok(3, 5, 9, 4, 6)],
  ["P3", opts({ cst: 1, sIn: 4, sOut: 7, D: 10 }), ok(-3, 1, 4, 3, 7)],
  ["P4", opts({ cst: -2, sIn: 0, sOut: 3, D: 10 }), ok(-2, -2, 1, 3, 3, { warnings: [W_IN] })],
  ["P5", opts({ cst: 0, sIn: 8, sOut: 10, D: 10 }), ok(-8, 0, 2, 2, 10)],
  ["P6", opts({ cst: 0, sOut: 10.0005, D: 10 }), ok(0, 0, 10, 10, 10)],
  ["P7", opts({ cst: 0, sOut: 10.001, D: 10 }), ok(0, 0, 10, 10, 10)],
  ["P8", opts({ cst: 0, sOut: 10.002, D: 10 }), err("OUT_EXCEEDS_DURATION", "sourceOutPoint")],
  ["P9", opts({ cst: 0, sOut: 12, D: 10 }), err("OUT_EXCEEDS_DURATION", "sourceOutPoint")],
  ["P10", opts({ cst: 0, sIn: 3, sOut: 3, D: 10 }), err("IN_NOT_BEFORE_OUT", "sourceOutPoint")],
  ["P11", opts({ cst: 0, sIn: 5, sOut: 4, D: 10 }), err("IN_NOT_BEFORE_OUT", "sourceOutPoint")],
  ["P12", opts({ cst: 0, sIn: 12, D: 10 }), err("IN_NOT_BEFORE_OUT", "sourceOutPoint")],
  ["P13", opts({ cst: 0, sIn: 15, sOut: 12, D: 10 }), err("OUT_EXCEEDS_DURATION", "sourceOutPoint")],
  ["P14", opts({ cst: 0, sIn: -1, D: 10 }), err("NEGATIVE_VALUE", "sourceInPoint")],
  ["P15", opts({ cst: 0, sOut: -1, D: 10 }), err("NEGATIVE_VALUE", "sourceOutPoint")],
  ["P16", opts({ cst: 0, sIn: -1, sOut: 20, D: 10 }), err("NEGATIVE_VALUE", "sourceInPoint")],
  ["P17", opts({ cst: NaN, D: 10 }), err("INVALID_NUMBER", "compStartTime")],
  ["P18", opts({ cst: 0, sOut: Infinity, D: 10 }), err("INVALID_NUMBER", "sourceOutPoint")],
  ["P19", opts({ cst: true, D: 10 }), err("INVALID_NUMBER", "compStartTime")],
  ["P20", opts({ cst: "abc", sIn: -1, D: 10 }), err("INVALID_NUMBER", "compStartTime")],
  ["P21", opts({ cst: "1.5", sIn: "0.5", sOut: "2.5", D: "10" }), ok(1, 1.5, 3.5, 2, 2.5, { sIn: 0.5 })],
  ["P22", opts({ cst: " 2 ", sIn: ".5", sOut: "1e0", D: "+3" }), ok(1.5, 2, 2.5, 0.5, 1, { sIn: 0.5 })],
  ["P23", opts({ cst: 0, sIn: "abc", D: 10 }), err("INVALID_NUMBER", "sourceInPoint")],
  ["P23 also sIn:\"\"", opts({ cst: 0, sIn: "", D: 10 }), err("INVALID_NUMBER", "sourceInPoint")],
  ["P23 also sIn:\"1.5s\"", opts({ cst: 0, sIn: "1.5s", D: 10 }), err("INVALID_NUMBER", "sourceInPoint")],
  ["P24", opts({ cst: 2, sIn: null, sOut: undefined, D: 4 }), ok(2, 2, 6, 4, 4, { sIn: 0 })],
  ["P25", opts({ D: 10 }), err("MISSING_VALUE", "compStartTime")],
  ["P25 also cst:null", opts({ cst: null, D: 10 }), err("MISSING_VALUE", "compStartTime")],
  ["P26", opts({ cst: 0 }), err("MISSING_VALUE", "sourceDuration")],
  ["P27", opts({ cst: 0, D: -1 }), err("NEGATIVE_VALUE", "sourceDuration")],
  ["P28 null", null, err("INVALID_INPUT", null)],
  ["P28 \"x\"", "x", err("INVALID_INPUT", null)],
  ["P28 []", [], err("INVALID_INPUT", null)],
  ["P28 undefined", undefined, err("INVALID_INPUT", null)],
  ["P29", opts({ cst: 0, D: 10, isStill: "yes" }), err("INVALID_INPUT", "isStill")],
  ["P30", opts({ cst: 3, isStill: true, D: 0 }), ok(3, 3, 8, 5, 5, { isStill: true })],
  ["P31", opts({ cst: 3, isStill: true, sIn: 2 }), ok(1, 3, 8, 5, 7, { isStill: true, sIn: 2 })],
  ["P32", opts({ cst: 0, isStill: true, D: 0, sOut: 20 }), ok(0, 0, 20, 20, 20, { isStill: true })],
  ["P33", opts({ cst: 0, isStill: true, D: "abc" }), ok(0, 0, 5, 5, 5, { isStill: true })],
  ["P34", opts({ cst: 8, isStill: true, compDuration: 10 }), ok(8, 8, 13, 5, 5, { isStill: true, warnings: [W_OUT] })],
  ["P35", opts({ cst: 5, D: 10, compDuration: 10 }), ok(5, 5, 15, 10, 10, { warnings: [W_OUT] })],
  ["P36", opts({ cst: 0, D: 10, compDuration: 10 }), ok(0, 0, 10, 10, 10)],
  ["P37", opts({ cst: 0, D: 10, compDuration: 0 }), err("NON_POSITIVE_VALUE", "compDuration")],
  ["P38", opts({ cst: 0, D: 10, fd: 0 }), err("NON_POSITIVE_VALUE", "frameDuration")],
  ["P38 also fd:-0.04", opts({ cst: 0, D: 10, fd: -0.04 }), err("NON_POSITIVE_VALUE", "frameDuration")],
  ["P39", opts({ cst: 1, sIn: 0.5, sOut: 2.5, D: 10, fd: fd24 }),
    ok(0.501, 1.001, 3.003, 2.002, 2.502, { frameRounded: true, sIn: 0.5 })],
  ["P40", opts({ cst: 2, sIn: 1, sOut: 4, D: 10, fd: fd30 }),
    ok(1.002, 2.002, 5.005, 3.003, 4.003, { frameRounded: true, sIn: 1 })],
  ["P41", opts({ cst: 0, sIn: 0, sOut: 10, D: 10, fd: fd30 }),
    ok(0, 0, 9.976633333333334, 9.976633333333334, 9.976633333333334, { frameRounded: true })],
  ["P42", opts({ cst: 0, sIn: 0, sOut: 2, D: 5, fd: 0.04 }), ok(0, 0, 2, 2, 2, { frameRounded: true })],
  ["P43", opts({ cst: -0.05, sIn: 0, sOut: 1, D: 5, fd: 0.04 }),
    ok(-0.04, -0.04, 0.96, 1, 1, { frameRounded: true, warnings: [W_IN] })],
  // Spec lists out as "10.0333333" (rounded for display); exact value is 1/30 + 10.
  ["P44", opts({ cst: 0.02, sIn: 0, sOut: 9.99, D: 10, fd: 1 / 30 }),
    ok(1 / 30, 1 / 30, 1 / 30 + 10, 10, 10, { frameRounded: true })],
  ["P45", opts({ cst: 0, sIn: 1, sOut: 1.01, D: 10, fd: 0.04 }), err("RANGE_TOO_SHORT", "sourceOutPoint")],
  ["P46", opts({ cst: 0.01, isStill: true, fd: 0.04 }), ok(0, 0, 5, 5, 5, { isStill: true, frameRounded: true })],
];

// Extra rows derived directly from the §3 algorithm text (not in the §6.1 table).
const X = [
  ["X1 isStill:null means false", opts({ cst: 0, D: 10, isStill: null }), ok(0, 0, 10, 10, 10)],
  ["X2 isStill:false explicit", opts({ cst: 1, D: 4, isStill: false }), ok(1, 1, 5, 4, 4)],
  ["X3 sourceDuration invalid string", opts({ cst: 0, D: "abc" }), err("INVALID_NUMBER", "sourceDuration")],
  ["X4 frameDuration NaN", opts({ cst: 0, D: 10, fd: NaN }), err("INVALID_NUMBER", "frameDuration")],
  ["X5 compDuration invalid string", opts({ cst: 0, D: 10, compDuration: "x" }), err("INVALID_NUMBER", "compDuration")],
  ["X6 both warnings, in order", opts({ cst: -2, D: 10, compDuration: 5 }), ok(-2, -2, 8, 10, 10, { warnings: [W_IN, W_OUT] })],
  ["X7 D:0 non-still → out defaults to 0", opts({ cst: 0, D: 0 }), err("IN_NOT_BEFORE_OUT", "sourceOutPoint")],
  ["X8 inPoint just inside -EPS: no warning", opts({ cst: -0.0005, D: 1 }), ok(-0.0005, -0.0005, 0.9995, 1, 1)],
  ["X9 frameDuration as numeric string", opts({ cst: 0, sIn: 0, sOut: 2, D: 5, fd: "0.04" }), ok(0, 0, 2, 2, 2, { frameRounded: true })],
  ["X10 order: isStill checked before compStartTime", opts({ isStill: 1 }), err("INVALID_INPUT", "isStill")],
  ["X11 order: frameDuration before compDuration", opts({ cst: 0, D: 10, fd: 0, compDuration: 0 }), err("NON_POSITIVE_VALUE", "frameDuration")],
  ["X12 order: field checks (compDuration) before range (step 9)", opts({ cst: 0, sOut: 20, D: 10, compDuration: -1 }), err("NON_POSITIVE_VALUE", "compDuration")],
  ["X13 still with negative sIn", opts({ cst: 0, isStill: true, sIn: -1 }), err("NEGATIVE_VALUE", "sourceInPoint")],
  ["X14 outPoint within EPS of compDuration: no warning", opts({ cst: 0.0005, D: 10, compDuration: 10 }), ok(0.0005, 0.0005, 10.0005, 10, 10)],
  ["X15 outPoint 2 ms beyond compDuration: warning", opts({ cst: 0.002, D: 10, compDuration: 10 }), ok(0.002, 0.002, 10.002, 10, 10, { warnings: [W_OUT] })],
];

const SUCCESS_KEYS = ["ok", "startTime", "inPoint", "outPoint", "duration", "sourceInPoint", "sourceOutPoint", "isStill", "frameRounded", "warnings"];

function checkResult(res, input, exp) {
  assert.ok(res !== null && typeof res === "object", "result must be an object");
  assertNoUndefinedProps(res);
  const r = plain(res);
  if (!exp.ok) {
    assert.equal(r.ok, false, `expected failure ${exp.code}, got ${JSON.stringify(r)}`);
    assert.ok(r.error && typeof r.error === "object", "error object required");
    assert.equal(r.error.code, exp.code);
    assert.ok("field" in r.error, "error.field must be present (string or null)");
    assert.equal(r.error.field, exp.field);
    assert.equal(typeof r.error.message, "string");
    assert.ok(r.error.message.length > 0, "error.message must be non-empty");
    return;
  }
  assert.equal(r.ok, true, `expected success, got ${JSON.stringify(r)}`);
  for (const k of SUCCESS_KEYS) assert.ok(k in r, `missing output key ${k}`);
  assertClose(res.startTime, exp.start, "startTime");
  assertClose(res.inPoint, exp.inP, "inPoint");
  assertClose(res.outPoint, exp.out, "outPoint");
  assertClose(res.duration, exp.dur, "duration");
  assertClose(res.sourceOutPoint, exp.sOut, "sourceOutPoint");
  let sIn = exp.sIn;
  if (sIn === undefined) {
    const raw = input && input.sourceInPoint;
    sIn = raw === undefined || raw === null ? 0 : Number(raw);
  }
  assertClose(res.sourceInPoint, sIn, "sourceInPoint");
  assert.equal(r.isStill, exp.isStill === true, "isStill");
  assert.equal(r.frameRounded, exp.frameRounded === true, "frameRounded");
  assert.ok(Array.isArray(r.warnings), "warnings must be an array");
  assert.deepEqual(r.warnings.map((w) => w.code), exp.warnings || []);
  for (const w of r.warnings) {
    assert.equal(typeof w.message, "string");
    assert.ok(w.message.length > 0, "warning.message must be non-empty");
  }
}

for (const [groupName, rows] of [["§6.1 worked examples", P], ["§3 algorithm-derived extras", X]]) {
  describe(`computeFootagePlacement — ${groupName}`, () => {
    for (const [id, input, exp] of rows) {
      for (const realm of REALMS) {
        test(`${id} [${realm.name}]`, () => {
          const before = realm.name === "node-realm" ? snapshot(input) : null;
          const arg = realm.convert(input);
          const res = computeFootagePlacement(arg);
          checkResult(res, input, exp);
          if (before !== null) assert.deepStrictEqual(input, before, "input must not be mutated");
          if (input !== null && typeof input === "object") assert.notEqual(res, arg, "must return a new object");
        });
      }
    }
  });
}

describe("computeFootagePlacement — output contract", () => {
  test("P21: all numeric outputs are numbers (not strings)", () => {
    const r = computeFootagePlacement({ compStartTime: "1.5", sourceInPoint: "0.5", sourceOutPoint: "2.5", sourceDuration: "10" });
    for (const k of ["startTime", "inPoint", "outPoint", "duration", "sourceInPoint", "sourceOutPoint"]) {
      assert.equal(typeof r[k], "number", `${k} must be a number`);
    }
  });

  test("warnings is an empty array (not missing/null) when there are none", () => {
    const r = plain(computeFootagePlacement({ compStartTime: 0, sourceDuration: 10 }));
    assert.deepEqual(r.warnings, []);
  });

  test("P41: sourceOutPoint_eff equals sourceInPoint + duration after step-down", () => {
    const r = computeFootagePlacement({ compStartTime: 0, sourceInPoint: 0, sourceOutPoint: 10, sourceDuration: 10, frameDuration: fd30 });
    assertClose(r.duration, 299 * fd30, "duration");
    assertClose(r.sourceOutPoint, r.sourceInPoint + r.duration, "sourceOutPoint");
  });

  test("never throws on hostile inputs", () => {
    const hostile = [0, 1, true, () => 1, Symbol.iterator, { compStartTime: {} }, { compStartTime: [], sourceDuration: [] },
      { compStartTime: 0, sourceDuration: 10, frameDuration: {} }];
    for (const h of hostile) {
      let res;
      assert.doesNotThrow(() => { res = computeFootagePlacement(h); }, `threw for ${String(h && h.toString ? "input" : h)}`);
      assert.equal(res.ok, false);
    }
  });

  test("frozen input is accepted (no writes to opts)", () => {
    const o = Object.freeze({ compStartTime: 1, sourceInPoint: 0.5, sourceOutPoint: 2.5, sourceDuration: 10, frameDuration: fd24 });
    const r = computeFootagePlacement(o);
    assert.equal(r.ok, true);
  });
});
