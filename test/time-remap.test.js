// validateTimeRemapKeyframes (§4, K1–K20) and planTimeRemapKeyframes (§5, T1–T8).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateTimeRemapKeyframes,
  planTimeRemapKeyframes,
  plain,
  assertClose,
  assertCloseArray,
  assertNoUndefinedProps,
  snapshot,
  REALMS,
} from "./helpers/load-pure.js";

const kf = (t, s) => ({ timeInSeconds: t, sourceTimeInSeconds: s });
const kfs = (...pairs) => pairs.map(([t, s]) => kf(t, s));

function checkError(res, exp) {
  assertNoUndefinedProps(res);
  const r = plain(res);
  assert.equal(r.ok, false, `expected ${exp.code}, got ${JSON.stringify(r)}`);
  assert.ok(r.error && typeof r.error === "object", "error object required");
  assert.equal(r.error.code, exp.code);
  if ("index" in exp) {
    assert.ok("index" in r.error, "error.index must be present (number or null)");
    assert.equal(r.error.index, exp.index, "error.index");
  }
  if ("field" in exp) {
    assert.ok("field" in r.error, "error.field must be present (string or null)");
    assert.equal(r.error.field, exp.field, "error.field");
  }
  assert.equal(typeof r.error.message, "string");
  assert.ok(r.error.message.length > 0, "error.message must be non-empty");
}

function checkKeyframesOk(res, expectedPairs) {
  assertNoUndefinedProps(res);
  const r = plain(res);
  assert.equal(r.ok, true, `expected success, got ${JSON.stringify(r)}`);
  assert.ok(Array.isArray(r.keyframes), "keyframes must be an array");
  assert.equal(r.keyframes.length, expectedPairs.length, `keyframes: ${JSON.stringify(r.keyframes)}`);
  expectedPairs.forEach(([t, s], i) => {
    assert.deepEqual(Object.keys(r.keyframes[i]).sort(), ["sourceTimeInSeconds", "timeInSeconds"], `keyframes[${i}] keys`);
    assertClose(res.keyframes[i].timeInSeconds, t, `keyframes[${i}].timeInSeconds`);
    assertClose(res.keyframes[i].sourceTimeInSeconds, s, `keyframes[${i}].sourceTimeInSeconds`);
  });
}

// [id, keyframes, D, expected]  expected = { ok: [[t,s]...] } | { code, index?, field? }
const K = [
  ["K1", [], 10, { code: "EMPTY_KEYFRAMES", index: null, field: "keyframes" }],
  ["K2 null", null, 10, { code: "INVALID_INPUT", index: null, field: "keyframes" }],
  ["K2 {}", {}, 10, { code: "INVALID_INPUT", index: null, field: "keyframes" }],
  ["K2 \"x\"", "x", 10, { code: "INVALID_INPUT", index: null, field: "keyframes" }],
  ["K3", kfs([1, 0.5]), 10, { ok: [[1, 0.5]] }],
  ["K4", kfs([2, 4], [0, 0], [1, 1]), 10, { ok: [[0, 0], [1, 1], [2, 4]] }],
  ["K5", kfs([1, 0], [1, 2]), 10, { code: "DUPLICATE_TIME", index: 1, field: "timeInSeconds" }],
  ["K6", kfs([1, 0], [1.0004, 2]), 10, { code: "DUPLICATE_TIME", index: 1, field: "timeInSeconds" }],
  ["K7", kfs([1, 0], [1.002, 2]), 10, { ok: [[1, 0], [1.002, 2]] }],
  ["K8", kfs([0, 11]), 10, { code: "SOURCE_TIME_OUT_OF_RANGE", index: 0, field: "sourceTimeInSeconds" }],
  ["K9", kfs([0, -0.5]), 10, { code: "SOURCE_TIME_OUT_OF_RANGE", index: 0, field: "sourceTimeInSeconds" }],
  ["K10", kfs([0, -0.0005], [1, 10.0005]), 10, { ok: [[0, 0], [1, 10]] }],
  ["K11", kfs([0, 10]), 10, { ok: [[0, 10]] }],
  ["K12", kfs([-1, 0], [1, 2]), 10, { ok: [[-1, 0], [1, 2]] }],
  ["K13", kfs([NaN, 0]), 10, { code: "INVALID_NUMBER", index: 0, field: "timeInSeconds" }],
  ["K14", [{ timeInSeconds: 0 }], 10, { code: "MISSING_VALUE", index: 0, field: "sourceTimeInSeconds" }],
  ["K15 null", [kf(0, 0), null], 10, { code: "INVALID_KEYFRAME", index: 1, field: null }],
  ["K15 also 5", [kf(0, 0), 5], 10, { code: "INVALID_KEYFRAME", index: 1, field: null }],
  ["K15 also [1,2]", [kf(0, 0), [1, 2]], 10, { code: "INVALID_KEYFRAME", index: 1, field: null }],
  ["K16", kfs(["1.5", "2"]), 10, { ok: [[1.5, 2]] }],
  ["K17 D=0", kfs([0, 0]), 0, { code: "INVALID_SOURCE_DURATION", index: null, field: "sourceDuration" }],
  ["K17 D=\"abc\"", kfs([0, 0]), "abc", { code: "INVALID_SOURCE_DURATION", index: null, field: "sourceDuration" }],
  ["K17 D=undefined", kfs([0, 0]), undefined, { code: "INVALID_SOURCE_DURATION", index: null, field: "sourceDuration" }],
  ["K17 D=-1", kfs([0, 0]), -1, { code: "INVALID_SOURCE_DURATION", index: null, field: "sourceDuration" }],
  ["K18", [], NaN, { code: "EMPTY_KEYFRAMES", index: null, field: "keyframes" }],
  ["K19", kfs([1, 0], [1, 0], ["x", 0]), 10, { code: "INVALID_NUMBER", index: 2, field: "timeInSeconds" }],
  ["K20", [{ timeInSeconds: 1, sourceTimeInSeconds: 2, foo: 9 }], 10, { ok: [[1, 2]] }],
  // Extras derived from §4.1 text.
  ["KX1 missing timeInSeconds", [{ sourceTimeInSeconds: 1 }], 10, { code: "MISSING_VALUE", index: 0, field: "timeInSeconds" }],
  ["KX2 invalid sourceTimeInSeconds", [kf(0, "1.5s")], 10, { code: "INVALID_NUMBER", index: 0, field: "sourceTimeInSeconds" }],
  ["KX3 D as numeric string", kfs([0, 2]), "4", { ok: [[0, 2]] }],
  ["KX4 D=null", kfs([0, 0]), null, { code: "INVALID_SOURCE_DURATION", index: null, field: "sourceDuration" }],
  ["KX5 duplicate reported at later index", kfs([5, 0], [1, 1], [5.0001, 2]), 10, { code: "DUPLICATE_TIME", index: 2, field: "timeInSeconds" }],
  ["KX6 null timeInSeconds is missing", [kf(null, 1)], 10, { code: "MISSING_VALUE", index: 0, field: "timeInSeconds" }],
];

