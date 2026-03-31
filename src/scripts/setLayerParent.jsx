function setLayerParent(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var parentLayerIndex = args.parentLayerIndex !== undefined ? args.parentLayerIndex : 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (parentLayerIndex === 0 || parentLayerIndex === null) {
            layer.parent = null;
            return JSON.stringify({ status: "success", message: "Layer parent cleared", layer: { name: layer.name, index: layer.index, parent: null } }, null, 2);
        } else {
            var parentLayer = comp.layer(parentLayerIndex);
            if (!parentLayer) throw new Error("Parent layer not found at index " + parentLayerIndex);
            layer.parent = parentLayer;
            return JSON.stringify({
                status: "success", message: "Layer parent set",
                layer: { name: layer.name, index: layer.index, parent: { name: parentLayer.name, index: parentLayer.index } }
            }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
