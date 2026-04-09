import { z } from "zod";
import type {
  ExecuteBridgeCommandAndWait,
  ExecuteCommandThroughSafety,
  ExecuteCommandThroughSafetyBound,
  FormatToolPayload,
  SafetyRoutingDependencies,
  ToolServer
} from "../toolContracts.js";
import { OrchestrationIntentSchema } from "../toolSchemas.js";
import type { SkillDefinition, SkillScope, SkillStep } from "../../skills.js";
import {
  SkillError,
  createSkillArtifact,
  deleteSkillArtifact,
  interpolateSkillValue,
  listSkillArtifacts,
  resolveSkillArtifact,
  resolveSkillInputs,
  updateSkillArtifact
} from "../../skills.js";

const SupportedSkillIntents = OrchestrationIntentSchema.options;
const SupportedSkillCommands = new Set([
  "createComposition",
  "createTextLayer",
  "createShapeLayer",
  "createSolidLayer",
  "createCamera",
  "setLayerKeyframe",
  "setLayerExpression",
  "getProjectInfo",
  "listCompositions",
  "getLayerInfo",
  "getProjectItems",
  "findProjectItem",
  "setActiveComp",
  "clearLayerSelection",
  "selectLayers",
  "getLayerDetails",
  "getContextPack",
  "resolveTargets",
  "getCapabilityCatalog",
  "enableMotionBlur",
  "sequenceLayerPosition",
  "copyPathsToMasks",
  "setupTypewriterText",
  "createTimerRig",
  "applyBwTint",
  "cleanupKeyframes",
  "setupRetimingMode",
  "createDropdownController",
  "linkOpacityToDropdown",
  "applyEffect",
  "applyEffectTemplate"
]);

const SkillInputDefinitionSchema = z.object({
  name: z.string().describe("Stable skill input identifier."),
  type: z.enum(["string", "number", "boolean", "json"]).describe("Skill input type."),
  description: z.string().optional().describe("Optional description for the skill input."),
  required: z.boolean().optional().describe("Whether the input must be supplied when applying the skill."),
  defaultValue: z.unknown().optional().describe("Optional default value for the skill input.")
});

const SkillTargetingSchema = z.object({
  preferActiveComp: z.boolean().optional().describe("Prefer the active composition when no comp is provided."),
  requireComp: z.boolean().optional().describe("Require a resolved composition target before execution."),
  requireSelection: z.boolean().optional().describe("Require selected layers or properties before execution."),
  notes: z.array(z.string()).optional().describe("Optional targeting notes.")
}).optional();

const SkillAttachmentSchema = z.object({
  path: z.string().describe("Relative attachment path from the skill directory."),
  description: z.string().optional().describe("Optional attachment description.")
});

const SkillToolStepSchema = z.object({
  type: z.literal("tool"),
  label: z.string().describe("Human-readable label for the tool step."),
  command: z.string().describe("Approved bridge command to execute."),
  args: z.record(z.string(), z.unknown()).optional().describe("Structured tool arguments with optional {{inputs.name}} placeholders.")
});

const SkillOrchestrateStepSchema = z.object({
  type: z.literal("orchestrate"),
  label: z.string().describe("Human-readable label for the orchestration step."),
  request: z.string().describe("Natural-language request or stable execution label."),
  explicitIntent: OrchestrationIntentSchema.optional().describe("Optional deterministic orchestration intent."),
  parameters: z.record(z.string(), z.unknown()).optional().describe("Structured orchestration parameters with optional {{inputs.name}} placeholders.")
});

const SkillStepSchema = z.union([SkillToolStepSchema, SkillOrchestrateStepSchema]);
const SkillInputsSchema = z.array(SkillInputDefinitionSchema).optional();
const SkillStepsSchema = z.array(SkillStepSchema).optional();
const SkillAttachmentsSchema = z.array(SkillAttachmentSchema).optional();

type SkillTemplateName = "enable-motion-blur-active" | "selected-bw-tint" | "dropdown-opacity-rig";

type CreateSkillArgs = {
  name?: string;
  description?: string;
  scope: "global" | "project";
  template?: SkillTemplateName;
  inputs?: SkillDefinition["inputs"];
  targeting?: SkillDefinition["targeting"];
  steps?: SkillDefinition["steps"];
  attachments?: SkillDefinition["attachments"];
  body?: string;
  overwrite?: boolean;
};

