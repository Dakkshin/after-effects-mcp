function setRenderer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var renderer = args.renderer || "ADBE Ernst";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var oldRenderer = comp.renderer;
        comp.renderer = renderer;
        return JSON.stringify({
            status: "success", message: "Renderer set from '" + oldRenderer + "' to '" + renderer + "'",
            composition: { name: comp.name, renderer: comp.renderer }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
