function setLayerBlendMode(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var blendModeStr = args.blendMode || "NORMAL";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var blendModeMap = {
            "NORMAL": BlendingMode.NORMAL,
            "DISSOLVE": BlendingMode.DISSOLVE,
            "DANCING_DISSOLVE": BlendingMode.DANCING_DISSOLVE,
            "DARKEN": BlendingMode.DARKEN,
            "MULTIPLY": BlendingMode.MULTIPLY,
            "COLOR_BURN": BlendingMode.COLOR_BURN,
            "CLASSIC_COLOR_BURN": BlendingMode.CLASSIC_COLOR_BURN,
            "LINEAR_BURN": BlendingMode.LINEAR_BURN,
            "DARKER_COLOR": BlendingMode.DARKER_COLOR,
            "ADD": BlendingMode.ADD,
            "LIGHTEN": BlendingMode.LIGHTEN,
            "SCREEN": BlendingMode.SCREEN,
            "COLOR_DODGE": BlendingMode.COLOR_DODGE,
            "CLASSIC_COLOR_DODGE": BlendingMode.CLASSIC_COLOR_DODGE,
            "LINEAR_DODGE": BlendingMode.LINEAR_DODGE,
            "LIGHTER_COLOR": BlendingMode.LIGHTER_COLOR,
            "OVERLAY": BlendingMode.OVERLAY,
            "SOFT_LIGHT": BlendingMode.SOFT_LIGHT,
            "HARD_LIGHT": BlendingMode.HARD_LIGHT,
            "LINEAR_LIGHT": BlendingMode.LINEAR_LIGHT,
            "VIVID_LIGHT": BlendingMode.VIVID_LIGHT,
            "PIN_LIGHT": BlendingMode.PIN_LIGHT,
            "HARD_MIX": BlendingMode.HARD_MIX,
            "DIFFERENCE": BlendingMode.DIFFERENCE,
            "CLASSIC_DIFFERENCE": BlendingMode.CLASSIC_DIFFERENCE,
            "EXCLUSION": BlendingMode.EXCLUSION,
            "HUE": BlendingMode.HUE,
            "SATURATION": BlendingMode.SATURATION,
            "COLOR": BlendingMode.COLOR,
            "LUMINOSITY": BlendingMode.LUMINOSITY,
            "STENCIL_ALPHA": BlendingMode.STENCIL_ALPHA,
            "STENCIL_LUMA": BlendingMode.STENCIL_LUMA,
            "SILHOUETTE_ALPHA": BlendingMode.SILHOUETTE_ALPHA,
            "SILHOUETTE_LUMA": BlendingMode.SILHOUETTE_LUMA,
            "ALPHA_ADD": BlendingMode.ALPHA_ADD,
            "LUMINESCENT_PREMUL": BlendingMode.LUMINESCENT_PREMUL
        };
        var mode = blendModeMap[blendModeStr.toUpperCase()];
        if (mode === undefined) throw new Error("Unknown blend mode: " + blendModeStr);
        layer.blendingMode = mode;
        return JSON.stringify({
            status: "success", message: "Blend mode set to " + blendModeStr,
            layer: { name: layer.name, index: layer.index, blendMode: blendModeStr }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
