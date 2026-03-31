function createCamera(args) {
    try {
        var compIndex = args.compIndex || 1;
        var name = args.name || "Camera 1";
        var preset = args.preset || "50mm";
        var zoom = args.zoom;
        var filmSize = args.filmSize || 36;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var centerX = comp.width / 2;
        var centerY = comp.height / 2;
        var cameraLayer = comp.layers.addCamera(name, [centerX, centerY]);
        // Set zoom based on preset or explicit zoom
        if (!zoom) {
            var presetZooms = { "15mm": 135, "20mm": 181, "24mm": 216, "28mm": 252, "35mm": 315, "50mm": 450, "80mm": 720, "85mm": 765, "135mm": 1215, "200mm": 1800 };
            zoom = presetZooms[preset] || 450;
        }
        var cameraOptions = cameraLayer.property("Camera Options");
        if (cameraOptions) {
            var zoomProp = cameraOptions.property("Zoom");
            if (zoomProp) zoomProp.setValue(zoom);
        }
        return JSON.stringify({
            status: "success", message: "Camera layer created",
            layer: { name: cameraLayer.name, index: cameraLayer.index, preset: preset, zoom: zoom, filmSize: filmSize }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
