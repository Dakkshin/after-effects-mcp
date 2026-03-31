function setWorkArea(args) {
    try {
        var compIndex = args.compIndex || 1;
        var workAreaStart = args.workAreaStart !== undefined ? args.workAreaStart : 0;
        var workAreaDuration = args.workAreaDuration;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        comp.workAreaStart = workAreaStart;
        if (workAreaDuration !== undefined && workAreaDuration !== null) {
            comp.workAreaDuration = workAreaDuration;
        }
        return JSON.stringify({
            status: "success", message: "Work area set",
            workArea: { start: comp.workAreaStart, duration: comp.workAreaDuration, end: comp.workAreaStart + comp.workAreaDuration }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
