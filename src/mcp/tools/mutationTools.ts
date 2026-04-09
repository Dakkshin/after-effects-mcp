import { z } from "zod";
import type {
  BuildQueuedBridgeToolResponse,
  FormatToolPayload,
  QueueBridgeCommand,
  QueueMutationWithSafety,
  SafetyRoutingDependencies,
  ToolServer
} from "../toolContracts.js";
import {
  CompositionTargetingSchema,
  GenericLayerPropertiesShape,
  KeyframeValueSchema,
  LayerTargetingSchema
} from "../toolSchemas.js";

export function registerMutationTools(deps: {
  server: ToolServer;
  queueBridgeCommand: QueueBridgeCommand;
  queueMutationWithSafety: QueueMutationWithSafety;
  buildQueuedBridgeToolResponse: BuildQueuedBridgeToolResponse;
  describeQueuedCommand: (command: string, commandId: string) => string;
  formatToolPayload: FormatToolPayload;
  buildStructuredSafetyError: (error: unknown, fallbackCode: string, fallbackMessage: string) => Record<string, unknown>;
  safetyRoutingDependencies: SafetyRoutingDependencies;
}) {
  const {
    server,
    queueBridgeCommand,
    queueMutationWithSafety,
    buildQueuedBridgeToolResponse,
    describeQueuedCommand,
    formatToolPayload,
    buildStructuredSafetyError,
    safetyRoutingDependencies
  } = deps;

  server.tool(
    "create-background-solid",
    "Create a full-frame background solid in the active or named composition and move it behind other layers by default.",
    {
      ...CompositionTargetingSchema,
      name: z.string().optional().describe("Optional background layer name."),
      color: z.object({
        r: z.number().int().min(0).max(255),
        g: z.number().int().min(0).max(255),
        b: z.number().int().min(0).max(255)
      }).optional().describe("Background color as 0-255 RGB values."),
      hexColor: z.string().optional().describe("Optional background color in #RRGGBB or #RGB format."),
      startTime: z.number().optional().describe("Layer start time in seconds."),
      duration: z.number().positive().optional().describe("Layer duration in seconds. Defaults to full comp duration."),
      moveToBack: z.boolean().optional().describe("Move the created background to the back of the layer stack.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("createBackgroundSolid", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "CREATE_BACKGROUND_SOLID_FAILED", "Failed to queue create-background-solid."),
          true
        );
      }
    }
  );

  server.tool(
    "animate-text-entry",
    "Animate a text layer entering from a direction with curated slide, fade, and optional overshoot defaults.",
    {
      ...LayerTargetingSchema,
      direction: z.enum(["left", "right", "top", "bottom"]).optional().describe("Direction from which the text should enter."),
      distance: z.number().positive().optional().describe("How far the text starts from its final position in pixels."),
      duration: z.number().positive().optional().describe("Animation duration in seconds."),
      startTime: z.number().optional().describe("Animation start time in seconds. Defaults to the layer in point."),
      overshoot: z.boolean().optional().describe("Add a small overshoot before settling on the final position."),
      fadeIn: z.boolean().optional().describe("Animate opacity from opacityFrom to the final opacity."),
      opacityFrom: z.number().min(0).max(100).optional().describe("Starting opacity when fadeIn is enabled.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("animateTextEntry", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "ANIMATE_TEXT_ENTRY_FAILED", "Failed to queue animate-text-entry."),
          true
        );
      }
    }
  );

  server.tool(
    "setLayerProperties",
    "Legacy compatibility tool for setting direct layer properties.",
    {
      ...LayerTargetingSchema,
      ...GenericLayerPropertiesShape
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("setLayerProperties", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SET_LAYER_PROPERTIES_FAILED", "Failed to queue setLayerProperties."),
          true
        );
      }
    }
  );

  server.tool(
    "createCamera",
    "Legacy compatibility tool for creating a camera layer.",
    {
      ...CompositionTargetingSchema,
      name: z.string().optional().describe("Camera layer name."),
      zoom: z.number().optional().describe("Camera zoom value."),
      position: z.array(z.number()).optional().describe("Camera position array."),
      pointOfInterest: z.array(z.number()).optional().describe("Camera point of interest."),
      oneNode: z.boolean().optional().describe("Create a one-node camera.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("createCamera", parameters);
        return buildQueuedBridgeToolResponse("createCamera", commandId);
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Failed to queue createCamera: ${String(error)}`
        }, true);
      }
    }
  );

  server.tool(
    "batchSetLayerProperties",
    "Legacy compatibility tool for applying property changes across multiple layers.",
    {
      ...CompositionTargetingSchema,
      operations: z.array(z.object({
        layerIndex: z.number().int().positive().optional(),
        layerName: z.string().optional(),
        position: z.array(z.number()).optional(),
        scale: z.array(z.number()).optional(),
        rotation: z.number().optional(),
        opacity: z.number().optional(),
        threeDLayer: z.boolean().optional(),
        blendMode: z.string().optional(),
        startTime: z.number().optional(),
        outPoint: z.number().optional()
      })).min(1).describe("Per-layer property operations.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("batchSetLayerProperties", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "BATCH_SET_LAYER_PROPERTIES_FAILED", "Failed to queue batchSetLayerProperties."),
          true
        );
      }
    }
  );

  server.tool(
    "duplicateLayer",
    "Legacy compatibility tool for duplicating a layer.",
    {
      ...LayerTargetingSchema,
      newName: z.string().optional().describe("Optional duplicate layer name.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("duplicateLayer", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "DUPLICATE_LAYER_FAILED", "Failed to queue duplicateLayer."),
          true
        );
      }
    }
  );

  server.tool(
    "deleteLayer",
    "Legacy compatibility tool for deleting a layer.",
    {
      ...LayerTargetingSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("deleteLayer", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "DELETE_LAYER_FAILED", "Failed to queue deleteLayer."),
          true
        );
      }
    }
  );

  server.tool(
    "setLayerMask",
    "Legacy compatibility tool for creating or updating a layer mask.",
    {
      ...LayerTargetingSchema,
      maskIndex: z.number().int().positive().optional().describe("Optional existing mask index."),
      maskPath: z.array(z.array(z.number())).optional().describe("Closed mask path vertices."),
      maskRect: z.object({
        top: z.number().optional(),
        left: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional()
      }).optional().describe("Rectangle shorthand for mask creation."),
      maskMode: z.string().optional().describe("Mask mode name."),
      maskFeather: z.array(z.number()).optional().describe("Mask feather array."),
      maskOpacity: z.number().optional().describe("Mask opacity."),
      maskExpansion: z.number().optional().describe("Mask expansion."),
      maskName: z.string().optional().describe("Optional mask name.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("setLayerMask", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SET_LAYER_MASK_FAILED", "Failed to queue setLayerMask."),
          true
        );
      }
    }
  );

  server.tool(
    "mcp_aftereffects_create_composition",
    "Legacy OpenAI-style compatibility alias for composition creation.",
    {
      name: z.string().describe("Name of the composition"),
      width: z.number().int().positive().describe("Width of the composition in pixels"),
      height: z.number().int().positive().describe("Height of the composition in pixels"),
      pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio."),
      duration: z.number().positive().optional().describe("Duration in seconds."),
      frameRate: z.number().positive().optional().describe("Frame rate."),
      backgroundColor: z.object({
        r: z.number().int().min(0).max(255),
        g: z.number().int().min(0).max(255),
        b: z.number().int().min(0).max(255)
      }).optional().describe("Background color.")
    },
    async (parameters: { name: string } & Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("createComposition", parameters);
        return buildQueuedBridgeToolResponse("createComposition", commandId, `Composition: ${parameters.name}`);
      } catch (error) {
        return formatToolPayload({
          status: "error",
          message: `Failed to queue mcp_aftereffects_create_composition: ${String(error)}`
        }, true);
      }
    }
  );

  server.tool(
    "setLayerKeyframe",
    "Set a keyframe for a specific layer property at a given time.",
    {
      ...LayerTargetingSchema,
      propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
      timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
      value: KeyframeValueSchema
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("setLayerKeyframe", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SET_LAYER_KEYFRAME_FAILED", "Failed to queue setLayerKeyframe."),
          true
        );
      }
    }
  );

  server.tool(
    "setLayerExpression",
    "Set or remove an expression for a specific layer property.",
    {
      ...LayerTargetingSchema,
      propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
      expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("setLayerExpression", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SET_LAYER_EXPRESSION_FAILED", "Failed to queue setLayerExpression."),
          true
        );
      }
    }
  );

  server.tool(
    "enable-motion-blur",
    "Enable motion blur on layers in the active comp, a named comp, or all comps.",
    {
      scope: z.enum(["active_comp", "named_comp", "all_comps"]).optional().describe("Which composition scope to update."),
      compName: z.string().optional().describe("Exact composition name when scope is named_comp."),
      includeLocked: z.boolean().optional().describe("When true, temporarily unlock locked layers to enable motion blur.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("enableMotionBlur", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "ENABLE_MOTION_BLUR_FAILED", "Failed to queue enable-motion-blur."),
          true
        );
      }
    }
  );

  server.tool(
    "sequence-layer-position",
    "Apply ordered position offsets across selected or named layers.",
    {
      compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
      layerNames: z.array(z.string()).optional().describe("Optional exact layer names to sequence."),
      useSelectedLayers: z.boolean().optional().describe("When true, use the selected layers in the active composition."),
      offsetX: z.number().optional().describe("Horizontal offset applied cumulatively per layer."),
      offsetY: z.number().optional().describe("Vertical offset applied cumulatively per layer."),
      order: z.enum(["layer_stack", "selection_order"]).optional().describe("Layer ordering to use while sequencing.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("sequenceLayerPosition", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SEQUENCE_LAYER_POSITION_FAILED", "Failed to queue sequence-layer-position."),
          true
        );
      }
    }
  );

  server.tool(
    "copy-paths-to-masks",
    "Copy selected shape paths into masks on the source layer or selected target layers.",
    {
      compName: z.string().optional().describe("Optional exact composition name. The composition must be active for selected-path workflows."),
      targetLayerMode: z.enum(["same_layer", "selected_layers"]).optional().describe("Where copied masks should be created."),
      layerNames: z.array(z.string()).optional().describe("Optional exact target layer names when targetLayerMode is selected_layers."),
      useSelectedLayers: z.boolean().optional().describe("When true and targetLayerMode is selected_layers, use the selected layers as destinations."),
      maskMode: z.enum(["add", "subtract", "intersect", "none"]).optional().describe("Mask mode for created masks.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("copyPathsToMasks", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "COPY_PATHS_TO_MASKS_FAILED", "Failed to queue copy-paths-to-masks."),
          true
        );
      }
    }
  );

  server.tool(
    "setup-typewriter-text",
    "Apply a typewriter setup to a target text layer using a reusable controller.",
    {
      compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
      layerName: z.string().optional().describe("Optional exact text layer name."),
      useSelectedLayer: z.boolean().optional().describe("When true, use the single selected text layer in the active comp."),
      speed: z.number().optional().describe("Characters per second."),
      blinkSpeed: z.number().optional().describe("Cursor blink speed."),
      startAt: z.number().optional().describe("Delay before typing starts in seconds."),
      blinkOn: z.boolean().optional().describe("Whether to show the blinking cursor."),
      controllerName: z.string().optional().describe("Controller layer name. Defaults to CTRL_Typewriter.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("setupTypewriterText", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SETUP_TYPEWRITER_TEXT_FAILED", "Failed to queue setup-typewriter-text."),
          true
        );
      }
    }
  );

  server.tool(
    "create-timer-rig",
    "Create a timer text rig with built-in controls.",
    {
      compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
      mode: z.enum(["countup", "countdown"]).optional().describe("Whether the timer counts up or down."),
      timeFormat: z.enum(["HH:MM:SS", "MM:SS", "SS"]).optional().describe("How the timer should be displayed."),
      rate: z.number().optional().describe("Playback rate multiplier."),
      startHours: z.number().optional().describe("Starting hours."),
      startMinutes: z.number().optional().describe("Starting minutes."),
      startSeconds: z.number().optional().describe("Starting seconds."),
      showMilliseconds: z.boolean().optional().describe("Whether to include milliseconds."),
      allowNegativeTime: z.boolean().optional().describe("Whether to prefix negative time with a minus sign."),
      layerName: z.string().optional().describe("Name of the created timer layer.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("createTimerRig", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "CREATE_TIMER_RIG_FAILED", "Failed to queue create-timer-rig."),
          true
        );
      }
    }
  );

  server.tool(
    "apply-bw-tint",
    "Apply a reusable BW tint effect setup to selected or named layers.",
    {
      compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
      layerNames: z.array(z.string()).optional().describe("Optional exact layer names to tint."),
      useSelectedLayers: z.boolean().optional().describe("When true, use the selected layers in the active composition."),
      amount: z.number().optional().describe("Tint amount from 0 to 100."),
      presetName: z.enum(["Neutral", "Warm", "Gold", "Orange", "Sepia", "Cool", "Teal"]).optional().describe("Named tint preset."),
      hexColor: z.string().optional().describe("Optional custom tint color in #RRGGBB or #RGB format."),
      whiteishAmount: z.number().optional().describe("How much to push the tint toward white, from 0 to 100."),
      skipLocked: z.boolean().optional().describe("Skip locked layers instead of modifying them.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("applyBwTint", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "APPLY_BW_TINT_FAILED", "Failed to queue apply-bw-tint."),
          true
        );
      }
    }
  );

  server.tool(
    "cleanup-keyframes",
    "Clean up selected keyframes in the active composition.",
    {
      mode: z.enum(["remove_odd", "remove_even", "remove_duplicates", "remove_unnecessary"]).optional().describe("Cleanup mode to apply."),
      dryRun: z.boolean().optional().describe("When true, only preview removals without deleting keys."),
      keepFirst: z.boolean().optional().describe("Preserve the first keyframe on each property."),
      keepLast: z.boolean().optional().describe("Preserve the last keyframe on each property."),
      tolerance: z.number().optional().describe("Tolerance used for duplicate or unnecessary value comparisons.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("cleanupKeyframes", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "CLEANUP_KEYFRAMES_FAILED", "Failed to queue cleanup-keyframes."),
          true
        );
      }
    }
  );

  server.tool(
    "setup-retiming-mode",
    "Apply a retiming dropdown and expression to selected properties in the active composition.",
    {
      controllerName: z.string().optional().describe("Effect control name for the retiming dropdown."),
      defaultMode: z.enum(["comp_end", "comp_stretched", "layer_end", "layer_stretched"]).optional().describe("Default retiming mode to select in the dropdown.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("setupRetimingMode", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "SETUP_RETIMING_MODE_FAILED", "Failed to queue setup-retiming-mode."),
          true
        );
      }
    }
  );

  server.tool(
    "create-dropdown-controller",
    "Create or reuse a null controller layer with a dropdown menu.",
    {
      compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
      controllerName: z.string().optional().describe("Name of the null controller layer."),
      dropdownName: z.string().optional().describe("Name of the dropdown effect."),
      menuItems: z.array(z.string()).min(1).optional().describe("Menu items for the dropdown control."),
      selectedIndex: z.number().int().positive().optional().describe("Initially selected dropdown item (1-based)."),
      reuseIfExists: z.boolean().optional().describe("Reuse an existing controller layer when present.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const commandId = await queueBridgeCommand("createDropdownController", parameters);
        return {
          content: [
            {
              type: "text",
              text: `${describeQueuedCommand("createDropdownController", commandId)}\nUse the "get-results" tool after a few seconds to check for confirmation.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error queuing create-dropdown-controller command: ${String(error)}`
            }
          ],
          isError: true
        };
      }
    }
  );

  server.tool(
    "link-opacity-to-dropdown",
    "Link selected or named layers to a dropdown controller by opacity expression.",
    {
      compName: z.string().optional().describe("Optional exact composition name. Defaults to active composition."),
      controllerName: z.string().optional().describe("Name of the controller layer."),
      dropdownName: z.string().optional().describe("Name of the dropdown effect."),
      layerNames: z.array(z.string()).optional().describe("Optional exact layer names to link."),
      useSelectedLayers: z.boolean().optional().describe("When true, use the selected layers in the active composition."),
      mappingMode: z.enum(["exclusive", "threshold"]).optional().describe("Opacity mapping mode for the dropdown values.")
    },
    async (parameters: Record<string, unknown>) => {
      try {
        const payload = await queueMutationWithSafety("linkOpacityToDropdown", parameters, {}, safetyRoutingDependencies);
        return formatToolPayload(payload);
      } catch (error) {
        return formatToolPayload(
          buildStructuredSafetyError(error, "LINK_OPACITY_TO_DROPDOWN_FAILED", "Failed to queue link-opacity-to-dropdown."),
          true
        );
      }
    }
  );
}
