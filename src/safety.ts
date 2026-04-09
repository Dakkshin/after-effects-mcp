import * as fs from "fs";
import * as path from "path";
const fsp = fs.promises;

export type RiskClass = "low" | "medium" | "high" | "blocked";

export type MutationSafetyDefinition = {
  command: string;
  isMutation: boolean;
  riskClass: RiskClass;
  reason: string;
};

export type CheckpointEntry = {
  id: string;
  label: string;
  createdAt: string;
  revision: number | null;
  projectPath: string;
  checkpointPath: string;
  fileName: string;
  sizeBytes: number;
};

export type CheckpointManifest = {
  version: 1;
  projectPath: string;
  manifestPath: string;
  checkpointDirectory: string;
  updatedAt: string;
  checkpoints: CheckpointEntry[];
};

export class SafetyError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SafetyError";
    this.code = code;
    this.details = details;
  }
}

const RISK_DEFINITIONS: Record<string, Omit<MutationSafetyDefinition, "command">> = {
  createComposition: { isMutation: true, riskClass: "low", reason: "Creates a new composition without altering existing project state." },
  createTextLayer: { isMutation: true, riskClass: "low", reason: "Adds a new text layer and is generally additive." },
  createShapeLayer: { isMutation: true, riskClass: "low", reason: "Adds a new shape layer and is generally additive." },
  createSolidLayer: { isMutation: true, riskClass: "low", reason: "Adds a new solid or adjustment layer and is generally additive." },
  createCamera: { isMutation: true, riskClass: "low", reason: "Adds a new camera layer and is generally additive." },
  createDropdownController: { isMutation: true, riskClass: "low", reason: "Creates or reuses a controller layer and is expected to be idempotent." },
  createBackgroundSolid: { isMutation: true, riskClass: "low", reason: "Creates a full-frame background solid and is generally additive." },
  setLayerKeyframe: { isMutation: true, riskClass: "medium", reason: "Mutates animation state and should verify the target property first." },
  animateTextEntry: { isMutation: true, riskClass: "medium", reason: "Adds transform and opacity keyframes to a text layer and should verify the target layer first." },
  setLayerExpression: { isMutation: true, riskClass: "medium", reason: "Mutates property expressions and may disrupt existing dependencies." },
  applyEffect: { isMutation: true, riskClass: "medium", reason: "Applies an effect stack mutation that should verify the target layer first." },
  applyEffectTemplate: { isMutation: true, riskClass: "medium", reason: "Applies multiple effect mutations that should verify the target layer first." },
  enableMotionBlur: { isMutation: true, riskClass: "medium", reason: "Changes multiple layer switches and should inspect the target composition first." },
  sequenceLayerPosition: { isMutation: true, riskClass: "medium", reason: "Moves multiple layers and should verify the target layers first." },
  copyPathsToMasks: { isMutation: true, riskClass: "medium", reason: "Creates mask mutations from current selections and should verify selection state first." },
  setupTypewriterText: { isMutation: true, riskClass: "medium", reason: "Creates text animation state and should verify the target text layer first." },
  createTimerRig: { isMutation: true, riskClass: "medium", reason: "Adds rigging expressions and controllers and should verify target context first." },
  applyBwTint: { isMutation: true, riskClass: "medium", reason: "Adds an effect mutation and should verify the target layer first." },
  cleanupKeyframes: { isMutation: true, riskClass: "medium", reason: "Removes keyframes and should inspect selected properties before applying changes." },
  setupRetimingMode: { isMutation: true, riskClass: "medium", reason: "Adds dropdown and expression rigging and should verify selected properties first." },
  linkOpacityToDropdown: { isMutation: true, riskClass: "medium", reason: "Writes opacity expressions across layers and should verify targets first." },
  setLayerProperties: { isMutation: true, riskClass: "high", reason: "Directly rewrites transform, timing, text, or blend properties on an existing layer." },
  batchSetLayerProperties: { isMutation: true, riskClass: "high", reason: "Directly rewrites properties across multiple layers in one operation." },
  setCompositionProperties: { isMutation: true, riskClass: "high", reason: "Rewrites composition-level timing or dimension settings." },
  duplicateLayer: { isMutation: true, riskClass: "high", reason: "Duplicates existing content and can compound project state unexpectedly." },
  deleteLayer: { isMutation: true, riskClass: "high", reason: "Destructively removes an existing layer." },
  setLayerMask: { isMutation: true, riskClass: "high", reason: "Adds or rewrites mask geometry on an existing layer." },
  prepareProjectCheckpoint: { isMutation: false, riskClass: "low", reason: "Administrative save operation for checkpoint creation." },
  preflightMutation: { isMutation: false, riskClass: "low", reason: "Read-only mutation inspection." },
  restoreCheckpoint: { isMutation: false, riskClass: "blocked", reason: "Project restore is a privileged administrative flow." }
};

