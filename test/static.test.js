// Static checks on src/scripts/mcp-bridge-auto.jsx and src/index.ts (spec §1, §8, §9.1, §11).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  JSX_PATH,
  INDEX_TS_PATH,
  MARKER_BEGIN,
  MARKER_END,
  PURE_FUNCTION_NAMES,
  PURE_CONSTANT_NAMES,
  findMarkerLines,
  extractPureBlock,
  createEs3Context,
} from "./helpers/load-pure.js";

const jsx = fs.readFileSync(JSX_PATH, "utf8");
const indexTs = fs.readFileSync(INDEX_TS_PATH, "utf8");
const jsxLines = jsx.split(/\r?\n/);

function getPureBlock() {
  return extractPureBlock(jsx); // throws with a descriptive message when markers are wrong
}

/**
 * Removes string literals and comments so token checks do not trip over messages or prose.
 * Scans left to right so quotes inside comments and comment markers inside strings are handled.
 * (Regex literals are left as-is; the pure block's regexes contain no quotes or comment markers.)
 */
function stripStringsAndComments(src) {
  return src.replace(/"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (m) => {
    if (m[0] === '"' || m[0] === "'") return '""';
    return m.startsWith("/*") ? " " : "";
  });
}

describe("mcp-bridge-auto.jsx — syntax and command wiring", () => {
  test("full jsx source parses as a vm.Script", () => {
    assert.doesNotThrow(() => new vm.Script(jsx, { filename: "mcp-bridge-auto.jsx" }));
  });

  for (const name of ["importFootage", "addFootageLayer", "setLayerTimeRemap"]) {
    test(`defines function ${name}(`, () => {
      assert.ok(jsx.includes(`function ${name}(`), `missing 'function ${name}('`);
    });

    test(`executeCommand has case "${name}": calling ${name}(args)`, () => {
      const re = new RegExp(`^\\s*case "${name}":\\s*$`, "m");
      assert.ok(re.test(jsx), `missing 'case "${name}":' line`);
      const idx = jsxLines.findIndex((l) => re.test(l));
      const window = jsxLines.slice(idx, idx + 6).join("\n");
      assert.ok(window.includes(`result = ${name}(args);`), `case "${name}" must call result = ${name}(args);`);
      assert.ok(/\bbreak;/.test(window), `case "${name}" must end with break;`);
    });
  }

  test("new case branches are placed before default:", () => {
    const defaultIdx = jsxLines.findIndex((l) => /^\s*default:\s*$/.test(l));
    assert.ok(defaultIdx > 0, "default: not found");
    for (const name of ["importFootage", "addFootageLayer", "setLayerTimeRemap"]) {
      const idx = jsxLines.findIndex((l) => l.trim() === `case "${name}":`);
      assert.ok(idx > 0 && idx < defaultIdx, `case "${name}" must appear before default:`);
    }
  });

  test("undo group names are present", () => {
    for (const n of ["MCP: Import Footage", "MCP: Add Footage Layer", "MCP: Set Time Remap"]) {
      assert.ok(jsx.includes(`"${n}"`), `missing undo group name "${n}"`);
    }
  });
});

