export type WrapperDomain = "create" | "animate" | "rig" | "cleanup" | "effect" | "render";
export type WrapperStatus = "existing-wrapper" | "existing-low-level" | "planned-wrapper";
export type WrapperSafetyClass = "low" | "medium" | "high";
export type WrapperFallbackMax = "none" | "curated" | "ad-hoc";

export type WrapperDefinition = {
  id: string;
  displayName: string;
  description: string;
  domain: WrapperDomain;
  intentId: string;
  status: WrapperStatus;
  routeType: "wrapper" | "orchestrated-wrapper-chain" | "wrapper-or-low-level" | "missing-wrapper-candidate";
  commands: string[];
  targetingModes: string[];
  defaults: string[];
  safetyClass: WrapperSafetyClass;
  fallbackMax: WrapperFallbackMax;
  promptPatterns: string[];
};

const WrapperRegistry: WrapperDefinition[] = [
  {
    id: "create-composition",
    displayName: "Create Composition",
    description: "Create a composition directly with size, duration, and frame rate defaults.",
    domain: "create",
    intentId: "create_composition",
    status: "existing-low-level",
    routeType: "wrapper-or-low-level",
    commands: ["createComposition"],
    targetingModes: ["new-comp"],
    defaults: ["duration=10", "frameRate=30", "pixelAspect=1"],
    safetyClass: "low",
    fallbackMax: "none",
    promptPatterns: ["buat comp", "create composition", "comp baru", "new comp"]
  },
  {
    id: "create-text-layer",
    displayName: "Create Text Layer",
    description: "Create a text layer in the active or named composition with safe defaults.",
    domain: "create",
    intentId: "create_text_layer",
    status: "existing-low-level",
    routeType: "wrapper-or-low-level",
    commands: ["resolveTargets", "createTextLayer"],
    targetingModes: ["active-comp", "comp-name"],
    defaults: ["fontSize=72", "color=white", "alignment=center"],
    safetyClass: "low",
    fallbackMax: "curated",
    promptPatterns: ["tambah text", "add text", "text layer", "buat text"]
  },
  {
    id: "create-shape-layer",
    displayName: "Create Shape Layer",
    description: "Create a shape layer in the active or named composition with safe defaults.",
    domain: "create",
    intentId: "create_shape_layer",
    status: "existing-low-level",
    routeType: "wrapper-or-low-level",
    commands: ["resolveTargets", "createShapeLayer"],
    targetingModes: ["active-comp", "comp-name"],
    defaults: ["shapeType=rectangle", "strokeWidth=0"],
    safetyClass: "low",
    fallbackMax: "curated",
    promptPatterns: ["shape layer", "lingkaran", "circle", "rectangle", "ellipse", "shape"]
  },
  {
    id: "enable-motion-blur",
    displayName: "Enable Motion Blur",
    description: "Enable motion blur in the active, named, or all compositions.",
    domain: "animate",
    intentId: "enable_motion_blur",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["enableMotionBlur"],
    targetingModes: ["active-comp", "comp-name", "all-comps"],
    defaults: ["scope=active_comp"],
    safetyClass: "medium",
    fallbackMax: "none",
    promptPatterns: ["motion blur", "enable motion blur"]
  },
  {
    id: "sequence-layer-position",
    displayName: "Sequence Layer Position",
    description: "Offset selected or named layers by stack order.",
    domain: "animate",
    intentId: "sequence_layer_position",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["sequenceLayerPosition"],
    targetingModes: ["selected-layers", "layer-name", "comp-name", "active-comp"],
    defaults: ["offsetY=36.6", "order=layer_stack"],
    safetyClass: "low",
    fallbackMax: "curated",
    promptPatterns: ["sequence posisi", "sequence position", "offset layer", "sequence selected layers"]
  },
  {
    id: "setup-typewriter-text",
    displayName: "Setup Typewriter Text",
    description: "Apply a typewriter workflow to a selected or named text layer.",
    domain: "animate",
    intentId: "setup_typewriter_text",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["setupTypewriterText"],
    targetingModes: ["selected-layers", "layer-name", "active-comp", "comp-name"],
    defaults: ["preferSelectedTextLayer=true"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["typewriter", "text typing", "typing effect"]
  },
  {
    id: "create-dropdown-controller",
    displayName: "Create Dropdown Controller",
    description: "Create or reuse a dropdown controller in the active or named composition.",
    domain: "rig",
    intentId: "create_dropdown_controller",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["resolveTargets", "createDropdownController"],
    targetingModes: ["active-comp", "comp-name"],
    defaults: ["reuseIfExists=true"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["dropdown controller", "create dropdown", "buat dropdown"]
  },
  {
    id: "link-opacity-to-dropdown",
    displayName: "Link Opacity To Dropdown",
    description: "Link selected or named layers to a dropdown controller through opacity expressions.",
    domain: "rig",
    intentId: "link_opacity_to_dropdown",
    status: "existing-wrapper",
    routeType: "orchestrated-wrapper-chain",
    commands: ["resolveTargets", "createDropdownController", "linkOpacityToDropdown"],
    targetingModes: ["selected-layers", "layer-name", "active-comp", "comp-name", "existing-controller"],
    defaults: ["mappingMode=exclusive", "reuseIfExists=true"],
    safetyClass: "medium",
    fallbackMax: "none",
    promptPatterns: ["link opacity", "opacity dropdown", "hubungkan opacity", "dropdown opacity"]
  },
  {
    id: "create-timer-rig",
    displayName: "Create Timer Rig",
    description: "Create a timer text rig with controls in the active or named composition.",
    domain: "rig",
    intentId: "create_timer_rig",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["createTimerRig"],
    targetingModes: ["active-comp", "comp-name"],
    defaults: ["format=MM:SS"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["timer rig", "countdown", "mm:ss", "create timer"]
  },
  {
    id: "copy-paths-to-masks",
    displayName: "Copy Paths To Masks",
    description: "Copy selected paths into masks on the same layer.",
    domain: "rig",
    intentId: "copy_paths_to_masks",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["copyPathsToMasks"],
    targetingModes: ["selected-paths", "active-comp", "comp-name"],
    defaults: ["same-layer=true"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["copy path to mask", "paths to masks", "selected path ke mask"]
  },
  {
    id: "apply-bw-tint",
    displayName: "Apply BW Tint",
    description: "Apply a reusable BW tint look to selected or named layers.",
    domain: "effect",
    intentId: "apply_bw_tint",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["applyBwTint"],
    targetingModes: ["selected-layers", "layer-name", "active-comp", "comp-name"],
    defaults: ["amount=100"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["bw tint", "black and white tint", "tint warm"]
  },
  {
    id: "cleanup-keyframes",
    displayName: "Cleanup Keyframes",
    description: "Clean duplicate or unsafe keyframe patterns on selected properties with safety-aware routing.",
    domain: "cleanup",
    intentId: "cleanup_keyframes",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["cleanupKeyframes"],
    targetingModes: ["selected-properties", "active-comp"],
    defaults: ["dryRun=false"],
    safetyClass: "high",
    fallbackMax: "none",
    promptPatterns: ["cleanup keyframes", "delete duplicate keyframes", "cleanup duplicate keyframes"]
  },
  {
    id: "setup-retiming-mode",
    displayName: "Setup Retiming Mode",
    description: "Apply retiming helpers to selected properties.",
    domain: "cleanup",
    intentId: "setup_retiming_mode",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["setupRetimingMode"],
    targetingModes: ["selected-properties", "active-comp"],
    defaults: ["preferSelectedProperties=true"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["retiming mode", "retime keyframes", "setup retiming"]
  },
  {
    id: "animate-text-entry",
    displayName: "Animate Text Entry",
    description: "Animate a text layer entering from a direction with opinionated defaults.",
    domain: "animate",
    intentId: "animate_text_entry",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["animateTextEntry"],
    targetingModes: ["selected-layers", "layer-name", "active-comp"],
    defaults: ["duration=1", "direction=bottom", "overshoot=true"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["text masuk dari bawah", "text entry", "animate text in", "overshoot"]
  },
  {
    id: "create-background-solid",
    displayName: "Create Background Solid",
    description: "Create a full-frame background solid in the active or named composition.",
    domain: "create",
    intentId: "create_background_solid",
    status: "existing-wrapper",
    routeType: "wrapper",
    commands: ["createBackgroundSolid"],
    targetingModes: ["active-comp", "comp-name"],
    defaults: ["fullFrame=true", "duration=fullComp"],
    safetyClass: "low",
    fallbackMax: "none",
    promptPatterns: ["background hitam", "background solid", "full frame background", "solid background"]
  },
  {
    id: "render-to-media-encoder",
    displayName: "Render To Media Encoder",
    description: "Queue a known composition to Adobe Media Encoder.",
    domain: "render",
    intentId: "render_to_media_encoder",
    status: "planned-wrapper",
    routeType: "missing-wrapper-candidate",
    commands: [],
    targetingModes: ["active-comp", "comp-name"],
    defaults: ["queueOnly=true"],
    safetyClass: "medium",
    fallbackMax: "curated",
    promptPatterns: ["media encoder", "queue comp", "render ke media encoder", "ame"]
  }
];

export function getWrapperRegistry(): WrapperDefinition[] {
  return WrapperRegistry.map((entry) => ({
    ...entry,
    commands: [...entry.commands],
    targetingModes: [...entry.targetingModes],
    defaults: [...entry.defaults],
    promptPatterns: [...entry.promptPatterns]
  }));
}

export function getIntentCatalog() {
  const intents: Record<string, {
    intentId: string;
    domains: string[];
    wrapperIds: string[];
    statuses: string[];
  }> = {};

  for (const wrapper of WrapperRegistry) {
    if (!intents[wrapper.intentId]) {
      intents[wrapper.intentId] = {
        intentId: wrapper.intentId,
        domains: [],
        wrapperIds: [],
        statuses: []
      };
    }
    const entry = intents[wrapper.intentId];
    if (entry.domains.indexOf(wrapper.domain) === -1) {
      entry.domains.push(wrapper.domain);
    }
    if (entry.wrapperIds.indexOf(wrapper.id) === -1) {
      entry.wrapperIds.push(wrapper.id);
    }
    if (entry.statuses.indexOf(wrapper.status) === -1) {
      entry.statuses.push(wrapper.status);
    }
  }

  return Object.values(intents).sort((a, b) => a.intentId.localeCompare(b.intentId));
}

function countPatternHits(text: string, patterns: string[]): number {
  let score = 0;
  for (const pattern of patterns) {
    if (text.includes(pattern.toLowerCase())) {
      score += Math.max(1, Math.min(4, pattern.length / 8));
    }
  }
  return score;
}

export function findWrapperCandidates(request: string, limit = 5) {
  const text = String(request || "").toLowerCase();
  return getWrapperRegistry()
    .map((wrapper) => ({
      wrapper,
      score: countPatternHits(text, wrapper.promptPatterns)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.wrapper.displayName.localeCompare(b.wrapper.displayName))
    .slice(0, Math.max(1, limit))
    .map((entry) => ({
      score: entry.score,
      ...entry.wrapper
    }));
}
