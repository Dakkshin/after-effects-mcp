import fs from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

const repoRoot = process.cwd();
const promptReportPath = path.join(repoRoot, "docs", "plansv3", "reports", "08-prompt-regression-latest.json");
const outputPath = path.join(repoRoot, "docs", "plansv3", "reports", "09-release-readiness-latest.json");

const legacyRequiredTools = [
  "run-script",
  "get-results",
  "get-help",
  "create-composition",
  "getProjectInfo",
  "listCompositions",
  "getLayerInfo",
  "setLayerProperties",
  "setLayerKeyframe",
  "setLayerExpression",
  "createCamera",
  "batchSetLayerProperties",
  "duplicateLayer",
  "deleteLayer",
  "setLayerMask",
  "mcp_aftereffects_create_composition"
];

const v3RequiredTools = [
  "get-context-pack",
  "resolve-targets",
  "get-capability-catalog",
  "classify-intent",
  "build-execution-plan",
  "orchestrate-request",
  "inspect-mutation-safety",
  "create-checkpoint",
  "list-checkpoints",
  "restore-checkpoint",
  "create-skill",
  "list-skills",
  "apply-skill",
  "update-skill",
  "delete-skill",
  "get-operation-log"
];

function countPresent(required, actual) {
  return {
    required,
    present: required.filter((name) => actual.includes(name)),
    missing: required.filter((name) => !actual.includes(name))
  };
}

async function listServerTools() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(repoRoot, "build", "index.js")],
    cwd: repoRoot,
    stderr: "pipe"
  });

  const client = new Client({ name: "release-readiness", version: "1.0.0" });
  await client.connect(transport);
  try {
    const response = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
    return response.tools.map((tool) => tool.name);
  } finally {
    await transport.close();
  }
}

const toolNames = await listServerTools();
const legacyMatrix = countPresent(legacyRequiredTools, toolNames);
const v3Matrix = countPresent(v3RequiredTools, toolNames);
const promptReport = fs.existsSync(promptReportPath)
  ? JSON.parse(fs.readFileSync(promptReportPath, "utf8"))
  : null;

const report = {
  generatedAt: new Date().toISOString(),
  toolInventorySize: toolNames.length,
  legacyCompatibility: {
    requiredCount: legacyMatrix.required.length,
    presentCount: legacyMatrix.present.length,
    missing: legacyMatrix.missing
  },
  v3Coverage: {
    requiredCount: v3Matrix.required.length,
    presentCount: v3Matrix.present.length,
    missing: v3Matrix.missing
  },
  benchmarkSnapshot: promptReport
    ? {
        sampleSize: promptReport.summary.total,
        intentPass: promptReport.summary.intentPass,
        hintPass: promptReport.summary.hintPass
      }
    : null,
  releaseDecision: legacyMatrix.missing.length === 0 && v3Matrix.missing.length === 0
    ? "ready-with-documented-risks"
    : "not-ready-missing-tool-surface",
  deferredRisks: [
    "createNullObject is still deferred as a first-class MCP tool",
    "live AE validation still depends on manual host smoke tests",
    "prompt benchmark sample size is still small and should expand over time"
  ]
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
