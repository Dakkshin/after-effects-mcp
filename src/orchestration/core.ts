import { findWrapperCandidates } from "./wrapperRegistry.js";

export type OrchestrationDomain = "create" | "animate" | "rig" | "cleanup" | "effect" | "render" | "unknown";
export type OrchestrationIntent =
  | "create_composition"
  | "create_text_layer"
  | "create_shape_layer"
  | "animate_text_entry"
  | "enable_motion_blur"
  | "sequence_layer_position"
  | "setup_typewriter_text"
  | "create_timer_rig"
  | "apply_bw_tint"
  | "cleanup_keyframes"
  | "setup_retiming_mode"
  | "copy_paths_to_masks"
  | "create_background_solid"
  | "create_dropdown_controller"
  | "link_opacity_to_dropdown"
  | "render_to_media_encoder"
  | "unknown";

export type OrchestrationStep = {
  phase: "preflight" | "execute" | "verify";
  command: string;
  args: Record<string, any>;
  summary: string;
  transientTimeoutMs?: number;
};

export type OrchestrationTimelineEntry = {
  phase: string;
  status: "started" | "success" | "error" | "retry";
  summary: string;
  command?: string;
  attempt?: number;
  detail?: string;
};

export type ExecutionRoute = {
  classified: {
    domain: OrchestrationDomain;
    intent: OrchestrationIntent;
    confidence: number;
    requiredContextKinds: string[];
  };
  wrapperCandidates: Array<Record<string, unknown>>;
  selectedWrapperId: string | null;
  routeReady: boolean;
};

