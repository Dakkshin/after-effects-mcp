function getCompFrame(args) {
    try {
        var compIndex = args.compIndex || 1;
        var timeInSeconds = args.timeInSeconds !== undefined ? args.timeInSeconds : 0;
        var outputDir = args.outputDir;
        if (!outputDir) {
            var userFolder = Folder.myDocuments;
            outputDir = userFolder.fsName + "/ae-mcp-bridge/frames";
        }
        // Ensure output directory exists
        var outFolder = new Folder(outputDir);
        if (!outFolder.exists) outFolder.create();
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        // Generate filename from comp name and time
        var safeName = comp.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        var frameNum = Math.round(timeInSeconds * comp.frameRate);
        var outputPath = outputDir + "/" + safeName + "_frame_" + frameNum + ".png";
        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.timeSpanStart = timeInSeconds;
        rqItem.timeSpanDuration = 1 / comp.frameRate;
        var om = rqItem.outputModule(1);
        om.file = new File(outputPath);
        try { om.applyTemplate("PNG Sequence"); } catch (e) { /* ignore */ }
        om.file = new File(outputPath);
        app.project.renderQueue.render();
        rqItem.remove();
        return JSON.stringify({ status: "success", message: "Frame saved to " + outputPath, outputPath: outputPath, time: timeInSeconds }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
