function duplicateComposition(args) {
    try {
        var compIndex = args.compIndex || 1;
        var newName = args.newName;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var newComp = comp.duplicate();
        if (newName) newComp.name = newName;
        return JSON.stringify({
            status: "success", message: "Composition duplicated",
            newComp: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, duration: newComp.duration, frameRate: newComp.frameRate, numLayers: newComp.numLayers }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