export function classifyIntent(request: string, explicitIntent?: string): {
  domain: OrchestrationDomain;
  intent: OrchestrationIntent;
  confidence: number;
  requiredContextKinds: string[];
} {
  if (explicitIntent) {
    const mapped = String(explicitIntent).toLowerCase() as OrchestrationIntent;
    switch (mapped) {
      case "create_composition":
        return { domain: "create", intent: mapped, confidence: 1, requiredContextKinds: [] };
      case "create_text_layer":
      case "create_shape_layer":
        return { domain: "create", intent: mapped, confidence: 1, requiredContextKinds: ["composition"] };
      case "animate_text_entry":
        return { domain: "animate", intent: mapped, confidence: 1, requiredContextKinds: ["composition", "selection"] };
      case "enable_motion_blur":
        return { domain: "animate", intent: mapped, confidence: 1, requiredContextKinds: ["composition"] };
      case "sequence_layer_position":
      case "setup_typewriter_text":
        return { domain: "animate", intent: mapped, confidence: 1, requiredContextKinds: ["composition", "selection"] };
      case "create_timer_rig":
      case "copy_paths_to_masks":
        case "create_dropdown_controller":
      case "link_opacity_to_dropdown":
        return { domain: "rig", intent: mapped, confidence: 1, requiredContextKinds: ["composition"] };
      case "apply_bw_tint":
        return { domain: "effect", intent: mapped, confidence: 1, requiredContextKinds: ["composition", "selection"] };
      case "cleanup_keyframes":
      case "setup_retiming_mode":
        return { domain: "cleanup", intent: mapped, confidence: 1, requiredContextKinds: ["composition", "selected-properties"] };
      case "create_background_solid":
        return { domain: "create", intent: mapped, confidence: 1, requiredContextKinds: ["composition"] };
      case "render_to_media_encoder":
        return { domain: "render", intent: mapped, confidence: 1, requiredContextKinds: ["composition"] };
      default:
        return { domain: "unknown", intent: "unknown", confidence: 0, requiredContextKinds: [] };
    }
  }

  const text = request.toLowerCase();
  if (text.includes("media encoder") || text.includes(" adobe media encoder") || text.includes(" ame")) {
    return { domain: "render", intent: "render_to_media_encoder", confidence: 0.8, requiredContextKinds: ["composition"] };
  }
  if (text.includes("cleanup") && text.includes("keyframe")) {
    return { domain: "cleanup", intent: "cleanup_keyframes", confidence: 0.82, requiredContextKinds: ["composition", "selected-properties"] };
  }
  if (text.includes("retiming")) {
    return { domain: "cleanup", intent: "setup_retiming_mode", confidence: 0.82, requiredContextKinds: ["composition", "selected-properties"] };
  }
  if (text.includes("typewriter") || text.includes("typing effect")) {
    return { domain: "animate", intent: "setup_typewriter_text", confidence: 0.84, requiredContextKinds: ["composition", "selection"] };
  }
  if ((text.includes("text") || text.includes("judul") || text.includes("title")) &&
      (text.includes("entry") || text.includes("masuk") || text.includes("animate in") || text.includes("overshoot"))) {
    return { domain: "animate", intent: "animate_text_entry", confidence: 0.83, requiredContextKinds: ["composition", "selection"] };
  }
  if (text.includes("timer")) {
    return { domain: "rig", intent: "create_timer_rig", confidence: 0.82, requiredContextKinds: ["composition"] };
  }
  if (text.includes("copy") && text.includes("mask") && text.includes("path")) {
    return { domain: "rig", intent: "copy_paths_to_masks", confidence: 0.82, requiredContextKinds: ["composition", "selection"] };
  }
  if (text.includes("bw tint") || text.includes("black and white tint")) {
    return { domain: "effect", intent: "apply_bw_tint", confidence: 0.82, requiredContextKinds: ["composition", "selection"] };
  }
  if (text.includes("sequence") && (text.includes("layer") || text.includes("posisi") || text.includes("position"))) {
    return { domain: "animate", intent: "sequence_layer_position", confidence: 0.8, requiredContextKinds: ["composition", "selection"] };
  }
  if (text.includes("motion blur")) {
    return { domain: "animate", intent: "enable_motion_blur", confidence: 0.85, requiredContextKinds: ["composition"] };
  }
  if (text.includes("dropdown") && text.includes("opacity")) {
    return { domain: "rig", intent: "link_opacity_to_dropdown", confidence: 0.8, requiredContextKinds: ["composition"] };
  }
  if (text.includes("dropdown")) {
    return { domain: "rig", intent: "create_dropdown_controller", confidence: 0.8, requiredContextKinds: ["composition"] };
  }
  if (text.includes("shape")) {
    return { domain: "create", intent: "create_shape_layer", confidence: 0.75, requiredContextKinds: ["composition"] };
  }
  if ((text.includes("background") || text.includes("solid")) && !text.includes("text")) {
    return { domain: "create", intent: "create_background_solid", confidence: 0.72, requiredContextKinds: ["composition"] };
  }
  if (text.includes("text")) {
    return { domain: "create", intent: "create_text_layer", confidence: 0.75, requiredContextKinds: ["composition"] };
  }
  if (text.includes("comp")) {
    return { domain: "create", intent: "create_composition", confidence: 0.7, requiredContextKinds: [] };
  }
  return { domain: "unknown", intent: "unknown", confidence: 0, requiredContextKinds: [] };
}

export function resolveExecutionRoute(request: string, explicitIntent?: string): ExecutionRoute {
  const classified = classifyIntent(request, explicitIntent);
  const wrapperCandidates = findWrapperCandidates(request, 5);
  const selectedWrapperId = wrapperCandidates.length > 0 ? String(wrapperCandidates[0].id) : null;
  const routeReady = classified.intent !== "unknown";

  return {
    classified,
    wrapperCandidates,
    selectedWrapperId,
    routeReady
  };
}

