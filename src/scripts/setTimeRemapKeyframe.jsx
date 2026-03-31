function setTimeRemapKeyframe(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var timeInSeconds = args.timeInSeconds !== undefined ? args.timeInSeconds : 0;
        var remapValue = args.remapValue !== undefined ? args.remapValue : 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (!layer.timeRemapEnabled) {
            layer.timeRemapEnabled = true;
        }
        var timeRemap = layer.property("Time Remap");
        if (!timeRemap) throw new Error("Time Remap property not found");
        timeRemap.setValueAtTime(timeInSeconds, remapValue);
        return JSON.stringify({
            status: "success", message: "Time remap keyframe set at " + timeInSeconds + "s to " + remapValue,
            timeInSeconds: timeInSeconds, remapValue: remapValue
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