describe("validateTimeRemapKeyframes — §6.2 K1–K20 (+ extras)", () => {
  for (const [id, keyframes, D, exp] of K) {
    for (const realm of REALMS) {
      test(`${id} [${realm.name}]`, () => {
        const before = realm.name === "node-realm" ? snapshot(keyframes) : null;
        const arg = realm.convert(keyframes);
        const res = validateTimeRemapKeyframes(arg, D);
        if (exp.ok) {
          checkKeyframesOk(res, exp.ok);
          assert.notEqual(res.keyframes, arg, "must return a new array");
          if (Array.isArray(keyframes)) {
            for (const k of res.keyframes) {
              for (let i = 0; i < arg.length; i++) assert.notEqual(k, arg[i], "output keyframes must be new objects");
            }
          }
        } else {
          checkError(res, exp);
        }
        if (before !== null) assert.deepStrictEqual(keyframes, before, "input must not be mutated");
      });
    }
  }

  test("K4: input array order and objects unchanged after sorting", () => {
    const input = kfs([2, 4], [0, 0], [1, 1]);
    const refs = input.slice();
    validateTimeRemapKeyframes(input, 10);
    assert.deepStrictEqual(input, kfs([2, 4], [0, 0], [1, 1]));
    refs.forEach((r, i) => assert.equal(input[i], r, "element identity preserved"));
  });

  test("K10: clamped values do not leak back into the input", () => {
    const input = kfs([0, -0.0005], [1, 10.0005]);
    validateTimeRemapKeyframes(input, 10);
    assert.equal(input[0].sourceTimeInSeconds, -0.0005);
    assert.equal(input[1].sourceTimeInSeconds, 10.0005);
  });

  test("K16: numeric strings are converted to numbers", () => {
    const r = validateTimeRemapKeyframes(kfs(["1.5", "2"]), 10);
    assert.equal(typeof r.keyframes[0].timeInSeconds, "number");
    assert.equal(typeof r.keyframes[0].sourceTimeInSeconds, "number");
  });

  test("never throws on hostile inputs", () => {
    for (const [k, d] of [[undefined, undefined], [[undefined], 10], [[{}], 10], [[kf({}, [])], 10], [[kf(0, 0)], {}]]) {
      let res;
      assert.doesNotThrow(() => { res = validateTimeRemapKeyframes(k, d); });
      assert.equal(res.ok, false);
    }
  });
});

