// parseNumericInput / parsePositiveIntInput — spec §2.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseNumericInput, parsePositiveIntInput, plain, assertNoUndefinedProps, REALMS } from "./helpers/load-pure.js";

const OK = (value) => ({ ok: true, value });
const MISSING = { ok: false, reason: "missing" };
const INVALID = { ok: false, reason: "invalid" };

function check(fn, input, expected) {
  let res;
  assert.doesNotThrow(() => { res = fn(input); });
  assertNoUndefinedProps(res);
  const r = plain(res);
  if (expected.ok) {
    assert.equal(r.ok, true, `expected ok for ${label(input)}, got ${JSON.stringify(r)}`);
    assert.equal(typeof res.value, "number", "value must be a number");
    assert.ok(Object.is(res.value, expected.value) || res.value === expected.value, `value: expected ${expected.value}, got ${res.value}`);
  } else {
    assert.deepEqual({ ok: r.ok, reason: r.reason }, expected, `for ${label(input)}`);
  }
}

function label(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "function") return "function";
  if (typeof v === "symbol") return "symbol";
  if (Array.isArray(v)) return `[${v.join(",")}]`;
  if (v && typeof v === "object") return "object";
  return String(v);
}

const NUMERIC = [
  [undefined, MISSING],
  [null, MISSING],
  [0, OK(0)],
  [-0, OK(-0)],
  [1.5, OK(1.5)],
  [-2.25, OK(-2.25)],
  [1e21, OK(1e21)],
  [Number.MAX_VALUE, OK(Number.MAX_VALUE)],
  [NaN, INVALID],
  [Infinity, INVALID],
  [-Infinity, INVALID],
  ["0", OK(0)],
  ["1.5", OK(1.5)],
  ["-1.5", OK(-1.5)],
  ["+3", OK(3)],
  [".5", OK(0.5)],
  ["5.", OK(5)],
  ["1e0", OK(1)],
  ["1E3", OK(1000)],
  ["2.5e-1", OK(0.25)],
  ["-.5e+1", OK(-5)],
  [" 2 ", OK(2)],
  ["\t7\n", OK(7)],
  ["", INVALID],
  ["   ", INVALID],
  ["abc", INVALID],
  ["1.5s", INVALID],
  ["0x10", INVALID],
  ["Infinity", INVALID],
  ["1e999", INVALID], // overflows to Infinity (spec §2, review round 1)
  ["-1e999", INVALID],
  ["-Infinity", INVALID],
  ["NaN", INVALID],
  ["1,5", INVALID],
  ["1 2", INVALID],
  [".", INVALID],
  ["e5", INVALID],
  ["1e", INVALID],
  ["+-1", INVALID],
  ["--1", INVALID],
  [true, INVALID],
  [false, INVALID],
  [{}, INVALID],
  [{ valueOf: () => 3 }, INVALID],
  [[], INVALID],
  [[1], INVALID],
  [() => 1, INVALID],
];

const POS_INT = [
  [undefined, MISSING],
  [null, MISSING],
  [1, OK(1)],
  [2, OK(2)],
  [123456, OK(123456)],
  [0, INVALID],
  [-1, INVALID],
  [1.5, INVALID],
  [0.999, INVALID],
  [NaN, INVALID],
  [Infinity, INVALID],
  ["1", OK(1)],
  ["42", OK(42)],
  [" 3 ", OK(3)],
  ["007", OK(7)],
  ["0", INVALID],
  ["00", INVALID],
  ["-1", INVALID],
  ["+1", INVALID],
  ["1.0", INVALID],
  ["1.5", INVALID],
  ["1e2", INVALID],
  ["", INVALID],
  ["abc", INVALID],
  ["0x1", INVALID],
  [true, INVALID],
  [false, INVALID],
  [{}, INVALID],
  [[1], INVALID],
  [() => 1, INVALID],
];

describe("parseNumericInput (§2)", () => {
  for (const [input, expected] of NUMERIC) {
    test(`${label(input)} → ${expected.ok ? "ok " + expected.value : expected.reason}`, () => check(parseNumericInput, input, expected));
  }
  test("vm-realm array/object inputs are invalid too", () => {
    const vmRealm = REALMS.find((r) => r.name === "vm-realm");
    check(parseNumericInput, vmRealm.convert([1]), INVALID);
    check(parseNumericInput, vmRealm.convert({ a: 1 }), INVALID);
  });
});

describe("parsePositiveIntInput (§2)", () => {
  for (const [input, expected] of POS_INT) {
    test(`${label(input)} → ${expected.ok ? "ok " + expected.value : expected.reason}`, () => check(parsePositiveIntInput, input, expected));
  }
});
