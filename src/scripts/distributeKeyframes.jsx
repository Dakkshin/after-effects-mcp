function distributeKeyframes(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var propertyName = args.propertyName;
        var values = args.values || [];
        var times = args.times || [];
        var interpolationType = args.interpolationType || "linear";
        if (!propertyName) throw new Error("propertyName is required");
        if (values.length === 0) throw new Error("values array is required");
        if (times.length === 0) throw new Error("times array is required");
        if (values.length !== times.length) throw new Error("values and times arrays must have the same length");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        // Try to find property in Transform group or directly
        var prop = null;
        var transform = layer.property("Transform");
        if (transform) {
            try { prop = transform.property(propertyName); } catch (e) { prop = null; }
        }
        if (!prop) {
            try { prop = layer.property(propertyName); } catch (e) { prop = null; }
        }
        if (!prop) throw new Error("Property not found: " + propertyName);
        var addedKeys = [];
        for (var i = 0; i < times.length; i++) {
            prop.setValueAtTime(times[i], values[i]);
            addedKeys.push({ time: times[i], value: values[i] });
        }
        // Apply interpolation type
        if (interpolationType === "hold") {
            for (var k = 1; k <= prop.numKeys; k++) {
                try { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD); } catch (e) { /* ignore */ }
            }
        } else if (interpolationType === "easy-ease") {
            for (var k2 = 1; k2 <= prop.numKeys; k2++) {
                try {
                    var ease = [new KeyframeEase(33, 33)];
                    prop.setTemporalEaseAtKey(k2, ease, ease);
                } catch (e) { /* ignore */ }
            }
        }
        // Linear is the default, no action needed
        return JSON.stringify({
            status: "success", message: "Added " + addedKeys.length + " keyframes to " + propertyName,
            propertyName: propertyName, keyframes: addedKeys, interpolationType: interpolationType
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
