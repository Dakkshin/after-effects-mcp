import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type SkillScope = "global" | "project";
export type SkillInputType = "string" | "number" | "boolean" | "json";
export type SkillStepType = "tool" | "orchestrate";

export type SkillInputDefinition = {
  name: string;
  type: SkillInputType;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
};

export type SkillAttachment = {
  path: string;
  description?: string;
};

export type SkillTargeting = {
  preferActiveComp?: boolean;
  requireComp?: boolean;
  requireSelection?: boolean;
  notes?: string[];
};

export type SkillToolStep = {
  type: "tool";
  label: string;
  command: string;
  args?: Record<string, unknown>;
};

export type SkillOrchestrateStep = {
  type: "orchestrate";
  label: string;
  request: string;
  explicitIntent?: string;
  parameters?: Record<string, unknown>;
};

export type SkillStep = SkillToolStep | SkillOrchestrateStep;

export type SkillDefinition = {
  name: string;
  description: string;
  scope: SkillScope;
  inputs: SkillInputDefinition[];
  targeting: SkillTargeting;
  steps: SkillStep[];
  attachments: SkillAttachment[];
};

export type SkillArtifact = {
  definition: SkillDefinition;
  skillPath: string;
  skillDirectory: string;
  body: string;
};

export type SkillValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type SkillListEntry = {
  name: string;
  scope: SkillScope;
  description: string | null;
  skillPath: string;
  skillDirectory: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  stepCount: number;
  attachmentCount: number;
};

export class SkillError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SkillError";
    this.code = code;
    this.details = details;
  }
}

