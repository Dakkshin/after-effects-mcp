function addToRenderQueue(args) {
    try {
        var compIndex = args.compIndex || 1;
        var outputPath = args.outputPath;
        var outputModuleTemplate = args.outputModuleTemplate || "Lossless";
        var renderSettingsTemplate = args.renderSettingsTemplate || "Best Settings";
        if (!outputPath) throw new Error("outputPath is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var rqItem = app.project.renderQueue.items.add(comp);
        try { rqItem.applyTemplate(renderSettingsTemplate); } catch (e) { /* use defaults if template not found */ }
        var om = rqItem.outputModule(1);
        try { om.applyTemplate(outputModuleTemplate); } catch (e) { /* use defaults if template not found */ }
        om.file = new File(outputPath);
        return JSON.stringify({
            status: "success", message: "Added to render queue",
            renderQueueItem: { index: rqItem.index, outputPath: outputPath, comp: comp.name }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
