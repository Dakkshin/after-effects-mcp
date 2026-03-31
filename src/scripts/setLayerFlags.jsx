function setLayerFlags(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var flags = args.flags || {};
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var changed = [];
        if (flags.solo !== undefined) { layer.solo = flags.solo; changed.push("solo=" + flags.solo); }
        if (flags.shy !== undefined) { layer.shy = flags.shy; changed.push("shy=" + flags.shy); }
        if (flags.locked !== undefined) { layer.locked = flags.locked; changed.push("locked=" + flags.locked); }
        if (flags.motionBlur !== undefined) { layer.motionBlur = flags.motionBlur; changed.push("motionBlur=" + flags.motionBlur); }
        if (flags.enable3D !== undefined) { layer.threeDLayer = flags.enable3D; changed.push("threeDLayer=" + flags.enable3D); }
        if (flags.adjustmentLayer !== undefined) { layer.adjustmentLayer = flags.adjustmentLayer; changed.push("adjustmentLayer=" + flags.adjustmentLayer); }
        if (flags.collapseTransformation !== undefined) { layer.collapseTransformation = flags.collapseTransformation; changed.push("collapseTransformation=" + flags.collapseTransformation); }
        if (flags.frameBlending !== undefined) { layer.frameBlending = flags.frameBlending; changed.push("frameBlending=" + flags.frameBlending); }
        if (flags.frameBlendingType !== undefined) {
            var fbTypeMap = { "FRAME_MIX": FrameBlendingType.FRAME_MIX, "PIXEL_MOTION": FrameBlendingType.PIXEL_MOTION };
            var fbType = fbTypeMap[flags.frameBlendingType];
            if (fbType !== undefined) { layer.frameBlendingType = fbType; changed.push("frameBlendingType=" + flags.frameBlendingType); }
        }
        return JSON.stringify({
            status: "success", message: "Layer flags updated: " + changed.join(", "),
            layer: { name: layer.name, index: layer.index, changed: changed }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
