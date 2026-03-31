function setEffectParam(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var effectName = args.effectName;
        var paramName = args.paramName;
        var value = args.value;
        if (!effectName) throw new Error("effectName is required");
        if (!paramName) throw new Error("paramName is required");
        if (value === undefined) throw new Error("value is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var effects = layer.property("Effects");
        if (!effects) throw new Error("No effects on this layer");
        var effect = null;
        for (var i = 1; i <= effects.numProperties; i++) {
            if (effects.property(i).name === effectName) {
                effect = effects.property(i);
                break;
            }
        }
        if (!effect) throw new Error("Effect not found: " + effectName);
        var param = null;
        try { param = effect.property(paramName); } catch (e) { /* try by name */ }
        if (!param) {
            for (var j = 1; j <= effect.numProperties; j++) {
                if (effect.property(j).name === paramName) {
                    param = effect.property(j);
                    break;
                }
            }
        }
        if (!param) throw new Error("Parameter not found: " + paramName);
        param.setValue(value);
        return JSON.stringify({
            status: "success", message: "Effect parameter set: " + paramName + " = " + JSON.stringify(value),
            effect: effectName, param: paramName, value: value
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
