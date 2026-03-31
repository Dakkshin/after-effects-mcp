function addMask(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var maskShape = args.maskShape || "rectangle";
        var vertices = args.vertices || [];
        var inverted = args.inverted !== undefined ? args.inverted : false;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var maskGroup = layer.property("Masks");
        var mask = maskGroup.addProperty("Mask");
        mask.inverted = inverted;
        var maskPath = mask.property("Mask Path");
        var shape = new Shape();
        var w = comp.width;
        var h = comp.height;
        if (maskShape === "rectangle") {
            shape.vertices = [[0, 0], [w, 0], [w, h], [0, h]];
            shape.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.closed = true;
        } else if (maskShape === "ellipse") {
            var cx = w / 2;
            var cy = h / 2;
            var rx = w / 2;
            var ry = h / 2;
            var k = 0.5522847498;
            shape.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
            shape.inTangents = [[-k * rx, 0], [0, -k * ry], [k * rx, 0], [0, k * ry]];
            shape.outTangents = [[k * rx, 0], [0, k * ry], [-k * rx, 0], [0, -k * ry]];
            shape.closed = true;
        } else if (maskShape === "freeform" && vertices.length >= 3) {
            var verts = [];
            var inTans = [];
            var outTans = [];
            for (var i = 0; i < vertices.length; i++) {
                verts.push([vertices[i][0], vertices[i][1]]);
                inTans.push([0, 0]);
                outTans.push([0, 0]);
            }
            shape.vertices = verts;
            shape.inTangents = inTans;
            shape.outTangents = outTans;
            shape.closed = true;
        } else {
            shape.vertices = [[0, 0], [w, 0], [w, h], [0, h]];
            shape.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.closed = true;
        }
        maskPath.setValue(shape);
        return JSON.stringify({
            status: "success", message: "Mask added",
            mask: { index: mask.propertyIndex, inverted: inverted, shape: maskShape }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
