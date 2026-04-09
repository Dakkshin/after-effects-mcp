// createBackgroundSolid.jsx
// Creates a full-frame background solid in the specified composition

function normalizeRgbColorInput(colorValue, fallback) {
    var fallbackColor = fallback || [0, 0, 0];
    if (colorValue === undefined || colorValue === null || colorValue === "") {
        return fallbackColor;
    }
    if (colorValue instanceof Array && colorValue.length >= 3) {
        return [Number(colorValue[0]), Number(colorValue[1]), Number(colorValue[2])];
    }
    if (typeof colorValue === "string") {
        var hex = String(colorValue).replace(/^#/, "");
        if (hex.length === 3) {
            hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
        }
        if (hex.length === 6) {
            return [
                parseInt(hex.substr(0, 2), 16) / 255,
                parseInt(hex.substr(2, 2), 16) / 255,
                parseInt(hex.substr(4, 2), 16) / 255
            ];
        }
    }
    if (typeof colorValue === "object") {
        return [
            Number(colorValue.r || 0) / 255,
            Number(colorValue.g || 0) / 255,
            Number(colorValue.b || 0) / 255
        ];
    }
    return fallbackColor;
}

function createBackgroundSolid(args) {
    try {
        var compName = args.compName || "";
        var startTime = args.startTime || 0;
        var duration = args.duration;
        var layerName = args.name || "Background";
        var color = normalizeRgbColorInput(args.color || args.hexColor || args.backgroundColor, [0, 0, 0]);
        var comp = null;

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) {
                comp = item;
                break;
            }
        }

        if (!comp) {
            if (app.project.activeItem instanceof CompItem) {
                comp = app.project.activeItem;
            } else {
                throw new Error("No composition found with name '" + compName + "' and no active composition");
            }
        }

        var resolvedDuration = duration || Math.max(0, comp.duration - startTime);
        var solidLayer = comp.layers.addSolid(color, layerName, comp.width, comp.height, comp.pixelAspect || 1);
        solidLayer.property("Position").setValue([comp.width / 2, comp.height / 2]);
        solidLayer.startTime = startTime;
        if (resolvedDuration > 0) {
            solidLayer.outPoint = Math.min(comp.duration, startTime + resolvedDuration);
        }
        if (args.moveToBack !== false) {
            solidLayer.moveToEnd();
        }

        return JSON.stringify({
            status: "success",
            message: "Background solid created successfully",
            layer: {
                name: solidLayer.name,
                index: solidLayer.index,
                type: "solid",
                inPoint: solidLayer.inPoint,
                outPoint: solidLayer.outPoint,
                position: solidLayer.property("Position").value
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

var argsFile = new File($.fileName.replace(/[^\\\/]*$/, '') + "../temp/args.json");
var args = {};
if (argsFile.exists) {
    argsFile.open("r");
    var content = argsFile.read();
    argsFile.close();
    if (content) {
        try {
            args = JSON.parse(content);
        } catch (e) {
            $.write(JSON.stringify({
                status: "error",
                message: "Failed to parse arguments: " + e.toString()
            }, null, 2));
        }
    }
}

var result = createBackgroundSolid(args);
$.write(result);
