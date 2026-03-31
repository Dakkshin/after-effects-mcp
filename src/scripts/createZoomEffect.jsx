function createZoomEffect(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var startTime = args.startTime !== undefined ? args.startTime : 0;
        var endTime = args.endTime !== undefined ? args.endTime : 1;
        var zoomFrom = args.zoomFrom !== undefined ? args.zoomFrom : 100;
        var zoomTo = args.zoomTo !== undefined ? args.zoomTo : 120;
        var easingType = args.easingType || "ease-in-out";
        var anchorPoint = args.anchorPoint;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var scaleProp = layer.property("Transform").property("Scale");
        if (!scaleProp) throw new Error("Scale property not found");
        // Set anchor point if specified
        if (anchorPoint) {
            var apProp = layer.property("Transform").property("Anchor Point");
            if (apProp) apProp.setValue(anchorPoint);
        }
        // Set scale keyframes
        scaleProp.setValueAtTime(startTime, [zoomFrom, zoomFrom]);
        scaleProp.setValueAtTime(endTime, [zoomTo, zoomTo]);
        // Apply easing
        var numKeys = scaleProp.numKeys;
        if (numKeys >= 2) {
            var easeIn, easeOut;
            if (easingType === "ease-in-out") {
                easeIn = [new KeyframeEase(33, 33)];
                easeOut = [new KeyframeEase(33, 33)];
                scaleProp.setTemporalEaseAtKey(numKeys - 1, easeIn, easeOut);
                scaleProp.setTemporalEaseAtKey(numKeys, easeIn, easeOut);
            } else if (easingType === "ease-in") {
                easeIn = [new KeyframeEase(0, 33)];
                easeOut = [new KeyframeEase(33, 33)];
                scaleProp.setTemporalEaseAtKey(numKeys - 1, easeIn, easeOut);
            } else if (easingType === "ease-out") {
                easeIn = [new KeyframeEase(33, 33)];
                easeOut = [new KeyframeEase(33, 0)];
                scaleProp.setTemporalEaseAtKey(numKeys, easeIn, easeOut);
            }
        }
        return JSON.stringify({
            status: "success", message: "Zoom effect created from " + zoomFrom + "% to " + zoomTo + "%",
            layer: { name: layer.name, index: layer.index, zoomFrom: zoomFrom, zoomTo: zoomTo, startTime: startTime, endTime: endTime, easingType: easingType }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