type ListSkillsArgs = {
  scope?: "all" | "global" | "project";
  includeInvalid?: boolean;
};

type ApplySkillArgs = {
  name: string;
  scope?: "auto" | "global" | "project";
  inputs?: Record<string, unknown>;
};

type UpdateSkillArgs = {
  name: string;
  scope: "global" | "project";
  description?: string;
  inputs?: SkillDefinition["inputs"];
  targeting?: SkillDefinition["targeting"];
  steps?: SkillDefinition["steps"];
  attachments?: SkillDefinition["attachments"];
  body?: string;
};

type DeleteSkillArgs = {
  name: string;
  scope: "global" | "project";
};

function buildSkillTemplate(template: SkillTemplateName, scope: SkillScope): { definition: SkillDefinition; body: string } {
  switch (template) {
    case "enable-motion-blur-active":
      return {
        definition: {
          name: "enable-motion-blur-active",
          description: "Enable motion blur in the active or named composition.",
          scope,
          inputs: [
            { name: "compName", type: "string", description: "Optional composition name." },
            { name: "includeLocked", type: "boolean", description: "Include locked layers when enabling motion blur.", defaultValue: false }
          ],
          targeting: {
            preferActiveComp: true,
            requireComp: false,
            notes: ["Defaults to the active composition when compName is omitted."]
          },
          steps: [
            {
              type: "tool",
              label: "Enable motion blur",
              command: "enableMotionBlur",
              args: {
                scope: "comp",
                compName: "{{inputs.compName}}",
                includeLocked: "{{inputs.includeLocked}}"
              }
            }
          ],
          attachments: []
        },
        body: "# enable-motion-blur-active\n\nReusable recipe for enabling motion blur on the active or named composition."
      };
    case "selected-bw-tint":
      return {
        definition: {
          name: "selected-bw-tint",
          description: "Apply the BW tint wrapper to selected layers in the active or named composition.",
          scope,
          inputs: [
            { name: "compName", type: "string", description: "Optional composition name." },
            { name: "presetName", type: "string", description: "Optional tint preset.", defaultValue: "Neutral" },
            { name: "amount", type: "number", description: "Tint amount from 0 to 100.", defaultValue: 100 }
          ],
          targeting: {
            preferActiveComp: true,
            requireSelection: true,
            notes: ["Uses selected layers unless the target comp is named explicitly."]
          },
          steps: [
            {
              type: "tool",
              label: "Apply BW tint to selected layers",
              command: "applyBwTint",
              args: {
                compName: "{{inputs.compName}}",
                useSelectedLayers: true,
                presetName: "{{inputs.presetName}}",
                amount: "{{inputs.amount}}"
              }
            }
          ],
          attachments: []
        },
        body: "# selected-bw-tint\n\nReusable recipe for tinting the current layer selection through the guarded BW tint wrapper."
      };
    case "dropdown-opacity-rig":
      return {
        definition: {
          name: "dropdown-opacity-rig",
          description: "Create a dropdown controller and link selected layers by opacity.",
          scope,
          inputs: [
            { name: "compName", type: "string", description: "Optional composition name." },
            { name: "controllerName", type: "string", description: "Controller layer name.", defaultValue: "Visibility Control" },
            { name: "dropdownName", type: "string", description: "Dropdown effect name.", defaultValue: "State" },
            { name: "menuItems", type: "json", description: "Dropdown menu items.", defaultValue: ["State 1", "State 2"] },
            { name: "mappingMode", type: "string", description: "Opacity mapping mode.", defaultValue: "exclusive" }
          ],
          targeting: {
            preferActiveComp: true,
            requireSelection: true,
            notes: ["Creates or reuses a dropdown controller before linking selected layers."]
          },
          steps: [
            {
              type: "tool",
              label: "Create dropdown controller",
              command: "createDropdownController",
              args: {
                compName: "{{inputs.compName}}",
                controllerName: "{{inputs.controllerName}}",
                dropdownName: "{{inputs.dropdownName}}",
                menuItems: "{{inputs.menuItems}}",
                reuseIfExists: true
              }
            },
            {
              type: "tool",
              label: "Link selected layers to dropdown opacity",
              command: "linkOpacityToDropdown",
              args: {
                compName: "{{inputs.compName}}",
                controllerName: "{{inputs.controllerName}}",
                dropdownName: "{{inputs.dropdownName}}",
                useSelectedLayers: true,
                mappingMode: "{{inputs.mappingMode}}"
              }
            }
          ],
          attachments: []
        },
        body: "# dropdown-opacity-rig\n\nReusable recipe for creating a dropdown controller and linking selected layers with opacity expressions."
      };
    default:
      throw new SkillError("SKILL_TEMPLATE_UNSUPPORTED", "Requested starter skill template is not supported.", { template });
  }
}

