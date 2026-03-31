function duplicateLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var newLayer = layer.duplicate();
        return JSON.stringify({
            status: "success", message: "Layer duplicated",
            layer: { name: newLayer.name, index: newLayer.index, inPoint: newLayer.inPoint, outPoint: newLayer.outPoint }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
