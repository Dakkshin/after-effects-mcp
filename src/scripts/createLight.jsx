function createLight(args) {
    try {
        var compIndex = args.compIndex || 1;
        var name = args.name || "Light 1";
        var lightTypeStr = args.lightType || "POINT";
        var color = args.color || [1, 1, 1];
        var intensity = args.intensity !== undefined ? args.intensity : 100;
        var castsShadows = args.castsShadows !== undefined ? args.castsShadows : false;
        var coneAngle = args.coneAngle || 90;
        var coneFeather = args.coneFeather || 50;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var centerX = comp.width / 2;
        var centerY = comp.height / 2;
        var lightLayer = comp.layers.addLight(name, [centerX, centerY]);
        var lightOptions = lightLayer.property("Light Options");
        if (lightOptions) {
            var lightTypeMap = {
                "PARALLEL": LightType.PARALLEL,
                "SPOT": LightType.SPOT,
                "POINT": LightType.POINT,
                "AMBIENT": LightType.AMBIENT
            };
            var ltType = lightTypeMap[lightTypeStr.toUpperCase()] || LightType.POINT;
            var ltProp = lightOptions.property("Light Type");
            if (ltProp) ltProp.setValue(ltType);
            var colorProp = lightOptions.property("Color");
            if (colorProp) colorProp.setValue(color);
            var intensityProp = lightOptions.property("Intensity");
            if (intensityProp) intensityProp.setValue(intensity);
            var shadowsProp = lightOptions.property("Casts Shadows");
            if (shadowsProp) shadowsProp.setValue(castsShadows ? 1 : 0);
            if (lightTypeStr.toUpperCase() === "SPOT") {
                var coneAngleProp = lightOptions.property("Cone Angle");
                if (coneAngleProp) coneAngleProp.setValue(coneAngle);
                var coneFeatherProp = lightOptions.property("Cone Feather");
                if (coneFeatherProp) coneFeatherProp.setValue(coneFeather);
            }
        }
        return JSON.stringify({
            status: "success", message: "Light layer created",
            layer: { name: lightLayer.name, index: lightLayer.index, lightType: lightTypeStr, color: color, intensity: intensity, castsShadows: castsShadows }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
