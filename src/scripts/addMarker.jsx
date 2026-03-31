function addMarker(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex;
        var time = args.time !== undefined ? args.time : 0;
        var label = args.label || "";
        var comment = args.comment || "";
        var duration = args.duration || 0;
        var url = args.url || "";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var mv = new MarkerValue(comment);
        if (duration > 0) mv.duration = duration;
        if (url) mv.url = url;
        if (layerIndex && layerIndex > 0) {
            var layer = comp.layer(layerIndex);
            if (!layer) throw new Error("Layer not found at index " + layerIndex);
            layer.property("Marker").setValueAtTime(time, mv);
            return JSON.stringify({ status: "success", message: "Layer marker added at time " + time, markerType: "layer", time: time, comment: comment }, null, 2);
        } else {
            comp.markerProperty.setValueAtTime(time, mv);
            return JSON.stringify({ status: "success", message: "Composition marker added at time " + time, markerType: "composition", time: time, comment: comment }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
