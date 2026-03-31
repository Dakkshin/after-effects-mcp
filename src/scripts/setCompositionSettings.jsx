function setCompositionSettings(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var changed = [];
        if (args.name !== undefined) { comp.name = args.name; changed.push("name"); }
        if (args.width !== undefined) { comp.width = args.width; changed.push("width"); }
        if (args.height !== undefined) { comp.height = args.height; changed.push("height"); }
        if (args.frameRate !== undefined) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.duration !== undefined) { comp.duration = args.duration; changed.push("duration"); }
        if (args.pixelAspect !== undefined) { comp.pixelAspect = args.pixelAspect; changed.push("pixelAspect"); }
        if (args.bgColor !== undefined) {
            var bg = args.bgColor;
            comp.bgColor = [bg.r !== undefined ? bg.r : bg[0], bg.g !== undefined ? bg.g : bg[1], bg.b !== undefined ? bg.b : bg[2]];
            changed.push("bgColor");
        }
        return JSON.stringify({
            status: "success", message: "Composition settings updated: " + changed.join(", "),
            composition: { name: comp.name, width: comp.width, height: comp.height, frameRate: comp.frameRate, duration: comp.duration, pixelAspect: comp.pixelAspect }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
