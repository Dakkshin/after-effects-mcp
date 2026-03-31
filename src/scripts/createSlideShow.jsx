function createSlideShow(args) {
    try {
        var compIndex = args.compIndex || 1;
        var imagePaths = args.imagePaths || [];
        var durationPerSlide = args.durationPerSlide !== undefined ? args.durationPerSlide : 3;
        var transition = args.transition || "cut";
        var transitionDuration = args.transitionDuration !== undefined ? args.transitionDuration : 0.5;
        if (imagePaths.length === 0) throw new Error("imagePaths is required and must not be empty");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layers = [];
        for (var i = 0; i < imagePaths.length; i++) {
            var file = new File(imagePaths[i]);
            if (!file.exists) { throw new Error("Image file not found: " + imagePaths[i]); }
            var importOptions = new ImportOptions(file);
            var footageItem = app.project.importFile(importOptions);
            var slideStart = i * durationPerSlide;
            var slideEnd = slideStart + durationPerSlide;
            var footageLayer = comp.layers.add(footageItem);
            footageLayer.startTime = slideStart;
            footageLayer.outPoint = slideEnd;
            // Scale to fit comp
            var scaleX = (comp.width / footageLayer.width) * 100;
            var scaleY = (comp.height / footageLayer.height) * 100;
            var scale = Math.min(scaleX, scaleY);
            footageLayer.property("Scale").setValue([scale, scale]);
            footageLayer.property("Position").setValue([comp.width / 2, comp.height / 2]);
            // Apply transitions
            if (transition === "fade" && i > 0) {
                var opacityProp = footageLayer.property("Opacity");
                opacityProp.setValueAtTime(slideStart, 0);
                opacityProp.setValueAtTime(slideStart + transitionDuration, 100);
                opacityProp.setValueAtTime(slideEnd - transitionDuration, 100);
                opacityProp.setValueAtTime(slideEnd, 0);
            } else if (transition === "zoom") {
                var scaleProp = footageLayer.property("Scale");
                scaleProp.setValueAtTime(slideStart, [scale * 0.9, scale * 0.9]);
                scaleProp.setValueAtTime(slideEnd, [scale * 1.1, scale * 1.1]);
            }
            layers.push({ name: footageLayer.name, index: footageLayer.index, start: slideStart, end: slideEnd });
        }
        return JSON.stringify({
            status: "success", message: "Slideshow created with " + layers.length + " slides",
            totalDuration: imagePaths.length * durationPerSlide, transition: transition, layers: layers
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
