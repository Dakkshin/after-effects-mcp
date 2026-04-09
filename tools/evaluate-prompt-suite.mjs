import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const suitePath = path.join(repoRoot, "docs", "plansv3", "prompt-regression-suite.json");
const reportPath = path.join(repoRoot, "docs", "plansv3", "reports", "08-prompt-regression-latest.json");

function classifyIntent(request) {
  const text = String(request || "").toLowerCase();
  if (text.includes("motion blur")) {
    return "enable_motion_blur";
  }
  if (text.includes("dropdown") && text.includes("opacity")) {
    return "link_opacity_to_dropdown";
  }
  if (text.includes("dropdown")) {
    return "create_dropdown_controller";
  }
  if (text.includes("shape")) {
    return "create_shape_layer";
  }
  if (text.includes("text")) {
    return "create_text_layer";
  }
  if (text.includes("comp")) {
    return "create_composition";
  }
  return "unknown";
}

function inferCommandHints(request) {
  const text = String(request || "").toLowerCase();
  if (text.includes("motion blur")) {
    return ["enableMotionBlur", "preflightMutation"];
  }
  if (text.includes("dropdown") && text.includes("opacity")) {
    return ["resolveTargets", "createDropdownController", "linkOpacityToDropdown"];
  }
  if (text.includes("dropdown")) {
    return ["resolveTargets", "createDropdownController"];
  }
  if (text.includes("shape")) {
    return ["resolveTargets", "createShapeLayer"];
  }
  if (text.includes("text")) {
    return ["resolveTargets", "createTextLayer"];
  }
  if (text.includes("comp")) {
    return ["createComposition"];
  }
  return [];
}

const suite = JSON.parse(fs.readFileSync(suitePath, "utf8"));
const results = suite.map((test) => {
  const actualIntent = classifyIntent(test.request);
  const actualHints = inferCommandHints(test.request);
  const missingHints = (test.expectedCommandHints || []).filter((hint) => actualHints.indexOf(hint) === -1);
  return {
    id: test.id,
    category: test.category,
    request: test.request,
    expectedIntent: test.expectedIntent,
    actualIntent,
    intentPass: actualIntent === test.expectedIntent,
    expectedCommandHints: test.expectedCommandHints || [],
    actualCommandHints: actualHints,
    hintPass: missingHints.length === 0,
    missingHints,
    notes: test.notes || null
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  suitePath,
  summary: {
    total: results.length,
    intentPass: results.filter((entry) => entry.intentPass).length,
    hintPass: results.filter((entry) => entry.hintPass).length
  },
  results
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