export function classifyMutationRisk(command: string): MutationSafetyDefinition {
  const normalized = String(command || "");
  const found = RISK_DEFINITIONS[normalized];
  if (found) {
    return { command: normalized, ...found };
  }

  return {
    command: normalized,
    isMutation: false,
    riskClass: "low",
    reason: "Command is not classified as a project mutation."
  };
}

export function buildCheckpointStoragePaths(projectPath: string) {
  const normalizedProjectPath = path.resolve(projectPath);
  const projectDir = path.dirname(normalizedProjectPath);
  const projectBaseName = path.basename(normalizedProjectPath, path.extname(normalizedProjectPath));
  const manifestPath = path.join(projectDir, `${projectBaseName}.ae-mcp-checkpoints.json`);
  const checkpointDirectory = path.join(projectDir, "_ae-mcp-checkpoints", projectBaseName);
  return {
    projectPath: normalizedProjectPath,
    projectDir,
    projectBaseName,
    manifestPath,
    checkpointDirectory,
    backupManifestPath: `${manifestPath}.bak`
  };
}

function defaultManifest(projectPath: string): CheckpointManifest {
  const paths = buildCheckpointStoragePaths(projectPath);
  return {
    version: 1,
    projectPath: paths.projectPath,
    manifestPath: paths.manifestPath,
    checkpointDirectory: paths.checkpointDirectory,
    updatedAt: new Date().toISOString(),
    checkpoints: []
  };
}

async function ensureCheckpointDirectory(projectPath: string): Promise<string> {
  const paths = buildCheckpointStoragePaths(projectPath);
  await fsp.mkdir(paths.checkpointDirectory, { recursive: true });
  return paths.checkpointDirectory;
}

async function readManifestFile(manifestPath: string): Promise<CheckpointManifest> {
  const content = await fsp.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(content) as CheckpointManifest;
  if (!parsed || !Array.isArray(parsed.checkpoints)) {
    throw new Error("Manifest format is invalid.");
  }
  return parsed;
}

export async function loadCheckpointManifest(projectPath: string): Promise<{ manifest: CheckpointManifest; recoveredFromBackup: boolean }> {
  const paths = buildCheckpointStoragePaths(projectPath);

  if (!fs.existsSync(paths.manifestPath)) {
    return { manifest: defaultManifest(projectPath), recoveredFromBackup: false };
  }

  try {
    const manifest = await readManifestFile(paths.manifestPath);
    return { manifest, recoveredFromBackup: false };
  } catch (manifestError) {
    if (fs.existsSync(paths.backupManifestPath)) {
      try {
        const manifest = await readManifestFile(paths.backupManifestPath);
        return { manifest, recoveredFromBackup: true };
      } catch (backupError) {
        throw new SafetyError("CHECKPOINT_MANIFEST_CORRUPTED", "Checkpoint manifest and backup are corrupted.", {
          manifestPath: paths.manifestPath,
          backupManifestPath: paths.backupManifestPath,
          manifestError: String(manifestError),
          backupError: String(backupError)
        });
      }
    }

    throw new SafetyError("CHECKPOINT_MANIFEST_CORRUPTED", "Checkpoint manifest is corrupted and no backup recovery is available.", {
      manifestPath: paths.manifestPath,
      manifestError: String(manifestError)
    });
  }
}

