function getRendererInfo(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var renderers = [];
        try {
            var rendererList = comp.renderers;
            for (var i = 0; i < rendererList.length; i++) {
                renderers.push(rendererList[i]);
            }
        } catch (e) {
            // Fallback: known renderer names
            renderers = ["ADBE Ernst", "ADBE Advanced 3d"];
        }
        return JSON.stringify({
            status: "success",
            message: "Renderer info retrieved",
            currentRenderer: comp.renderer,
            availableRenderers: renderers,
            rendererDescriptions: {
                "ADBE Ernst": "Classic 3D renderer",
                "ADBE Advanced 3d": "Cinema 4D / Advanced 3D renderer"
            }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
