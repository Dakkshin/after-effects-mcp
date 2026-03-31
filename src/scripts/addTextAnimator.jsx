function addTextAnimator(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var animatorType = args.animatorType || "opacity";
        var rangeStart = args.rangeStart !== undefined ? args.rangeStart : 0;
        var rangeEnd = args.rangeEnd !== undefined ? args.rangeEnd : 100;
        var value = args.value;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (!(layer instanceof TextLayer)) throw new Error("Layer is not a text layer");
        var textProps = layer.property("Text");
        var animators = textProps.property("Animators");
        var animator = animators.addProperty("ADBE Text Animator");
        // Add range selector
        var selectors = animator.property("Selector");
        if (!selectors || selectors.numProperties === 0) {
            animator.property("Selector").addProperty("ADBE Text Selector");
        }
        var selector = animator.property("Selector").property(1);
        if (selector) {
            var startProp = selector.property("Start");
            var endProp = selector.property("End");
            if (startProp) startProp.setValue(rangeStart);
            if (endProp) endProp.setValue(rangeEnd);
        }
        // Add animator property based on type
        var animProps = animator.property("Animator Properties");
        var typeMap = {
            "opacity": "ADBE Text Opacity",
            "position": "ADBE Text Position",
            "scale": "ADBE Text Scale",
            "rotation": "ADBE Text Rotation",
            "fill_color": "ADBE Text Fill Color",
            "character_offset": "ADBE Text Character Change Type",
            "blur": "ADBE Text Blur"
        };
        var propMatchName = typeMap[animatorType.toLowerCase()] || "ADBE Text Opacity";
        var animProp = animProps.addProperty(propMatchName);
        if (animProp && value !== undefined) {
            try { animProp.setValue(value); } catch (e) { /* value may not be directly settable */ }
        }
        return JSON.stringify({
            status: "success", message: "Text animator added: " + animatorType,
            animator: { type: animatorType, rangeStart: rangeStart, rangeEnd: rangeEnd, value: value }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
