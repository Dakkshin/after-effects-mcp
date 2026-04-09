import { z } from "zod";

export const LayerTargetingSchema = {
  compIndex: z.number().int().positive().optional().describe("Optional 1-based composition index. Kept for backward compatibility."),
  compName: z.string().optional().describe("Optional exact composition name."),
  layerIndex: z.number().int().positive().optional().describe("Optional 1-based layer index. Kept for backward compatibility."),
  layerName: z.string().optional().describe("Optional exact layer name."),
  useSelectedLayer: z.boolean().optional().describe("When true, target the single selected layer in the active composition.")
};

export const CompositionTargetingSchema = {
  compIndex: z.number().int().positive().optional().describe("Optional 1-based composition index. Kept for backward compatibility."),
  compName: z.string().optional().describe("Optional exact composition name. Defaults to the active composition.")
};

export const GenericLayerPropertiesShape = {
  position: z.array(z.number()).optional().describe("Layer position array."),
  scale: z.array(z.number()).optional().describe("Layer scale array."),
  rotation: z.number().optional().describe("Layer rotation in degrees."),
  opacity: z.number().optional().describe("Layer opacity from 0 to 100."),
  threeDLayer: z.boolean().optional().describe("Enable or disable 3D layer mode."),
  blendMode: z.string().optional().describe("Blend mode name."),
  startTime: z.number().optional().describe("Layer start time in seconds."),
  outPoint: z.number().optional().describe("Layer out point in seconds."),
  enabled: z.boolean().optional().describe("Enable or disable the layer."),
  shy: z.boolean().optional().describe("Set the shy switch."),
  motionBlur: z.boolean().optional().describe("Enable or disable motion blur on the layer."),
  adjustmentLayer: z.boolean().optional().describe("Enable or disable adjustment layer mode."),
  name: z.string().optional().describe("Optional layer name override.")
};

export const GenericLayerPropertiesSchema = z.object(GenericLayerPropertiesShape).partial();

export const LayerSelectionSchema = {
  ...CompositionTargetingSchema,
  layerNames: z.array(z.string()).optional().describe("Optional exact layer names to target."),
  layerIndexes: z.array(z.number().int().positive()).optional().describe("Optional 1-based layer indexes to target."),
  replaceSelection: z.boolean().optional().describe("When true, clear the current layer selection before selecting the targets.")
};

export const ContextResolverSchema = {
  ...CompositionTargetingSchema,
  ...LayerTargetingSchema,
  layerNames: z.array(z.string()).optional().describe("Optional exact layer names to resolve as a collection."),
  layerIndexes: z.array(z.number().int().positive()).optional().describe("Optional 1-based layer indexes to resolve as a collection."),
  useSelectedLayers: z.boolean().optional().describe("When true, resolve the selected layers in the active composition."),
  includeLayerMap: z.boolean().optional().describe("When true, include a lightweight layer map for the resolved composition."),
  includeNamedItems: z.boolean().optional().describe("When true, include lightweight reusable named items such as nulls, text layers, and likely controllers."),
  maxLayers: z.number().int().positive().optional().describe("Maximum number of layers to include in the lightweight layer map."),
  maxNamedItems: z.number().int().positive().optional().describe("Maximum number of named reusable items to include per category."),
  maxComps: z.number().int().positive().optional().describe("Maximum number of compositions to include in the project context summary.")
};

export const CapabilityCatalogSchema = {
  forceRefresh: z.boolean().optional().describe("When true, rebuild the capability catalog instead of reading the cache."),
  maxDepth: z.number().int().positive().optional().describe("Maximum property tree depth to traverse during discovery."),
  maxChildren: z.number().int().positive().optional().describe("Maximum children per property group during discovery."),
  maxEffects: z.number().int().positive().optional().describe("Maximum number of effects to include when enumerating app.effects.")
};

export const OrchestrationIntentSchema = z.enum([
  "create_composition",
  "create_text_layer",
  "create_shape_layer",
  "animate_text_entry",
  "enable_motion_blur",
  "sequence_layer_position",
  "setup_typewriter_text",
  "create_timer_rig",
  "apply_bw_tint",
  "cleanup_keyframes",
  "setup_retiming_mode",
  "copy_paths_to_masks",
  "create_background_solid",
  "create_dropdown_controller",
  "link_opacity_to_dropdown",
  "render_to_media_encoder"
]);

export const OrchestrationParametersSchema = z.record(z.string(), z.unknown()).optional().describe("Structured parameters passed into the deterministic orchestration planner.");

export const KeyframeValueSchema = z.unknown().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");

export const CheckpointSelectionSchema = {
  projectPath: z.string().optional().describe("Optional canonical project path. Defaults to the active saved project."),
  checkpointId: z.string().optional().describe("Optional checkpoint id. Defaults to the latest checkpoint when omitted.")
};
