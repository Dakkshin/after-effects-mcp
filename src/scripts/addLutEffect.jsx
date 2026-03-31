function addLutEffect(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var lutPath = args.lutPath;
        if (!lutPath) throw new Error("lutPath is required");
        var lutFile = new File(lutPath);
        if (!lutFile.exists) throw new Error("LUT file not found: " + lutPath);
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        // Apply the "Apply Color LUT" effect
        var effect = layer.property("Effects").addProperty("ADBE Apply Color LUT2");
        if (!effect) {
            // Fallback to older name
            effect = layer.property("Effects").addProperty("ADBE Apply Color LUT");
        }
        if (!effect) throw new Error("Could not add Apply Color LUT effect. Ensure it is available in your AE installation.");
        // Set the LUT file
        var lutFileProp = effect.property("LUT");
        if (!lutFileProp) {
            // Try alternate property names
            for (var i = 1; i <= effect.numProperties; i++) {
                var p = effect.property(i);
                if (p.name.toLowerCase().indexOf("lut") !== -1 || p.name.toLowerCase().indexOf("cube") !== -1) {
                    lutFileProp = p;
                    break;
                }
            }
        }
        if (lutFileProp) {
            lutFileProp.setValue(lutFile);
        }
        return JSON.stringify({
            status: "success", message: "LUT effect applied: " + lutPath,
            effect: { name: effect.name, matchName: effect.matchName }, lutPath: lutPath
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
