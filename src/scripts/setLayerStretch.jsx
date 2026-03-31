function setLayerStretch(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var stretch = args.stretch !== undefined ? args.stretch : 100;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.stretch = stretch;
        return JSON.stringify({
            status: "success", message: "Layer stretch set to " + stretch + "%",
            layer: { name: layer.name, index: layer.index, stretch: layer.stretch }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
