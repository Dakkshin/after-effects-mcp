function splitLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var splitTime = args.splitTime !== undefined ? args.splitTime : 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (splitTime <= layer.inPoint || splitTime >= layer.outPoint) {
            throw new Error("splitTime " + splitTime + " must be between layer inPoint " + layer.inPoint + " and outPoint " + layer.outPoint);
        }
        var origOutPoint = layer.outPoint;
        // Duplicate the layer
        var newLayer = layer.duplicate();
        // Trim original to split time
        layer.outPoint = splitTime;
        // Trim new layer to start at split time
        newLayer.inPoint = splitTime;
        newLayer.outPoint = origOutPoint;
        // Move new layer below original
        newLayer.moveAfter(layer);
        return JSON.stringify({
            status: "success", message: "Layer split at " + splitTime,
            originalLayer: { name: layer.name, index: layer.index, inPoint: layer.inPoint, outPoint: layer.outPoint },
            newLayer: { name: newLayer.name, index: newLayer.index, inPoint: newLayer.inPoint, outPoint: newLayer.outPoint }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