async function executeSkillStep(
  step: SkillStep,
  inputs: Record<string, unknown>,
  deps: {
    executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
    classifyIntent: (request: string, explicitIntent?: string) => any;
    buildOrchestrationPlan: (classified: any, parameters?: Record<string, unknown>) => any;
    executeOrchestrationPlan: (request: string, classified: any, plan: any, deps: {
      executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
      executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
    }) => Promise<any>;
    executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
    safetyRoutingDependencies: SafetyRoutingDependencies;
  }
) {
  const {
    executeCommandThroughSafety,
    classifyIntent,
    buildOrchestrationPlan,
    executeOrchestrationPlan,
    executeBridgeCommandAndWait,
    safetyRoutingDependencies
  } = deps;

  if (step.type === "tool") {
    const resolvedArgs = interpolateSkillValue(step.args || {}, inputs) as Record<string, any>;
    return executeCommandThroughSafety(step.command, resolvedArgs, { timeoutMs: 15000 });
  }

  const resolvedRequest = String(interpolateSkillValue(step.request, inputs) ?? step.request);
  const resolvedParameters = interpolateSkillValue(step.parameters || {}, inputs) as Record<string, any>;
  const classified = classifyIntent(resolvedRequest, step.explicitIntent);
  if (classified.intent === "unknown") {
    return {
      ok: false,
      retries: 0,
      failureClass: "unsupported-orchestration-intent",
      result: {
        status: "error",
        message: "Skill step resolved to an unsupported orchestration intent.",
        request: resolvedRequest,
        explicitIntent: step.explicitIntent || null
      }
    };
  }

  const plan = buildOrchestrationPlan(classified, resolvedParameters);
  if (!plan.steps.length) {
    return {
      ok: false,
      retries: 0,
      failureClass: "empty-orchestration-plan",
      result: {
        status: "error",
        message: "Skill orchestration step produced no executable plan.",
        request: resolvedRequest,
        classified
      }
    };
  }

  const executed = await executeOrchestrationPlan(resolvedRequest, classified, plan, {
    executeBridgeCommandAndWait,
    executeCommandThroughSafety
  });
  return {
    ok: executed.ok,
    retries: executed.retries,
    failureClass: executed.failureClass,
    result: {
      status: executed.ok ? "success" : "error",
      request: resolvedRequest,
      classified,
      assumptions: plan.assumptions,
      finalResult: executed.result,
      timeline: executed.timeline
    }
  };
}