describe("pure block — markers and placement (§1.1, §1.2)", () => {
  test("each marker line appears exactly once, begin before end", () => {
    const b = findMarkerLines(jsxLines, MARKER_BEGIN);
    const e = findMarkerLines(jsxLines, MARKER_END);
    assert.equal(b.length, 1, `'${MARKER_BEGIN}' occurrences`);
    assert.equal(e.length, 1, `'${MARKER_END}' occurrences`);
    assert.ok(b[0] < e[0], "begin must precede end");
  });

  test("marker text does not appear anywhere else (e.g. indented copies)", () => {
    assert.equal(jsx.split("@pure-begin footage-timing").length - 1, 1);
    assert.equal(jsx.split("@pure-end footage-timing").length - 1, 1);
  });

  test("pure block sits after bridgeTestEffects and before the JSON polyfill, followed by the commands", () => {
    const b = findMarkerLines(jsxLines, MARKER_BEGIN)[0];
    const e = findMarkerLines(jsxLines, MARKER_END)[0];
    const bte = jsxLines.findIndex((l) => /^function bridgeTestEffects\(/.test(l));
    const poly = jsxLines.findIndex((l) => l.includes("// JSON polyfill for ExtendScript"));
    assert.ok(bte >= 0 && poly >= 0, "anchors not found");
    assert.ok(bte < b, "pure block must come after bridgeTestEffects");
    for (const name of ["importFootage", "addFootageLayer", "setLayerTimeRemap"]) {
      const idx = jsxLines.findIndex((l) => l.startsWith(`function ${name}(`));
      assert.ok(idx > e, `${name} must be defined after the pure block`);
      assert.ok(idx < poly, `${name} must be defined before the JSON polyfill`);
    }
  });
});

describe("pure block — content rules (§1.3)", () => {
  test("spec §11 forbidden tokens are absent", () => {
    const code = stripStringsAndComments(getPureBlock());
    const forbidden = [
      ["=>", /=>/],
      ["let ", /\blet\s/],
      ["const ", /\bconst\s/],
      ["` (template literal)", /`/],
      ["JSON.", /\bJSON\./],
      ["app.", /\bapp\./],
      ["instanceof Array", /instanceof\s+Array\b/],
    ];
    for (const [name, re] of forbidden) assert.ok(!re.test(code), `forbidden token ${name} found in pure block`);
  });

  test("raw pure block (incl. comments/strings) contains no =>, backticks, 'instanceof Array'", () => {
    const raw = getPureBlock();
    assert.ok(!raw.includes("=>"), "=> found");
    assert.ok(!raw.includes("`"), "backtick found");
    assert.ok(!/instanceof\s+Array\b/.test(raw), "instanceof Array found");
  });

  test("no non-ES3 built-ins", () => {
    const code = stripStringsAndComments(getPureBlock());
    const forbidden = [
      /\.forEach\s*\(/, /\.map\s*\(/, /\.filter\s*\(/, /\.reduce\s*\(/, /\.some\s*\(/, /\.every\s*\(/,
      /\.indexOf\s*\(/, /\.trim\s*\(/, /\bArray\.isArray\b/, /\bNumber\.isFinite\b/, /\bNumber\.isNaN\b/,
      /\bObject\.keys\b/, /\bObject\.create\b/, /\bDate\.now\b/, /\bJSON\b/,
    ];
    for (const re of forbidden) assert.ok(!re.test(code), `forbidden construct ${re} found in pure block`);
  });

  test("no trailing commas in array/object literals", () => {
    const code = stripStringsAndComments(getPureBlock());
    assert.ok(!/,\s*[\]}]/.test(code), "trailing comma found");
  });

  test("no getters/setters", () => {
    const code = stripStringsAndComments(getPureBlock());
    assert.ok(!/\b(get|set)\s+[A-Za-z_$][\w$]*\s*\(/.test(code), "getter/setter syntax found");
    assert.ok(!/__define[GS]etter__|defineProperty/.test(code), "defineProperty/__defineGetter__ found");
  });

  test("no AE globals", () => {
    const code = stripStringsAndComments(getPureBlock());
    for (const re of [/\bapp\b/, /\$\./, /\bFile\b/, /\bFolder\b/, /\bCompItem\b/, /\bFootageItem\b/, /\blogToPanel\b/, /\bAVLayer\b/, /\bImportOptions\b/]) {
      assert.ok(!re.test(code), `AE global ${re} referenced in pure block`);
    }
  });

  test("cross-realm array detection uses Object.prototype.toString", () => {
    const code = getPureBlock();
    assert.ok(code.includes("Object.prototype.toString.call("), "expected Object.prototype.toString.call(x) array check");
  });

  test("no throw statements (pure functions never throw)", () => {
    const code = stripStringsAndComments(getPureBlock());
    assert.ok(!/\bthrow\b/.test(code), "throw found in pure block");
  });

  test("top level declares only the allowed names (and _pf* functions)", () => {
    const block = getPureBlock();
    const baseline = createEs3Context();
    const baseNames = new Set(Array.from(vm.runInContext("Object.getOwnPropertyNames(this)", baseline)));
    const ctx = createEs3Context();
    vm.runInContext(block, ctx);
    const added = Array.from(vm.runInContext("Object.getOwnPropertyNames(this)", ctx)).filter((n) => !baseNames.has(n));
    const allowed = new Set([...PURE_FUNCTION_NAMES, ...PURE_CONSTANT_NAMES]);
    for (const n of added) {
      if (allowed.has(n)) continue;
      assert.ok(/^_pf/.test(n), `unexpected top-level name '${n}' in pure block`);
      assert.equal(typeof ctx[n], "function", `extra helper '${n}' must be declared with function`);
    }
    for (const n of PURE_FUNCTION_NAMES) assert.equal(typeof ctx[n], "function", `${n} must be a function`);
    assert.equal(ctx.FOOTAGE_TIMING_EPSILON, 0.001);
    assert.equal(ctx.STILL_DEFAULT_DURATION, 5);
  });

  test("top-level statements are only var/function declarations", () => {
    // Every non-blank, non-comment line at column 0 (outside function bodies) must start a
    // var or function declaration or be a closing brace.
    const lines = stripStringsAndComments(getPureBlock()).split("\n");
    let depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (depth === 0 && trimmed.length > 0) {
        assert.ok(/^(var\s+(FOOTAGE_TIMING_EPSILON|STILL_DEFAULT_DURATION)\s*=|function\s+[A-Za-z_$][\w$]*\s*\(|\}|;)/.test(trimmed),
          `unexpected top-level statement: ${trimmed}`);
      }
      for (const ch of line) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
    }
    assert.equal(depth, 0, "unbalanced braces in pure block");
  });

  test("pure block runs in a fresh ES3 context without errors", () => {
    const ctx = createEs3Context();
    assert.doesNotThrow(() => vm.runInContext(getPureBlock(), ctx));
  });
});

describe("src/index.ts — allowedScripts and footage section (§9)", () => {
  test("allowedScripts contains importFootage, addFootageLayer, setLayerTimeRemap", () => {
    const m = indexTs.match(/const allowedScripts\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(m, "allowedScripts array not found");
    const names = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    for (const n of ["importFootage", "addFootageLayer", "setLayerTimeRemap"]) {
      assert.ok(names.includes(n), `allowedScripts missing "${n}"`);
    }
    // Existing entries must be preserved.
    for (const n of ["listCompositions", "getProjectInfo", "setLayerMask"]) assert.ok(names.includes(n), `allowedScripts lost "${n}"`);
  });

  test("footage tools section is delimited and above the server start", () => {
    const begin = indexTs.indexOf("// --- BEGIN FOOTAGE TOOLS ---");
    const end = indexTs.indexOf("// --- END FOOTAGE TOOLS ---");
    const start = indexTs.indexOf("// Start the MCP server");
    assert.ok(begin >= 0 && end > begin, "BEGIN/END FOOTAGE TOOLS markers missing or out of order");
    assert.ok(start > end, "footage section must be above '// Start the MCP server'");
    const section = indexTs.slice(begin, end);
    for (const n of ["importFootage", "addFootageLayer", "setLayerTimeRemap"]) {
      assert.ok(section.includes(`"${n}"`), `tool "${n}" not registered in the footage section`);
    }
    assert.ok(section.includes("AE_MCP_BRIDGE_TIMEOUT_MS"), "AE_MCP_BRIDGE_TIMEOUT_MS test hook missing");
    assert.ok(section.includes("function queueCommandAndWait("), "queueCommandAndWait helper missing");
  });
});

describe("line endings (CRLF preserved)", () => {
  for (const [name, text] of [["src/index.ts", indexTs], ["src/scripts/mcp-bridge-auto.jsx", jsx]]) {
    test(`${name} uses CRLF only`, () => {
      const lf = (text.match(/\n/g) || []).length;
      const crlf = (text.match(/\r\n/g) || []).length;
      const bareCr = (text.match(/\r(?!\n)/g) || []).length;
      assert.ok(crlf > 0, "no CRLF line endings found");
      assert.equal(lf - crlf, 0, `${lf - crlf} bare LF line ending(s) found`);
      assert.equal(bareCr, 0, `${bareCr} bare CR(s) found`);
    });
  }
});
