function createNullObject(args) {
    try {
        var compIndex = args.compIndex || 1;
        var name = args.name || "Null";
        var startTime = args.startTime || 0;
        var duration = args.duration || 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var nullLayer = comp.layers.addNull(duration || comp.duration);
        nullLayer.name = name;
        nullLayer.startTime = startTime;
        return JSON.stringify({
            status: "success", message: "Null object created",
            layer: { name: nullLayer.name, index: nullLayer.index, inPoint: nullLayer.inPoint, outPoint: nullLayer.outPoint }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
