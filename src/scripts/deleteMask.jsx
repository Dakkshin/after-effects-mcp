function deleteMask(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var maskIndex = args.maskIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var maskGroup = layer.property("Masks");
        var mask = maskGroup.property(maskIndex);
        if (!mask) throw new Error("Mask not found at index " + maskIndex);
        mask.remove();
        return JSON.stringify({ status: "success", message: "Mask " + maskIndex + " deleted" }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
