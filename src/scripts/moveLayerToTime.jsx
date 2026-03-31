function moveLayerToTime(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var startTime = args.startTime !== undefined ? args.startTime : 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.startTime = startTime;
        return JSON.stringify({
            status: "success", message: "Layer moved to time " + startTime,
            layer: { name: layer.name, index: layer.index, startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
