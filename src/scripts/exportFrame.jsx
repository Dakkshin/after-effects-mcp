function exportFrame(args) {
    try {
        var compIndex = args.compIndex || 1;
        var timeInSeconds = args.timeInSeconds !== undefined ? args.timeInSeconds : 0;
        var outputPath = args.outputPath;
        if (!outputPath) throw new Error("outputPath is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.timeSpanStart = timeInSeconds;
        rqItem.timeSpanDuration = 1 / comp.frameRate;
        var om = rqItem.outputModule(1);
        om.file = new File(outputPath);
        try { om.format = "PNG"; } catch (e) { /* format may already be set */ }
        // Apply PNG output module settings
        try {
            om.applyTemplate("PNG Sequence");
        } catch (e) {
            // ignore if template not available
        }
        om.file = new File(outputPath);
        app.project.renderQueue.render();
        rqItem.remove();
        return JSON.stringify({ status: "success", message: "Frame exported to " + outputPath, outputPath: outputPath, time: timeInSeconds }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
