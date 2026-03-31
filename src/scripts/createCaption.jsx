function createCaption(args) {
    try {
        var compIndex = args.compIndex || 1;
        var text = args.text || "Caption";
        var startTime = args.startTime !== undefined ? args.startTime : 0;
        var endTime = args.endTime !== undefined ? args.endTime : startTime + 3;
        var style = args.style || "lower-third";
        var fontSize = args.fontSize || 36;
        var color = args.color || [1, 1, 1];
        var fontFamily = args.fontFamily || "Arial";
        var backgroundColor = args.backgroundColor;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        // Calculate position based on style
        var posX = comp.width / 2;
        var posY;
        if (style === "lower-third") {
            posY = comp.height * 0.8;
        } else if (style === "upper-third") {
            posY = comp.height * 0.15;
        } else if (style === "center") {
            posY = comp.height / 2;
        } else {
            posY = comp.height * 0.8;
        }
        // Add background solid if backgroundColor provided
        if (backgroundColor) {
            var bgColor = [backgroundColor.r || 0, backgroundColor.g || 0, backgroundColor.b || 0];
            var bgOpacity = backgroundColor.opacity !== undefined ? backgroundColor.opacity : 70;
            var bgWidth = comp.width;
            var bgHeight = Math.round(fontSize * 2);
            var bgSolid = comp.layers.addSolid(bgColor, "Caption BG", bgWidth, bgHeight, 1);
            bgSolid.property("Position").setValue([posX, posY]);
            bgSolid.startTime = startTime;
            bgSolid.outPoint = endTime;
            bgSolid.property("Opacity").setValue(bgOpacity);
        }
        var textLayer = comp.layers.addText(text);
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        textDocument.justification = ParagraphJustification.CENTER_JUSTIFY;
        textProp.setValue(textDocument);
        textLayer.property("Position").setValue([posX, posY]);
        textLayer.startTime = startTime;
        textLayer.outPoint = endTime;
        textLayer.name = "Caption: " + text.substring(0, 20);
        return JSON.stringify({
            status: "success", message: "Caption created",
            layer: { name: textLayer.name, index: textLayer.index, position: [posX, posY], startTime: startTime, endTime: endTime, style: style }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