export async function writeCheckpointManifest(projectPath: string, manifest: CheckpointManifest): Promise<CheckpointManifest> {
  const paths = buildCheckpointStoragePaths(projectPath);
  await fsp.mkdir(path.dirname(paths.manifestPath), { recursive: true });
  manifest.manifestPath = paths.manifestPath;
  manifest.projectPath = paths.projectPath;
  manifest.checkpointDirectory = paths.checkpointDirectory;
  manifest.updatedAt = new Date().toISOString();

  if (fs.existsSync(paths.manifestPath)) {
    await fsp.copyFile(paths.manifestPath, paths.backupManifestPath);
  }

  const tempPath = `${paths.manifestPath}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(manifest, null, 2), "utf8");
  if (fs.existsSync(paths.manifestPath)) {
    await fsp.unlink(paths.manifestPath);
  }
  await fsp.rename(tempPath, paths.manifestPath);

  return manifest;
}

function sanitizeLabel(label?: string): string {
  const trimmed = String(label || "checkpoint").trim();
  const collapsed = trimmed.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return collapsed || "checkpoint";
}

export async function createCheckpointEntry(input: {
  projectPath: string;
  label?: string;
  revision?: number | null;
}): Promise<{ manifest: CheckpointManifest; checkpoint: CheckpointEntry; recoveredFromBackup: boolean }> {
  const resolvedProjectPath = path.resolve(input.projectPath);
  if (!fs.existsSync(resolvedProjectPath)) {
    throw new SafetyError("PROJECT_FILE_MISSING", "The saved project file does not exist on disk.", {
      projectPath: resolvedProjectPath
    });
  }

  const { manifest, recoveredFromBackup } = await loadCheckpointManifest(resolvedProjectPath);
  const checkpointDirectory = await ensureCheckpointDirectory(resolvedProjectPath);
  const now = new Date();
  const checkpointId = now.toISOString().replace(/[:.]/g, "-");
  const label = sanitizeLabel(input.label);
  const extension = path.extname(resolvedProjectPath) || ".aep";
  const fileName = `${checkpointId}-${label}${extension}`;
  const checkpointPath = path.join(checkpointDirectory, fileName);

  await fsp.copyFile(resolvedProjectPath, checkpointPath);
  const stats = await fsp.stat(checkpointPath);

  const checkpoint: CheckpointEntry = {
    id: checkpointId,
    label,
    createdAt: now.toISOString(),
    revision: input.revision ?? null,
    projectPath: resolvedProjectPath,
    checkpointPath,
    fileName,
    sizeBytes: stats.size
  };

  manifest.checkpoints = [checkpoint, ...manifest.checkpoints].slice(0, 100);
  await writeCheckpointManifest(resolvedProjectPath, manifest);

  return { manifest, checkpoint, recoveredFromBackup };
}

export async function listCheckpointEntries(projectPath: string): Promise<{ manifest: CheckpointManifest; recoveredFromBackup: boolean }> {
  return await loadCheckpointManifest(projectPath);
}

export async function resolveCheckpointEntry(projectPath: string, checkpointId?: string): Promise<{
  manifest: CheckpointManifest;
  checkpoint: CheckpointEntry;
  recoveredFromBackup: boolean;
}> {
  const { manifest, recoveredFromBackup } = await loadCheckpointManifest(projectPath);
  if (!manifest.checkpoints.length) {
    throw new SafetyError("CHECKPOINT_MANIFEST_EMPTY", "No checkpoints are recorded for this project.", {
      manifestPath: manifest.manifestPath
    });
  }

  const checkpoint = checkpointId
    ? manifest.checkpoints.find((entry) => entry.id === checkpointId)
    : manifest.checkpoints[0];

  if (!checkpoint) {
    throw new SafetyError("CHECKPOINT_NOT_FOUND", "Requested checkpoint id was not found in the manifest.", {
      checkpointId,
      manifestPath: manifest.manifestPath
    });
  }

  if (!fs.existsSync(checkpoint.checkpointPath)) {
    throw new SafetyError("CHECKPOINT_FILE_MISSING", "Checkpoint file is missing on disk.", {
      checkpointId: checkpoint.id,
      checkpointPath: checkpoint.checkpointPath
    });
  }

  return { manifest, checkpoint, recoveredFromBackup };
}

export function buildBranchBeforeRestorePath(projectPath: string, checkpointId: string): string {
  const resolvedProjectPath = path.resolve(projectPath);
  const directory = path.dirname(resolvedProjectPath);
  const baseName = path.basename(resolvedProjectPath, path.extname(resolvedProjectPath));
  const extension = path.extname(resolvedProjectPath) || ".aep";
  const branchDirectory = path.join(directory, "_ae-mcp-checkpoints", baseName, "restore-branches");
  fs.mkdirSync(branchDirectory, { recursive: true });
  return path.join(branchDirectory, `${checkpointId}-pre-restore${extension}`);
}