const SKILL_FILE_NAME = "SKILL.md";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const INPUT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const EXACT_INPUT_PLACEHOLDER = /^\{\{\s*inputs\.([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}$/;
const ANY_INPUT_PLACEHOLDER = /\{\{\s*inputs\.([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export function getSkillScopeDirectory(projectRoot: string, scope: SkillScope): string {
  if (scope === "global") {
    return path.join(os.homedir(), ".ae-mcp", "skills");
  }
  return path.join(projectRoot, ".ae-mcp", "skills");
}

function ensureSkillScopeDirectory(projectRoot: string, scope: SkillScope): string {
  const directory = getSkillScopeDirectory(projectRoot, scope);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function resolveSkillDirectory(projectRoot: string, scope: SkillScope, name: string): string {
  const root = ensureSkillScopeDirectory(projectRoot, scope);
  const skillDirectory = path.resolve(root, name);
  const normalizedRoot = path.resolve(root);
  if (!skillDirectory.startsWith(normalizedRoot + path.sep) && skillDirectory !== normalizedRoot) {
    throw new SkillError("SKILL_PATH_INVALID", "Resolved skill path escapes the allowed skill store.", {
      scope,
      name,
      root
    });
  }
  return skillDirectory;
}

function readMarkdown(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function extractFrontmatter(markdown: string): { frontmatter: string; body: string } {
  if (!markdown.startsWith("---")) {
    throw new SkillError("SKILL_FRONTMATTER_MISSING", "Skill file must start with YAML frontmatter.");
  }

  const parts = markdown.split(/^---\s*$/m);
  if (parts.length < 3) {
    throw new SkillError("SKILL_FRONTMATTER_INVALID", "Skill frontmatter could not be parsed from SKILL.md.");
  }

  const frontmatter = parts[1].trim();
  const body = parts.slice(2).join("---\n").trim();
  return { frontmatter, body };
}

function parseFrontmatter(frontmatter: string): unknown {
  try {
    return JSON.parse(frontmatter);
  } catch (error) {
    throw new SkillError("SKILL_FRONTMATTER_INVALID", "Skill frontmatter must be valid JSON-compatible YAML.", {
      error: String(error)
    });
  }
}

function renderFrontmatter(definition: SkillDefinition): string {
  return JSON.stringify(definition, null, 2);
}

export function renderSkillMarkdown(definition: SkillDefinition, body?: string): string {
  const skillBody = String(body || "").trim() || `# ${definition.name}\n\n${definition.description}`;
  return `---\n${renderFrontmatter(definition)}\n---\n\n${skillBody}\n`;
}

function collectInputPlaceholders(value: unknown, names = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(ANY_INPUT_PLACEHOLDER)) {
      names.add(match[1]);
    }
    return names;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectInputPlaceholders(entry, names);
    }
    return names;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectInputPlaceholders(entry, names);
    }
  }

  return names;
}

export function validateSkillDefinition(
  definition: SkillDefinition,
  skillDirectory?: string,
  options: { supportedCommands?: Iterable<string>; supportedIntents?: Iterable<string> } = {}
): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!SKILL_NAME_PATTERN.test(definition.name || "")) {
    errors.push("Skill name must use lowercase letters, numbers, dashes, or underscores.");
  }

  if (definition.scope !== "global" && definition.scope !== "project") {
    errors.push("Skill scope must be either 'global' or 'project'.");
  }

  if (!definition.description || !String(definition.description).trim()) {
    errors.push("Skill description is required.");
  }

  if (!Array.isArray(definition.inputs)) {
    errors.push("Skill inputs must be an array.");
  }

  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push("Skill steps must contain at least one step.");
  }

  if (!Array.isArray(definition.attachments)) {
    errors.push("Skill attachments must be an array.");
  }

  const inputNames = new Set<string>();
  for (const input of definition.inputs || []) {
    if (!INPUT_NAME_PATTERN.test(input.name || "")) {
      errors.push(`Input '${input.name}' must use letters, numbers, and underscores only.`);
      continue;
    }
    if (inputNames.has(input.name)) {
      errors.push(`Input '${input.name}' is declared more than once.`);
      continue;
    }
    inputNames.add(input.name);
    if (!["string", "number", "boolean", "json"].includes(input.type)) {
      errors.push(`Input '${input.name}' has unsupported type '${String(input.type)}'.`);
    }
  }

  const supportedCommands = new Set(Array.from(options.supportedCommands || []));
  const supportedIntents = new Set(Array.from(options.supportedIntents || []));

  for (const [index, step] of (definition.steps || []).entries()) {
    if (!step || typeof step !== "object") {
      errors.push(`Step ${index + 1} must be an object.`);
      continue;
    }

    if (step.type !== "tool" && step.type !== "orchestrate") {
      errors.push(`Step ${index + 1} uses unsupported type '${String((step as any).type)}'.`);
      continue;
    }

    if (!step.label || !String(step.label).trim()) {
      errors.push(`Step ${index + 1} must define a label.`);
    }

    if (step.type === "tool") {
      if (!step.command || !String(step.command).trim()) {
        errors.push(`Step ${index + 1} must define a tool command.`);
      } else if (supportedCommands.size > 0 && !supportedCommands.has(step.command)) {
        errors.push(`Step ${index + 1} references unsupported tool command '${step.command}'.`);
      }
    }

    if (step.type === "orchestrate") {
      if (!step.request || !String(step.request).trim()) {
        errors.push(`Step ${index + 1} must define an orchestration request.`);
      }
      if (step.explicitIntent && supportedIntents.size > 0 && !supportedIntents.has(step.explicitIntent)) {
        errors.push(`Step ${index + 1} references unsupported orchestration intent '${step.explicitIntent}'.`);
      }
    }
  }

  const usedInputs = collectInputPlaceholders(definition.steps);

  for (const usedInput of usedInputs) {
    if (!inputNames.has(usedInput)) {
      errors.push(`Placeholder input '${usedInput}' is used in steps but not declared in inputs.`);
    }
  }

  for (const input of definition.inputs || []) {
    if (!usedInputs.has(input.name)) {
      warnings.push(`Input '${input.name}' is declared but not referenced by any step placeholder.`);
    }
  }

  if (skillDirectory) {
    for (const attachment of definition.attachments || []) {
      const attachmentPath = path.resolve(skillDirectory, attachment.path);
      if (!fs.existsSync(attachmentPath)) {
        errors.push(`Attachment '${attachment.path}' does not exist.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function loadSkillArtifactFromPath(
  skillPath: string,
  options: { supportedCommands?: Iterable<string>; supportedIntents?: Iterable<string> } = {}
): SkillArtifact & { validation: SkillValidationResult } {
  const markdown = readMarkdown(skillPath);
  const { frontmatter, body } = extractFrontmatter(markdown);
  const parsed = parseFrontmatter(frontmatter) as SkillDefinition;
  const skillDirectory = path.dirname(skillPath);
  const validation = validateSkillDefinition(parsed, skillDirectory, options);

  return {
    definition: parsed,
    skillPath,
    skillDirectory,
    body,
    validation
  };
}

function buildListEntry(
  scope: SkillScope,
  skillPath: string,
  options: { supportedCommands?: Iterable<string>; supportedIntents?: Iterable<string> } = {}
): SkillListEntry {
  try {
    const artifact = loadSkillArtifactFromPath(skillPath, options);
    return {
      name: artifact.definition.name,
      scope,
      description: artifact.definition.description || null,
      skillPath,
      skillDirectory: artifact.skillDirectory,
      valid: artifact.validation.valid,
      errors: artifact.validation.errors,
      warnings: artifact.validation.warnings,
      stepCount: artifact.definition.steps.length,
      attachmentCount: artifact.definition.attachments.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: path.basename(path.dirname(skillPath)),
      scope,
      description: null,
      skillPath,
      skillDirectory: path.dirname(skillPath),
      valid: false,
      errors: [message],
      warnings: [],
      stepCount: 0,
      attachmentCount: 0
    };
  }
}

function listScopeSkillPaths(projectRoot: string, scope: SkillScope): string[] {
  const root = getSkillScopeDirectory(projectRoot, scope);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, SKILL_FILE_NAME))
    .filter((filePath) => fs.existsSync(filePath));
}

export function listSkillArtifacts(
  projectRoot: string,
  scope: SkillScope | "all" = "all",
  options: { supportedCommands?: Iterable<string>; supportedIntents?: Iterable<string> } = {}
): SkillListEntry[] {
  const scopes: SkillScope[] = scope === "all" ? ["project", "global"] : [scope];
  return scopes
    .flatMap((currentScope) =>
      listScopeSkillPaths(projectRoot, currentScope).map((skillPath) => buildListEntry(currentScope, skillPath, options))
    )
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
}

export function createSkillArtifact(input: {
  projectRoot: string;
  definition: SkillDefinition;
  body?: string;
  overwrite?: boolean;
  supportedCommands?: Iterable<string>;
  supportedIntents?: Iterable<string>;
}): SkillArtifact & { validation: SkillValidationResult } {
  const skillDirectory = resolveSkillDirectory(input.projectRoot, input.definition.scope, input.definition.name);
  const skillPath = path.join(skillDirectory, SKILL_FILE_NAME);

  if (fs.existsSync(skillPath) && !input.overwrite) {
    throw new SkillError("SKILL_ALREADY_EXISTS", "A skill with that name already exists in the selected scope.", {
      skillPath
    });
  }

  const validation = validateSkillDefinition(input.definition, skillDirectory, {
    supportedCommands: input.supportedCommands,
    supportedIntents: input.supportedIntents
  });
  if (!validation.valid) {
    throw new SkillError("SKILL_VALIDATION_FAILED", "Skill definition failed validation.", {
      errors: validation.errors,
      warnings: validation.warnings
    });
  }

  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.writeFileSync(skillPath, renderSkillMarkdown(input.definition, input.body), "utf8");

  return {
    definition: input.definition,
    skillPath,
    skillDirectory,
    body: String(input.body || "").trim(),
    validation
  };
}

export function resolveSkillArtifact(
  projectRoot: string,
  name: string,
  scope: SkillScope | "auto" = "auto",
  options: { supportedCommands?: Iterable<string>; supportedIntents?: Iterable<string> } = {}
): SkillArtifact & { validation: SkillValidationResult } {
  const scopes: SkillScope[] = scope === "auto" ? ["project", "global"] : [scope];

  for (const currentScope of scopes) {
    const skillPath = path.join(resolveSkillDirectory(projectRoot, currentScope, name), SKILL_FILE_NAME);
    if (fs.existsSync(skillPath)) {
      return loadSkillArtifactFromPath(skillPath, options);
    }
  }

  throw new SkillError("SKILL_NOT_FOUND", "Requested skill could not be found.", {
    name,
    scope
  });
}

export function updateSkillArtifact(input: {
  projectRoot: string;
  name: string;
  scope: SkillScope;
  definitionPatch: Partial<SkillDefinition>;
  body?: string;
  supportedCommands?: Iterable<string>;
  supportedIntents?: Iterable<string>;
}): SkillArtifact & { validation: SkillValidationResult } {
  const existing = resolveSkillArtifact(input.projectRoot, input.name, input.scope, {
    supportedCommands: input.supportedCommands,
    supportedIntents: input.supportedIntents
  });

  const scalarPatch = Object.fromEntries(
    Object.entries(input.definitionPatch).filter(([, value]) => value !== undefined)
  );

  const nextDefinition: SkillDefinition = {
    ...existing.definition,
    ...scalarPatch,
    inputs: input.definitionPatch.inputs ?? existing.definition.inputs,
    targeting: input.definitionPatch.targeting ?? existing.definition.targeting,
    steps: input.definitionPatch.steps ?? existing.definition.steps,
    attachments: input.definitionPatch.attachments ?? existing.definition.attachments
  };

  const nextBody = input.body !== undefined ? input.body : existing.body;
  const validation = validateSkillDefinition(nextDefinition, existing.skillDirectory, {
    supportedCommands: input.supportedCommands,
    supportedIntents: input.supportedIntents
  });
  if (!validation.valid) {
    throw new SkillError("SKILL_VALIDATION_FAILED", "Updated skill definition failed validation.", {
      errors: validation.errors,
      warnings: validation.warnings
    });
  }

  fs.writeFileSync(existing.skillPath, renderSkillMarkdown(nextDefinition, nextBody), "utf8");
  return {
    definition: nextDefinition,
    skillPath: existing.skillPath,
    skillDirectory: existing.skillDirectory,
    body: nextBody,
    validation
  };
}

export function deleteSkillArtifact(projectRoot: string, name: string, scope: SkillScope): { skillDirectory: string; skillPath: string } {
  const skillDirectory = resolveSkillDirectory(projectRoot, scope, name);
  const skillPath = path.join(skillDirectory, SKILL_FILE_NAME);
  if (!fs.existsSync(skillPath)) {
    throw new SkillError("SKILL_NOT_FOUND", "Requested skill could not be found for deletion.", {
      name,
      scope
    });
  }

  fs.rmSync(skillDirectory, { recursive: true, force: true });
  return { skillDirectory, skillPath };
}

function interpolateString(template: string, inputs: Record<string, unknown>): unknown {
  const exactMatch = template.match(EXACT_INPUT_PLACEHOLDER);
  if (exactMatch) {
    return inputs[exactMatch[1]];
  }

  return template.replace(ANY_INPUT_PLACEHOLDER, (_, inputName) => {
    const resolved = inputs[inputName];
    if (resolved === undefined || resolved === null) {
      return "";
    }
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

export function interpolateSkillValue(value: unknown, inputs: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return interpolateString(value, inputs);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => interpolateSkillValue(entry, inputs))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const interpolated = interpolateSkillValue(entry, inputs);
      if (interpolated !== undefined) {
        result[key] = interpolated;
      }
    }
    return result;
  }

  return value;
}

export function resolveSkillInputs(definition: SkillDefinition, providedInputs: Record<string, unknown> = {}): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const input of definition.inputs) {
    const providedValue = providedInputs[input.name];
    const value = providedValue !== undefined ? providedValue : input.defaultValue;
    if (value === undefined && input.required) {
      throw new SkillError("SKILL_INPUT_REQUIRED", `Skill input '${input.name}' is required.`, {
        input: input.name
      });
    }
    if (value !== undefined) {
      resolved[input.name] = value;
    }
  }

  return resolved;
}