// [id, existing, keyframes, wasEnabled, expected]
// expected = { times, values, removeTimes, replaced, added } | { code, field }
const T = [
  ["T1", [0, 9.966], kfs([1, 0], [3, 5]), false, { times: [1, 3], values: [0, 5], removeTimes: [0, 9.966], replaced: 0, added: 2 }],
  ["T2", [0, 9.966], kfs([0, 2], [4, 6]), false, { times: [0, 4], values: [2, 6], removeTimes: [9.966], replaced: 1, added: 1 }],
  ["T3", [0, 2, 5], kfs([2.0004, 1], [3, 4]), true, { times: [2, 3], values: [1, 4], removeTimes: [], replaced: 1, added: 1 }],
  ["T4", [], kfs([1, 1]), true, { times: [1], values: [1], removeTimes: [], replaced: 0, added: 1 }],
  ["T5", [1.0006], kfs([1.0, 7], [1.0011, 8]), false, { times: [1.0006, 1.0011], values: [7, 8], removeTimes: [], replaced: 1, added: 1 }],
  ["T6", [0, 2], kfs([0, 0], [2, 2]), false, { times: [0, 2], values: [0, 2], removeTimes: [], replaced: 2, added: 0 }],
  ["T7", "x", [], false, { code: "INVALID_INPUT", field: "existingKeyTimes" }],
  ["T8", [], kfs([1, 1]), "no", { code: "INVALID_INPUT", field: "remapWasEnabled" }],
  // Extras derived from §5 text.
  ["TX1 keyframes not an array", [0], "x", false, { code: "INVALID_INPUT", field: "keyframes" }],
  ["TX2 closest unclaimed existing time wins", [0.9995, 1.0002], kfs([1, 3]), false,
    { times: [1.0002], values: [3], removeTimes: [0.9995], replaced: 1, added: 0 }],
  // 1 ± 2^-11: both distances are exactly 0.00048828125 in binary floating point (a true tie).
  ["TX3 tie → earliest position in existingKeyTimes", [1.00048828125, 0.99951171875], kfs([1, 3]), false,
    { times: [1.00048828125], values: [3], removeTimes: [0.99951171875], replaced: 1, added: 0 }],
  ["TX4 merge keeps unclaimed existing keys", [0, 9.966], kfs([5, 5]), true,
    { times: [5], values: [5], removeTimes: [], replaced: 0, added: 1 }],
  ["TX5 removeTimes keep existingKeyTimes order", [9.966, 0, 4], kfs([4, 1]), false,
    { times: [4], values: [1], removeTimes: [9.966, 0], replaced: 1, added: 0 }],
];

describe("planTimeRemapKeyframes — §6.3 T1–T8 (+ extras)", () => {
  for (const [id, existing, keyframes, wasEnabled, exp] of T) {
    for (const realm of REALMS) {
      test(`${id} [${realm.name}]`, () => {
        const beforeE = realm.name === "node-realm" ? snapshot(existing) : null;
        const beforeK = realm.name === "node-realm" ? snapshot(keyframes) : null;
        const argE = realm.convert(existing);
        const argK = realm.convert(keyframes);
        const res = planTimeRemapKeyframes(argE, argK, wasEnabled);
        if (exp.code) {
          checkError(res, { code: exp.code, field: exp.field, index: null });
        } else {
          assertNoUndefinedProps(res);
          const r = plain(res);
          assert.equal(r.ok, true, `expected success, got ${JSON.stringify(r)}`);
          assertCloseArray(res.times, exp.times, "times");
          assertCloseArray(res.values, exp.values, "values");
          assertCloseArray(res.removeTimes, exp.removeTimes, "removeTimes");
          assert.equal(r.replacedCount, exp.replaced, "replacedCount");
          assert.equal(r.addedCount, exp.added, "addedCount");
          assert.notEqual(res.times, argE, "times must be a new array");
          assert.notEqual(res.removeTimes, argE, "removeTimes must be a new array");
        }
        if (beforeE !== null) {
          assert.deepStrictEqual(existing, beforeE, "existingKeyTimes must not be mutated");
          assert.deepStrictEqual(keyframes, beforeK, "keyframes must not be mutated");
        }
      });
    }
  }

  test("T5: exact existing time values are returned (not the caller's approximate time)", () => {
    const r = planTimeRemapKeyframes([1.0006], kfs([1.0, 7], [1.0011, 8]), false);
    assert.equal(r.times[0], 1.0006);
  });

  test("end-to-end: validate → plan (remap newly enabled, AE auto keys at 0 and D)", () => {
    const v = validateTimeRemapKeyframes(kfs([3, 5], [1, 0]), 10);
    assert.equal(v.ok, true);
    const p = plain(planTimeRemapKeyframes([0, 9.966], v.keyframes, false));
    assert.deepEqual(p.times, [1, 3]);
    assert.deepEqual(p.values, [0, 5]);
    assert.deepEqual(p.removeTimes, [0, 9.966]);
  });
});