async function applyResolvedSkill(
  skillName: string,
  scope: SkillScope | "auto",
  skillInputs: Record<string, unknown>,
  deps: {
    executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
    classifyIntent: (request: string, explicitIntent?: string) => any;
    buildOrchestrationPlan: (classified: any, parameters?: Record<string, unknown>) => any;
    executeOrchestrationPlan: (request: string, classified: any, plan: any, deps: {
      executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
      executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
    }) => Promise<any>;
    executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
    safetyRoutingDependencies: SafetyRoutingDependencies;
  }
) {
  const artifact = resolveSkillArtifact(process.cwd(), skillName, scope, {
    supportedCommands: SupportedSkillCommands,
    supportedIntents: SupportedSkillIntents
  });

  if (!artifact.validation.valid) {
    throw new SkillError("SKILL_VALIDATION_FAILED", "Skill artifact failed validation and cannot be applied.", {
      errors: artifact.validation.errors,
      warnings: artifact.validation.warnings,
      skillPath: artifact.skillPath
    });
  }

  const resolvedInputs = resolveSkillInputs(artifact.definition, skillInputs);
  const stepResults: Array<Record<string, unknown>> = [];

  for (const [index, step] of artifact.definition.steps.entries()) {
    const executed = await executeSkillStep(step, resolvedInputs, deps);
    stepResults.push({
      index: index + 1,
      label: step.label,
      type: step.type,
      ok: executed.ok,
      retries: executed.retries,
      failureClass: executed.failureClass || null,
      result: executed.result
    });

    if (!executed.ok) {
      return {
        status: "error",
        skill: {
          name: artifact.definition.name,
          scope: artifact.definition.scope,
          path: artifact.skillPath
        },
        inputs: resolvedInputs,
        targeting: artifact.definition.targeting,
        warnings: artifact.validation.warnings,
        stepResults
      };
    }
  }

  return {
    status: "success",
    skill: {
      name: artifact.definition.name,
      scope: artifact.definition.scope,
      path: artifact.skillPath
    },
    inputs: resolvedInputs,
    targeting: artifact.definition.targeting,
    warnings: artifact.validation.warnings,
    stepResults
  };
}

