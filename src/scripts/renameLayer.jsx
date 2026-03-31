function renameLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var newName = args.newName || "Layer";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var oldName = layer.name;
        layer.name = newName;
        return JSON.stringify({
            status: "success", message: "Layer renamed from '" + oldName + "' to '" + newName + "'",
            layer: { name: layer.name, index: layer.index }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
