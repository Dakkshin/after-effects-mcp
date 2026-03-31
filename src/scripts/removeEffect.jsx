function removeEffect(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var effectName = args.effectName;
        var effectIndex = args.effectIndex;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var effects = layer.property("Effects");
        if (!effects) throw new Error("No effects on this layer");
        var effect = null;
        if (effectIndex !== undefined && effectIndex !== null) {
            effect = effects.property(effectIndex);
        } else if (effectName) {
            for (var i = 1; i <= effects.numProperties; i++) {
                if (effects.property(i).name === effectName) {
                    effect = effects.property(i);
                    break;
                }
            }
        }
        if (!effect) throw new Error("Effect not found: " + (effectName || "index " + effectIndex));
        var removedName = effect.name;
        effect.remove();
        return JSON.stringify({ status: "success", message: "Effect removed: " + removedName }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
