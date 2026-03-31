function alignLayers(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndices = args.layerIndices || [];
        var alignTo = args.alignTo || "compHCenter";
        if (layerIndices.length === 0) throw new Error("layerIndices array is required and must not be empty");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layers = [];
        for (var i = 0; i < layerIndices.length; i++) {
            var layer = comp.layer(layerIndices[i]);
            if (!layer) throw new Error("Layer not found at index " + layerIndices[i]);
            layers.push(layer);
        }
        var compW = comp.width;
        var compH = comp.height;
        // Get bounding info from first layer for relative alignments
        var refPos = layers[0].property("Position").value;
        var changed = [];
        for (var j = 0; j < layers.length; j++) {
            var pos = layers[j].property("Position").value;
            var newX = pos[0];
            var newY = pos[1];
            if (alignTo === "compLeft") { newX = 0; }
            else if (alignTo === "compRight") { newX = compW; }
            else if (alignTo === "compTop") { newY = 0; }
            else if (alignTo === "compBottom") { newY = compH; }
            else if (alignTo === "compHCenter") { newX = compW / 2; }
            else if (alignTo === "compVCenter") { newY = compH / 2; }
            else if (alignTo === "left") { newX = refPos[0]; }
            else if (alignTo === "right") { newX = refPos[0]; }
            else if (alignTo === "top") { newY = refPos[1]; }
            else if (alignTo === "bottom") { newY = refPos[1]; }
            else if (alignTo === "horizontalCenter") { newX = refPos[0]; }
            else if (alignTo === "verticalCenter") { newY = refPos[1]; }
            var newPos = pos.length === 3 ? [newX, newY, pos[2]] : [newX, newY];
            layers[j].property("Position").setValue(newPos);
            changed.push({ name: layers[j].name, index: layers[j].index, newPosition: newPos });
        }
        return JSON.stringify({
            status: "success", message: "Layers aligned to " + alignTo,
            alignedLayers: changed
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