export function buildOrchestrationPlan(
  classified: ReturnType<typeof classifyIntent>,
  parameters: Record<string, any> = {}
): { steps: OrchestrationStep[]; assumptions: string[] } {
  const assumptions: string[] = [];
  const steps: OrchestrationStep[] = [];

  switch (classified.intent) {
    case "create_composition":
      steps.push({
        phase: "execute",
        command: "createComposition",
        args: {
          name: parameters.name ?? "New Composition",
          width: parameters.width ?? 1920,
          height: parameters.height ?? 1080,
          pixelAspect: parameters.pixelAspect ?? 1,
          duration: parameters.duration ?? 10,
          frameRate: parameters.frameRate ?? 30,
          backgroundColor: parameters.backgroundColor
        },
        summary: "Create composition",
        transientTimeoutMs: 10000
      });
      break;
    case "create_text_layer":
      assumptions.push("Uses active composition when compName/compIndex is not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve target composition for text layer"
      });
      steps.push({
        phase: "execute",
        command: "createTextLayer",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          text: parameters.text ?? "Text Layer",
          position: parameters.position,
          fontSize: parameters.fontSize ?? 72,
          color: parameters.color,
          startTime: parameters.startTime ?? 0,
          duration: parameters.duration,
          fontFamily: parameters.fontFamily,
          alignment: parameters.alignment
        },
        summary: "Create text layer in resolved composition",
        transientTimeoutMs: 10000
      });
      break;
    case "create_shape_layer":
      assumptions.push("Uses active composition when compName/compIndex is not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve target composition for shape layer"
      });
      steps.push({
        phase: "execute",
        command: "createShapeLayer",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          shapeType: parameters.shapeType ?? "rectangle",
          position: parameters.position,
          size: parameters.size,
          fillColor: parameters.fillColor,
          strokeColor: parameters.strokeColor,
          strokeWidth: parameters.strokeWidth ?? 0,
          startTime: parameters.startTime ?? 0,
          duration: parameters.duration,
          name: parameters.name,
          points: parameters.points
        },
        summary: "Create shape layer in resolved composition",
        transientTimeoutMs: 10000
      });
      break;
    case "enable_motion_blur":
      assumptions.push("Defaults to active composition when scope is not provided");
      steps.push({
        phase: "execute",
        command: "enableMotionBlur",
        args: {
          scope: parameters.scope,
          compName: parameters.compName,
          includeLocked: parameters.includeLocked
        },
        summary: "Enable motion blur",
        transientTimeoutMs: 10000
      });
      break;
    case "animate_text_entry":
      assumptions.push("Defaults to active composition and selected text layer when no explicit layer target is provided");
      assumptions.push("Uses a curated slide-and-fade animation with optional overshoot");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerName: parameters.layerName,
          layerIndex: parameters.layerIndex,
          useSelectedLayer: parameters.useSelectedLayer ?? true
        },
        summary: "Resolve text layer target for text entry animation"
      });
      steps.push({
        phase: "execute",
        command: "animateTextEntry",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerName: parameters.layerName,
          layerIndex: parameters.layerIndex,
          useSelectedLayer: parameters.useSelectedLayer ?? true,
          direction: parameters.direction ?? "bottom",
          distance: parameters.distance ?? 120,
          duration: parameters.duration ?? 1,
          startTime: parameters.startTime,
          overshoot: parameters.overshoot ?? true,
          fadeIn: parameters.fadeIn ?? true,
          opacityFrom: parameters.opacityFrom ?? 0
        },
        summary: "Apply text entry animation",
        transientTimeoutMs: 10000
      });
      break;
    case "sequence_layer_position":
      assumptions.push("Defaults to active composition and selected layers when layer scope is not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers ?? true
        },
        summary: "Resolve target composition and layer collection for sequencing"
      });
      steps.push({
        phase: "execute",
        command: "sequenceLayerPosition",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers ?? true,
          offsetX: parameters.offsetX ?? 0,
          offsetY: parameters.offsetY ?? 36.6,
          order: parameters.order ?? "layer_stack"
        },
        summary: "Sequence target layers by position",
        transientTimeoutMs: 10000
      });
      break;
    case "setup_typewriter_text":
      assumptions.push("Defaults to active composition and selected text layer when no explicit layer target is provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerName: parameters.layerName,
          useSelectedLayer: parameters.useSelectedLayer ?? true
        },
        summary: "Resolve text layer target for typewriter setup"
      });
      steps.push({
        phase: "execute",
        command: "setupTypewriterText",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerName: parameters.layerName,
          useSelectedLayer: parameters.useSelectedLayer ?? true,
          controllerName: parameters.controllerName,
          speed: parameters.speed,
          blinkSpeed: parameters.blinkSpeed,
          startAt: parameters.startAt,
          blinkOn: parameters.blinkOn
        },
        summary: "Apply typewriter setup",
        transientTimeoutMs: 10000
      });
      break;
    case "create_timer_rig":
      assumptions.push("Uses active composition when compName is not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve target composition for timer rig"
      });
      steps.push({
        phase: "execute",
        command: "createTimerRig",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerName: parameters.layerName,
          mode: parameters.mode,
          timeFormat: parameters.timeFormat ?? parameters.format,
          rate: parameters.rate,
          startHours: parameters.startHours,
          startMinutes: parameters.startMinutes,
          startSeconds: parameters.startSeconds,
          showMilliseconds: parameters.showMilliseconds,
          allowNegativeTime: parameters.allowNegativeTime
        },
        summary: "Create timer rig",
        transientTimeoutMs: 10000
      });
      break;
    case "apply_bw_tint":
      assumptions.push("Defaults to selected layers in the active composition when explicit targets are not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers ?? true
        },
        summary: "Resolve target composition and layers for BW tint"
      });
      steps.push({
        phase: "execute",
        command: "applyBwTint",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers ?? true,
          amount: parameters.amount,
          whiteishAmount: parameters.whiteishAmount,
          presetName: parameters.presetName,
          hexColor: parameters.hexColor,
          skipLocked: parameters.skipLocked
        },
        summary: "Apply BW tint",
        transientTimeoutMs: 10000
      });
      break;
    case "cleanup_keyframes":
      assumptions.push("Uses selected keyed properties in the active composition");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve selected property context for keyframe cleanup"
      });
      steps.push({
        phase: "execute",
        command: "cleanupKeyframes",
        args: {
          mode: parameters.mode ?? "remove_duplicates",
          keepFirst: parameters.keepFirst,
          keepLast: parameters.keepLast,
          tolerance: parameters.tolerance,
          dryRun: parameters.dryRun
        },
        summary: "Cleanup selected keyframes",
        transientTimeoutMs: 10000
      });
      break;
    case "setup_retiming_mode":
      assumptions.push("Uses selected keyed properties in the active composition");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve selected property context for retiming mode"
      });
      steps.push({
        phase: "execute",
        command: "setupRetimingMode",
        args: {
          controllerName: parameters.controllerName,
          defaultMode: parameters.defaultMode
        },
        summary: "Setup retiming mode",
        transientTimeoutMs: 10000
      });
      break;
    case "copy_paths_to_masks":
      assumptions.push("Uses selected paths in the active composition");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers
        },
        summary: "Resolve path and destination context for path-to-mask copy"
      });
      steps.push({
        phase: "execute",
        command: "copyPathsToMasks",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers,
          targetLayerMode: parameters.targetLayerMode,
          maskMode: parameters.maskMode
        },
        summary: "Copy selected paths to masks",
        transientTimeoutMs: 10000
      });
      break;
    case "create_background_solid":
      assumptions.push("Uses active composition when compName/compIndex is not provided");
      assumptions.push("Creates a full-frame solid and moves it to the back by default");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve target composition for background solid"
      });
      steps.push({
        phase: "execute",
        command: "createBackgroundSolid",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          name: parameters.name ?? "Background",
          color: parameters.color ?? parameters.backgroundColor ?? { r: 0, g: 0, b: 0 },
          startTime: parameters.startTime ?? 0,
          duration: parameters.duration,
          moveToBack: parameters.moveToBack ?? true
        },
        summary: "Create background solid",
        transientTimeoutMs: 10000
      });
      break;
    case "create_dropdown_controller":
      assumptions.push("Uses active composition when compName is not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex
        },
        summary: "Resolve target composition for dropdown controller"
      });
      steps.push({
        phase: "execute",
        command: "createDropdownController",
        args: {
          compName: parameters.compName,
          controllerName: parameters.controllerName,
          dropdownName: parameters.dropdownName,
          menuItems: parameters.menuItems,
          selectedIndex: parameters.selectedIndex,
          reuseIfExists: parameters.reuseIfExists
        },
        summary: "Create or reuse dropdown controller",
        transientTimeoutMs: 10000
      });
      break;
    case "link_opacity_to_dropdown":
      assumptions.push("Uses active composition when compName is not provided");
      steps.push({
        phase: "preflight",
        command: "resolveTargets",
        args: {
          compName: parameters.compName,
          compIndex: parameters.compIndex,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers
        },
        summary: "Resolve target composition and layers for dropdown opacity link"
      });
      steps.push({
        phase: "execute",
        command: "linkOpacityToDropdown",
        args: {
          compName: parameters.compName,
          controllerName: parameters.controllerName,
          dropdownName: parameters.dropdownName,
          layerNames: parameters.layerNames,
          useSelectedLayers: parameters.useSelectedLayers,
          mappingMode: parameters.mappingMode
        },
        summary: "Link opacity to dropdown controller",
        transientTimeoutMs: 10000
      });
      break;
    case "render_to_media_encoder":
      assumptions.push("Render to Adobe Media Encoder is cataloged but not yet implemented as a first-class wrapper");
      break;
    default:
      break;
  }

  return { steps, assumptions };
}

