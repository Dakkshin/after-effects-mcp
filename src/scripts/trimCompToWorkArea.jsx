function trimCompToWorkArea(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var waStart = comp.workAreaStart;
        var waDuration = comp.workAreaDuration;
        // Shift layers if work area doesn't start at 0
        if (waStart > 0) {
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                layer.startTime = layer.startTime - waStart;
            }
        }
        comp.duration = waDuration;
        comp.workAreaStart = 0;
        return JSON.stringify({
            status: "success", message: "Composition trimmed to work area",
            composition: { name: comp.name, duration: comp.duration, workAreaStart: comp.workAreaStart, workAreaDuration: comp.workAreaDuration }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
