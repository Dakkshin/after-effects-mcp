function enableTimeRemap(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.timeRemapEnabled = true;
        return JSON.stringify({
            status: "success", message: "Time remap enabled",
            layer: { name: layer.name, index: layer.index, timeRemapEnabled: layer.timeRemapEnabled }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