export async function executeOrchestrationPlan(
  request: string,
  classified: ReturnType<typeof classifyIntent>,
  plan: { steps: OrchestrationStep[]; assumptions: string[] },
  dependencies: {
    executeBridgeCommandAndWait: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; maxAttempts?: number }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>;
    executeCommandThroughSafety: (command: string, args: Record<string, any>, options?: { timeoutMs?: number; allowForceWithoutCheckpoint?: boolean }) => Promise<{ ok: boolean; result: any; retries: number; failureClass?: string }>;
  }
): Promise<{
  ok: boolean;
  timeline: OrchestrationTimelineEntry[];
  result: any;
  retries: number;
  failureClass?: string;
}> {
  const timeline: OrchestrationTimelineEntry[] = [];
  let totalRetries = 0;
  let finalResult: any = null;

  for (const step of plan.steps) {
    timeline.push({ phase: step.phase, status: "started", summary: step.summary, command: step.command });
    const executed = step.phase === "execute"
      ? await dependencies.executeCommandThroughSafety(step.command, step.args, {
          timeoutMs: step.transientTimeoutMs ?? 12000
        })
      : await dependencies.executeBridgeCommandAndWait(step.command, step.args, {
          timeoutMs: step.transientTimeoutMs ?? 8000,
          maxAttempts: 2
        });
    totalRetries += executed.retries;
    if (executed.retries > 0) {
      timeline.push({
        phase: step.phase,
        status: "retry",
        summary: step.summary,
        command: step.command,
        attempt: executed.retries + 1,
        detail: `Retried after transient ${executed.failureClass ?? "bridge"} failure`
      });
    }
    if (!executed.ok) {
      timeline.push({
        phase: "fail",
        status: "error",
        summary: `Step failed: ${step.summary}`,
        command: step.command,
        detail: executed.result?.message || "Unknown failure"
      });
      return {
        ok: false,
        timeline,
        result: executed.result,
        retries: totalRetries,
        failureClass: executed.failureClass
      };
    }

    timeline.push({
      phase: step.phase,
      status: "success",
      summary: step.summary,
      command: step.command
    });
    finalResult = executed.result;
  }

  timeline.push({
    phase: "finalize",
    status: "success",
    summary: `Orchestration completed for request: ${request || classified.intent}`
  });
  return { ok: true, timeline, result: finalResult, retries: totalRetries };
}
