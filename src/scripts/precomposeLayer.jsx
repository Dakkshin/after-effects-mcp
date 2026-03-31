function precomposeLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndices = args.layerIndices || [1];
        var newCompName = args.newCompName || "Precomp";
        var moveAllAttributes = args.moveAllAttributes !== undefined ? args.moveAllAttributes : true;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        // Build array (1-based)
        var indices = [];
        for (var i = 0; i < layerIndices.length; i++) {
            indices.push(layerIndices[i]);
        }
        var newComp = comp.layers.precompose(indices, newCompName, moveAllAttributes);
        return JSON.stringify({
            status: "success", message: "Precomposed " + indices.length + " layer(s) into '" + newCompName + "'",
            newComp: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, duration: newComp.duration }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
