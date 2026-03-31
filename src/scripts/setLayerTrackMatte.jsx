function setLayerTrackMatte(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var matteTypeStr = args.matteType || "NONE";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var matteMap = {
            "NONE": TrackMatteType.NO_TRACK_MATTE,
            "ALPHA": TrackMatteType.ALPHA,
            "ALPHA_INVERTED": TrackMatteType.ALPHA_INVERTED,
            "LUMA": TrackMatteType.LUMA,
            "LUMA_INVERTED": TrackMatteType.LUMA_INVERTED
        };
        var matteType = matteMap[matteTypeStr.toUpperCase()];
        if (matteType === undefined) throw new Error("Unknown matte type: " + matteTypeStr);
        layer.trackMatteType = matteType;
        return JSON.stringify({
            status: "success", message: "Track matte set to " + matteTypeStr,
            layer: { name: layer.name, index: layer.index, matteType: matteTypeStr }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
