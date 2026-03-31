function setMaskProperties(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var maskIndex = args.maskIndex || 1;
        var feather = args.feather;
        var opacity = args.opacity;
        var expansion = args.expansion;
        var inverted = args.inverted;
        var modeStr = args.mode;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var maskGroup = layer.property("Masks");
        var mask = maskGroup.property(maskIndex);
        if (!mask) throw new Error("Mask not found at index " + maskIndex);
        var changed = [];
        if (feather !== undefined && feather !== null) {
            var featherProp = mask.property("Mask Feather");
            if (featherProp) { featherProp.setValue(feather instanceof Array ? feather : [feather, feather]); changed.push("feather"); }
        }
        if (opacity !== undefined && opacity !== null) {
            var opacityProp = mask.property("Mask Opacity");
            if (opacityProp) { opacityProp.setValue(opacity); changed.push("opacity"); }
        }
        if (expansion !== undefined && expansion !== null) {
            var expansionProp = mask.property("Mask Expansion");
            if (expansionProp) { expansionProp.setValue(expansion); changed.push("expansion"); }
        }
        if (inverted !== undefined) { mask.inverted = inverted; changed.push("inverted"); }
        if (modeStr !== undefined) {
            var modeMap = {
                "NONE": MaskMode.NONE,
                "ADD": MaskMode.ADD,
                "SUBTRACT": MaskMode.SUBTRACT,
                "INTERSECT": MaskMode.INTERSECT,
                "LIGHTEN": MaskMode.LIGHTEN,
                "DARKEN": MaskMode.DARKEN,
                "DIFFERENCE": MaskMode.DIFFERENCE
            };
            var mode = modeMap[modeStr.toUpperCase()];
            if (mode !== undefined) { mask.maskMode = mode; changed.push("mode"); }
        }
        return JSON.stringify({
            status: "success", message: "Mask properties updated: " + changed.join(", "),
            mask: { index: maskIndex, changed: changed }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