export function registerSkillTools(deps: {
  server: ToolServer;
  formatToolPayload: FormatToolPayload;
  buildStructuredSkillError: (error: unknown, fallbackCode: string, fallbackMessage: string) => Record<string, unknown>;
  executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
  classifyIntent: (request: string, explicitIntent?: string) => any;
  buildOrchestrationPlan: (classified: any, parameters?: Record<string, unknown>) => any;
  executeOrchestrationPlan: (request: string, classified: any, plan: any, deps: {
    executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
    executeCommandThroughSafety: ExecuteCommandThroughSafetyBound;
  }) => Promise<any>;
  executeBridgeCommandAndWait: ExecuteBridgeCommandAndWait;
  safetyRoutingDependencies: SafetyRoutingDependencies;
}) {
  const {
    server,
    formatToolPayload,
    buildStructuredSkillError,
    executeCommandThroughSafety,
    classifyIntent,
    buildOrchestrationPlan,
    executeOrchestrationPlan,
    executeBridgeCommandAndWait,
    safetyRoutingDependencies
  } = deps;

  const executionDeps = {
    executeCommandThroughSafety,
    classifyIntent,
    buildOrchestrationPlan,
    executeOrchestrationPlan,
    executeBridgeCommandAndWait,
    safetyRoutingDependencies
  };

  server.tool(
    "create-skill",
    "Create a reusable recipe skill in the global or project skill store.",
    {
      name: z.string().optional().describe("Skill identifier. Required when template is omitted."),
      description: z.string().optional().describe("Skill description. Required when template is omitted."),
      scope: z.enum(["global", "project"]).describe("Skill storage scope."),
      template: z.enum(["enable-motion-blur-active", "selected-bw-tint", "dropdown-opacity-rig"]).optional().describe("Optional starter template for a production recipe."),
      inputs: SkillInputsSchema.describe("Declared skill inputs."),
      targeting: SkillTargetingSchema.describe("Targeting metadata for the skill."),
      steps: SkillStepsSchema.describe("Executable skill steps."),
      attachments: SkillAttachmentsSchema.describe("Optional attachment metadata."),
      body: z.string().optional().describe("Optional markdown body for SKILL.md."),
      overwrite: z.boolean().optional().describe("Overwrite an existing skill with the same name.")
    },
    async ({ name, description, scope, template, inputs, targeting, steps, attachments, body, overwrite }: CreateSkillArgs) => {
      try {
        const built = template
          ? buildSkillTemplate(template as SkillTemplateName, scope as SkillScope)
          : {
              definition: {
                name: String(name || ""),
                description: String(description || ""),
                scope: scope as SkillScope,
                inputs: inputs || [],
                targeting: targeting || {},
                steps: steps || [],
                attachments: attachments || []
              } as SkillDefinition,
              body: body || ""
            };

        const created = createSkillArtifact({
          projectRoot: process.cwd(),
          definition: built.definition,
          body: body ?? built.body,
          overwrite,
          supportedCommands: SupportedSkillCommands,
          supportedIntents: SupportedSkillIntents
        });

        return formatToolPayload({
          status: "success",
          skill: {
            name: created.definition.name,
            scope: created.definition.scope,
            path: created.skillPath
          },
          warnings: created.validation.warnings
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSkillError(error, "CREATE_SKILL_FAILED", "Failed to create skill."),
          true
        );
      }
    }
  );

  server.tool(
    "list-skills",
    "List reusable recipe skills from the project and/or global skill stores.",
    {
      scope: z.enum(["all", "global", "project"]).optional().describe("Optional scope filter. Defaults to all scopes."),
      includeInvalid: z.boolean().optional().describe("When false, exclude invalid skill artifacts from the response.")
    },
    async ({ scope = "all", includeInvalid = true }: ListSkillsArgs) => {
      try {
        const entries = listSkillArtifacts(process.cwd(), scope as SkillScope | "all", {
          supportedCommands: SupportedSkillCommands,
          supportedIntents: SupportedSkillIntents
        });

        return formatToolPayload({
          status: "success",
          count: includeInvalid ? entries.length : entries.filter((entry) => entry.valid).length,
          skills: includeInvalid ? entries : entries.filter((entry) => entry.valid)
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSkillError(error, "LIST_SKILLS_FAILED", "Failed to list skills."),
          true
        );
      }
    }
  );

  server.tool(
    "apply-skill",
    "Validate and execute a reusable recipe skill through the normal routing and safety systems.",
    {
      name: z.string().describe("Skill identifier."),
      scope: z.enum(["auto", "global", "project"]).optional().describe("Skill lookup scope. Defaults to project-first auto resolution."),
      inputs: z.record(z.string(), z.unknown()).optional().describe("Input values supplied to the skill.")
    },
    async ({ name, scope = "auto", inputs = {} }: ApplySkillArgs) => {
      try {
        const payload = await applyResolvedSkill(name, scope as SkillScope | "auto", inputs, executionDeps);
        return formatToolPayload(payload, payload.status !== "success");
      } catch (error) {
        return formatToolPayload(
          buildStructuredSkillError(error, "APPLY_SKILL_FAILED", "Failed to apply skill."),
          true
        );
      }
    }
  );

  server.tool(
    "update-skill",
    "Update an existing reusable recipe skill in place.",
    {
      name: z.string().describe("Skill identifier."),
      scope: z.enum(["global", "project"]).describe("Skill storage scope."),
      description: z.string().optional().describe("Updated skill description."),
      inputs: SkillInputsSchema.describe("Replacement skill inputs."),
      targeting: SkillTargetingSchema.describe("Replacement targeting metadata."),
      steps: SkillStepsSchema.describe("Replacement step list."),
      attachments: SkillAttachmentsSchema.describe("Replacement attachment list."),
      body: z.string().optional().describe("Replacement markdown body for SKILL.md.")
    },
    async ({ name, scope, description, inputs, targeting, steps, attachments, body }: UpdateSkillArgs) => {
      try {
        const updated = updateSkillArtifact({
          projectRoot: process.cwd(),
          name,
          scope: scope as SkillScope,
          definitionPatch: {
            description,
            inputs,
            targeting,
            steps,
            attachments
          },
          body,
          supportedCommands: SupportedSkillCommands,
          supportedIntents: SupportedSkillIntents
        });

        return formatToolPayload({
          status: "success",
          skill: {
            name: updated.definition.name,
            scope: updated.definition.scope,
            path: updated.skillPath
          },
          warnings: updated.validation.warnings
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSkillError(error, "UPDATE_SKILL_FAILED", "Failed to update skill."),
          true
        );
      }
    }
  );

  server.tool(
    "delete-skill",
    "Delete a reusable recipe skill from the selected skill store.",
    {
      name: z.string().describe("Skill identifier."),
      scope: z.enum(["global", "project"]).describe("Skill storage scope.")
    },
    async ({ name, scope }: DeleteSkillArgs) => {
      try {
        const deleted = deleteSkillArtifact(process.cwd(), name, scope as SkillScope);
        return formatToolPayload({
          status: "success",
          name,
          scope,
          deleted
        });
      } catch (error) {
        return formatToolPayload(
          buildStructuredSkillError(error, "DELETE_SKILL_FAILED", "Failed to delete skill."),
          true
        );
      }
    }
  );
}
