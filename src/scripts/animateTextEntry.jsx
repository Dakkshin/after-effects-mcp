// animateTextEntry.jsx
// Applies a curated text entry animation to a text layer

function animateTextEntry(args) {
    try {
        var compName = args.compName || "";
        var layerName = args.layerName || "";
        var direction = args.direction || "bottom";
        var distance = args.distance || 120;
        var duration = args.duration || 1;
        var startTime = args.startTime;
        var fadeIn = args.fadeIn !== false;
        var overshoot = args.overshoot !== false;
        var opacityFrom = args.opacityFrom !== undefined ? args.opacityFrom : 0;
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

        var layer = null;
        if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) {
                    layer = comp.layer(j);
                    break;
                }
            }
        }

        if (!layer && comp.selectedLayers.length === 1) {
            layer = comp.selectedLayers[0];
        }
        if (!layer) {
            throw new Error("No target text layer found");
        }
        if (!(layer instanceof TextLayer)) {
            throw new Error("Target layer must be a text layer");
        }

        var positionProp = layer.property("Position");
        var opacityProp = layer.property("Opacity");
        var finalPosition = positionProp.value;
        var finalOpacity = opacityProp.value;
        var resolvedStartTime = startTime !== undefined ? startTime : layer.inPoint;
        var startPosition = finalPosition.slice(0);
        var overshootPosition = finalPosition.slice(0);

        if (direction === "left") {
            startPosition[0] -= distance;
            overshootPosition[0] += distance * 0.1;
        } else if (direction === "right") {
            startPosition[0] += distance;
            overshootPosition[0] -= distance * 0.1;
        } else if (direction === "top") {
            startPosition[1] -= distance;
            overshootPosition[1] += distance * 0.1;
        } else {
            startPosition[1] += distance;
            overshootPosition[1] -= distance * 0.1;
        }

        positionProp.setValueAtTime(resolvedStartTime, startPosition);
        if (overshoot) {
            positionProp.setValueAtTime(resolvedStartTime + duration * 0.82, overshootPosition);
        }
        positionProp.setValueAtTime(resolvedStartTime + duration, finalPosition);

        if (fadeIn) {
            opacityProp.setValueAtTime(resolvedStartTime, opacityFrom);
            opacityProp.setValueAtTime(resolvedStartTime + duration, finalOpacity);
        }

        return JSON.stringify({
            status: "success",
            message: "Text entry animation applied successfully",
            animation: {
                direction: direction,
                distance: distance,
                duration: duration,
                startTime: resolvedStartTime,
                fadeIn: fadeIn,
                overshoot: overshoot
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

var result = animateTextEntry(args);
$.write(result);
