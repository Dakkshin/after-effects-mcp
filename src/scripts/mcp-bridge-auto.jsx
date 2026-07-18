// mcp-bridge-auto.jsx
// Auto-running MCP Bridge panel for After Effects

// Remove #include directives as we define functions below
/*
#include "createComposition.jsx"
#include "createTextLayer.jsx"
#include "createShapeLayer.jsx"
#include "createSolidLayer.jsx"
#include "setLayerProperties.jsx"
*/

// --- Function Definitions ---

// --- createComposition (from createComposition.jsx) --- 
function createComposition(args) {
    try {
        var name = args.name || "New Composition";
        var width = parseInt(args.width) || 1920;
        var height = parseInt(args.height) || 1080;
        var pixelAspect = parseFloat(args.pixelAspect) || 1.0;
        var duration = parseFloat(args.duration) || 10.0;
        var frameRate = parseFloat(args.frameRate) || 30.0;
        var bgColor = args.backgroundColor ? [args.backgroundColor.r/255, args.backgroundColor.g/255, args.backgroundColor.b/255] : [0, 0, 0];
        var newComp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
        if (args.backgroundColor) {
            newComp.bgColor = bgColor;
        }
        return JSON.stringify({
            status: "success", message: "Composition created successfully",
            composition: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, pixelAspect: newComp.pixelAspect, duration: newComp.duration, frameRate: newComp.frameRate, bgColor: newComp.bgColor }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createTextLayer (from createTextLayer.jsx) ---
function createTextLayer(args) {
    try {
        var compName = args.compName || "";
        var text = args.text || "Text Layer";
        var position = args.position || [960, 540]; 
        var fontSize = args.fontSize || 72;
        var color = args.color || [1, 1, 1]; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var fontFamily = args.fontFamily || "Arial";
        var alignment = args.alignment || "center"; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var textLayer = comp.layers.addText(text);
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        if (alignment === "left") { textDocument.justification = ParagraphJustification.LEFT_JUSTIFY; } 
        else if (alignment === "center") { textDocument.justification = ParagraphJustification.CENTER_JUSTIFY; } 
        else if (alignment === "right") { textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY; }
        textProp.setValue(textDocument);
        textLayer.property("Position").setValue(position);
        textLayer.startTime = startTime;
        if (duration > 0) { textLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Text layer created successfully",
            layer: { name: textLayer.name, index: textLayer.index, type: "text", inPoint: textLayer.inPoint, outPoint: textLayer.outPoint, position: textLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createShapeLayer (from createShapeLayer.jsx) --- 
function createShapeLayer(args) {
    try {
        var compName = args.compName || "";
        var shapeType = args.shapeType || "rectangle"; 
        var position = args.position || [960, 540]; 
        var size = args.size || [200, 200]; 
        var fillColor = args.fillColor || [1, 0, 0]; 
        var strokeColor = args.strokeColor || [0, 0, 0]; 
        var strokeWidth = args.strokeWidth || 0; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var name = args.name || "Shape Layer";
        var points = args.points || 5; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = name;
        var contents = shapeLayer.property("Contents"); 
        var shapeGroup = contents.addProperty("ADBE Vector Group");
        var groupContents = shapeGroup.property("Contents"); 
        var shapePathProperty;
        if (shapeType === "rectangle") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Rect");
            shapePathProperty.property("Size").setValue(size);
        } else if (shapeType === "ellipse") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Ellipse");
            shapePathProperty.property("Size").setValue(size);
        } else if (shapeType === "polygon" || shapeType === "star") { 
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Star");
            shapePathProperty.property("Type").setValue(shapeType === "polygon" ? 1 : 2); 
            shapePathProperty.property("Points").setValue(points);
            shapePathProperty.property("Outer Radius").setValue(size[0] / 2);
            if (shapeType === "star") { shapePathProperty.property("Inner Radius").setValue(size[0] / 3); }
        }
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue(fillColor);
        fill.property("Opacity").setValue(100);
        if (strokeWidth > 0) {
            var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("Color").setValue(strokeColor);
            stroke.property("Stroke Width").setValue(strokeWidth);
            stroke.property("Opacity").setValue(100);
        }
        shapeLayer.property("Position").setValue(position);
        shapeLayer.startTime = startTime;
        if (duration > 0) { shapeLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Shape layer created successfully",
            layer: { name: shapeLayer.name, index: shapeLayer.index, type: "shape", shapeType: shapeType, inPoint: shapeLayer.inPoint, outPoint: shapeLayer.outPoint, position: shapeLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createCamera ---
function createCamera(args) {
    try {
        var compName = args.compName || "";
        var name = args.name || "Camera";
        var zoom = args.zoom || 1777.78; // Default ~50mm equivalent
        var position = args.position; // Optional [x, y, z]
        var pointOfInterest = args.pointOfInterest; // Optional [x, y, z]
        var oneNode = args.oneNode || false; // If true, create a one-node camera (no point of interest)

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var centerPoint = [comp.width / 2, comp.height / 2];
        var cameraLayer = comp.layers.addCamera(name, centerPoint);
        cameraLayer.property("Camera Options").property("Zoom").setValue(zoom);

        if (oneNode) {
            cameraLayer.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
        }

        if (position !== undefined && position !== null) {
            cameraLayer.property("Position").setValue(position);
        }

        if (pointOfInterest !== undefined && pointOfInterest !== null && !oneNode) {
            cameraLayer.property("Point of Interest").setValue(pointOfInterest);
        }

        var result = {
            name: cameraLayer.name,
            index: cameraLayer.index,
            zoom: cameraLayer.property("Camera Options").property("Zoom").value,
            position: cameraLayer.property("Position").value,
            oneNode: oneNode
        };
        if (!oneNode) {
            result.pointOfInterest = cameraLayer.property("Point of Interest").value;
        }

        return JSON.stringify({
            status: "success",
            message: "Camera created successfully",
            layer: result
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- duplicateLayer ---
function duplicateLayer(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";
        var newName = args.newName; // optional rename

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        var newLayer = layer.duplicate();
        if (newName) { newLayer.name = newName; }

        return JSON.stringify({
            status: "success",
            message: "Layer duplicated successfully",
            original: { name: layer.name, index: layer.index },
            duplicate: { name: newLayer.name, index: newLayer.index }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- deleteLayer ---
function deleteLayer(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        var deletedName = layer.name;
        var deletedIndex = layer.index;
        layer.remove();

        return JSON.stringify({
            status: "success",
            message: "Layer deleted successfully",
            deleted: { name: deletedName, index: deletedIndex }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setLayerMask: create or modify a mask on a layer ---
function setLayerMask(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";
        var maskIndex = args.maskIndex; // optional — if provided, modify existing mask
        var maskPath = args.maskPath; // array of [x, y] points defining the mask shape
        var maskRect = args.maskRect; // shorthand: {top, left, width, height} for rectangular masks
        var maskMode = args.maskMode || "add"; // "add", "subtract", "intersect", "none"
        var maskFeather = args.maskFeather; // optional [x, y] feather
        var maskOpacity = args.maskOpacity; // optional 0-100
        var maskExpansion = args.maskExpansion; // optional pixels
        var maskName = args.maskName; // optional rename

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        // Build the mask shape
        var shapePoints = [];
        if (maskRect) {
            // Rectangle shorthand
            var t = maskRect.top || 0;
            var l = maskRect.left || 0;
            var w = maskRect.width || comp.width;
            var h = maskRect.height || comp.height;
            shapePoints = [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
        } else if (maskPath && maskPath.length >= 3) {
            shapePoints = maskPath;
        } else {
            throw new Error("Must provide either maskRect or maskPath with at least 3 points");
        }

        // Create the shape object
        var myShape = new Shape();
        var vertices = [];
        for (var p = 0; p < shapePoints.length; p++) {
            vertices.push(shapePoints[p]);
        }
        myShape.vertices = vertices;
        myShape.closed = true;

        var changed = [];
        var mask;

        if (maskIndex !== undefined && maskIndex !== null) {
            // Modify existing mask
            if (maskIndex > 0 && maskIndex <= layer.property("Masks").numProperties) {
                mask = layer.property("Masks").property(maskIndex);
            } else {
                throw new Error("Mask index out of bounds: " + maskIndex);
            }
            mask.property("Mask Path").setValue(myShape);
            changed.push("maskPath");
        } else {
            // Create new mask
            mask = layer.property("Masks").addProperty("Mask");
            mask.property("Mask Path").setValue(myShape);
            changed.push("newMask");
        }

        // Set mask mode
        var modes = {
            "none": MaskMode.NONE,
            "add": MaskMode.ADD,
            "subtract": MaskMode.SUBTRACT,
            "intersect": MaskMode.INTERSECT,
            "lighten": MaskMode.LIGHTEN,
            "darken": MaskMode.DARKEN,
            "difference": MaskMode.DIFFERENCE
        };
        if (modes[maskMode] !== undefined) {
            mask.maskMode = modes[maskMode];
            changed.push("maskMode");
        }

        if (maskFeather !== undefined && maskFeather !== null) {
            mask.property("Mask Feather").setValue(maskFeather);
            changed.push("maskFeather");
        }
        if (maskOpacity !== undefined && maskOpacity !== null) {
            mask.property("Mask Opacity").setValue(maskOpacity);
            changed.push("maskOpacity");
        }
        if (maskExpansion !== undefined && maskExpansion !== null) {
            mask.property("Mask Expansion").setValue(maskExpansion);
            changed.push("maskExpansion");
        }
        if (maskName) {
            mask.name = maskName;
            changed.push("maskName");
        }

        return JSON.stringify({
            status: "success",
            message: "Mask set successfully",
            layer: { name: layer.name, index: layer.index },
            mask: {
                name: mask.name,
                index: mask.propertyIndex,
                mode: maskMode,
                changedProperties: changed
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createSolidLayer (from createSolidLayer.jsx) ---
function createSolidLayer(args) {
    try {
        var compName = args.compName || "";
        var color = args.color || [1, 1, 1]; 
        var name = args.name || "Solid Layer";
        var position = args.position || [960, 540]; 
        var size = args.size; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var isAdjustment = args.isAdjustment || false; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        if (!size) { size = [comp.width, comp.height]; }
        var solidLayer;
        if (isAdjustment) {
            solidLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
            solidLayer.adjustmentLayer = true;
        } else {
            solidLayer = comp.layers.addSolid(color, name, size[0], size[1], 1);
        }
        solidLayer.property("Position").setValue(position);
        solidLayer.startTime = startTime;
        if (duration > 0) { solidLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: isAdjustment ? "Adjustment layer created successfully" : "Solid layer created successfully",
            layer: { name: solidLayer.name, index: solidLayer.index, type: isAdjustment ? "adjustment" : "solid", inPoint: solidLayer.inPoint, outPoint: solidLayer.outPoint, position: solidLayer.property("Position").value, isAdjustment: solidLayer.adjustmentLayer }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- saveFrame: render a single composition frame to a PNG file ---
function saveFrame(args) {
    try {
        var compName = args.compName || "";
        var time = (args.time !== undefined && args.time !== null) ? args.time : 0;
        var outPath = args.outPath;
        if (!outPath) { throw new Error("outPath is required"); }

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var outFile = new File(outPath);
        var parent = outFile.parent;
        if (parent && !parent.exists) { parent.create(); }

        // saveFrameToPng renders the comp at the given time (seconds) to a PNG file
        comp.saveFrameToPng(time, outFile);
        // Re-stat with a FRESH File object: ExtendScript caches File.exists on the
        // original object, which was created before the file existed.
        var writtenFile = new File(outFile.fsName);
        if (!writtenFile.exists) {
            throw new Error("saveFrameToPng reported no error but the output file was not created: " + outFile.fsName);
        }

        return JSON.stringify({
            status: "success",
            message: "Frame saved successfully",
            path: outFile.fsName,
            comp: comp.name,
            time: time
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- moveLayer: reorder a layer within its composition ---
function moveLayer(args) {
    try {
        var compName = args.compName || "";
        var layerIndex = args.layerIndex;
        var layerName = args.layerName || "";
        var position = args.position; // "front" | "back" | "before" | "after"
        var toIndex = args.toIndex;   // optional 1-based target index
        var referenceLayerIndex = args.referenceLayerIndex;
        var referenceLayerName = args.referenceLayerName || "";

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        // Resolve the layer to move
        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); }
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }

        if (toIndex !== undefined && toIndex !== null) {
            toIndex = Math.max(1, Math.min(comp.numLayers, toIndex));
            if (toIndex < layer.index) { layer.moveBefore(comp.layer(toIndex)); }
            else if (toIndex > layer.index) { layer.moveAfter(comp.layer(toIndex)); }
            // equal => no change
        } else if (position === "front") {
            layer.moveToBeginning();
        } else if (position === "back") {
            layer.moveToEnd();
        } else if (position === "before" || position === "after") {
            var ref = null;
            if (referenceLayerIndex !== undefined && referenceLayerIndex !== null) {
                if (referenceLayerIndex > 0 && referenceLayerIndex <= comp.numLayers) { ref = comp.layer(referenceLayerIndex); }
            } else if (referenceLayerName) {
                for (var k = 1; k <= comp.numLayers; k++) {
                    if (comp.layer(k).name === referenceLayerName) { ref = comp.layer(k); break; }
                }
            }
            if (!ref) { throw new Error("Reference layer not found for '" + position + "'"); }
            if (position === "before") { layer.moveBefore(ref); } else { layer.moveAfter(ref); }
        } else {
            throw new Error("Specify either 'toIndex' or 'position' ('front'|'back'|'before'|'after')");
        }

        return JSON.stringify({
            status: "success",
            message: "Layer moved successfully",
            layer: { name: layer.name, newIndex: layer.index }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// =====================================================================
// ===== Extended general-purpose commands (added 2026-06-04) ==========
// =====================================================================

// Shared helpers for the extended commands.
// If a (non-empty) compName is supplied, it MUST match by name — we do NOT
// silently fall back to the active comp, to avoid acting on the wrong comp.
// Only when compName is omitted/empty do we use the active composition.
function mcpFindComp(compName) {
    if (compName) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === compName) { return it; }
        }
        return null; // named comp requested but not found — caller will throw
    }
    if (app.project.activeItem instanceof CompItem) { return app.project.activeItem; }
    return null;
}

function mcpFindLayer(comp, layerIndex, layerName) {
    if (layerIndex !== undefined && layerIndex !== null) {
        if (layerIndex > 0 && layerIndex <= comp.numLayers) { return comp.layer(layerIndex); }
        return null;
    }
    if (layerName) {
        for (var j = 1; j <= comp.numLayers; j++) {
            if (comp.layer(j).name === layerName) { return comp.layer(j); }
        }
    }
    return null;
}

// --- importFootage: import a file into the project, optionally add to a comp ---
function importFootage(args) {
    try {
        var filePath = args.filePath;
        if (!filePath) { throw new Error("filePath is required"); }
        var f = new File(filePath);
        if (!f.exists) { throw new Error("File not found: " + filePath); }

        var io = new ImportOptions(f);
        if (args.importAs === "comp" && io.canImportAs(ImportAsType.COMP)) { io.importAs = ImportAsType.COMP; }
        var item = app.project.importFile(io);

        var result = { status: "success", message: "Footage imported", name: item.name, id: item.id, typeName: item.typeName };
        if (args.addToComp) {
            var comp = mcpFindComp(args.compName || "");
            if (!comp) { throw new Error("addToComp requested but composition not found"); }
            var layer = comp.layers.add(item);
            if (args.position) { layer.property("Position").setValue(args.position); }
            if (args.startTime !== undefined && args.startTime !== null) { layer.startTime = args.startTime; }
            result.layerIndex = layer.index;
            result.layerName = layer.name;
        }
        return JSON.stringify(result, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- precompose: nest the given layers into a new composition ---
function precompose(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var indices = args.layerIndices;
        if (!indices || !indices.length) { throw new Error("layerIndices (array of 1-based indices) is required"); }
        var name = args.name || "Precomp";
        var moveAll = (args.moveAllAttributes !== undefined) ? args.moveAllAttributes : true;
        // AE only allows moveAllAttributes=false when precomposing a SINGLE layer.
        if (!moveAll && indices.length > 1) {
            throw new Error("moveAllAttributes=false is only allowed when precomposing a single layer");
        }
        var newComp = comp.layers.precompose(indices, name, moveAll);
        return JSON.stringify({ status: "success", message: "Precomposed", comp: newComp.name, id: newComp.id }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setLayerParent: set or clear a layer's parent ---
function setLayerParent(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        if (args.unparent) {
            layer.parent = null;
        } else {
            var p = mcpFindLayer(comp, args.parentIndex, args.parentName);
            if (!p) { throw new Error("Parent layer not found"); }
            layer.parent = p;
        }
        return JSON.stringify({ status: "success", message: "Parent updated", layer: layer.name, parent: layer.parent ? layer.parent.name : null }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createNull: add a null object layer ---
function createNull(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var dur = (args.duration !== undefined && args.duration !== null) ? args.duration : comp.duration;
        var nullLayer = comp.layers.addNull(dur);
        if (args.name) { nullLayer.name = args.name; }
        if (args.position) { nullLayer.property("Position").setValue(args.position); }
        return JSON.stringify({ status: "success", message: "Null created", name: nullLayer.name, index: nullLayer.index }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setBlendMode: set a layer's blending mode ---
function setBlendMode(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var modes = {
            "normal": BlendingMode.NORMAL, "add": BlendingMode.ADD, "screen": BlendingMode.SCREEN,
            "multiply": BlendingMode.MULTIPLY, "overlay": BlendingMode.OVERLAY, "lighten": BlendingMode.LIGHTEN,
            "darken": BlendingMode.DARKEN, "softLight": BlendingMode.SOFT_LIGHT, "hardLight": BlendingMode.HARD_LIGHT,
            "difference": BlendingMode.DIFFERENCE, "colorDodge": BlendingMode.CLASSIC_COLOR_DODGE,
            "colorBurn": BlendingMode.CLASSIC_COLOR_BURN, "linearDodge": BlendingMode.LINEAR_DODGE,
            "linearBurn": BlendingMode.LINEAR_BURN, "hue": BlendingMode.HUE, "saturation": BlendingMode.SATURATION,
            "color": BlendingMode.COLOR, "luminosity": BlendingMode.LUMINOSITY
        };
        var m = modes[args.mode];
        if (m === undefined) { throw new Error("Unknown blend mode: " + args.mode); }
        layer.blendingMode = m;
        return JSON.stringify({ status: "success", message: "Blend mode set", layer: layer.name, mode: args.mode }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setTrackMatte: set a track matte for a layer ---
function setTrackMatte(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var types = {
            "none": TrackMatteType.NO_TRACK_MATTE, "alpha": TrackMatteType.ALPHA,
            "alphaInverted": TrackMatteType.ALPHA_INVERTED, "luma": TrackMatteType.LUMA,
            "lumaInverted": TrackMatteType.LUMA_INVERTED
        };
        var t = types[args.matteType];
        if (t === undefined) { throw new Error("Unknown matteType: " + args.matteType); }
        // If the caller explicitly named a matte layer, it MUST resolve — do not
        // silently fall back to the "layer directly above" legacy behavior.
        var matteRequested = (args.matteLayerIndex !== undefined && args.matteLayerIndex !== null) ||
                             (args.matteLayerName !== undefined && args.matteLayerName !== null && args.matteLayerName !== "");
        var matteLayer = mcpFindLayer(comp, args.matteLayerIndex, args.matteLayerName);
        if (matteRequested && !matteLayer) {
            throw new Error("Requested matte layer not found");
        }
        var usedLegacyApi = false;
        if (matteLayer && layer.setTrackMatte) {
            layer.setTrackMatte(matteLayer, t); // AE 23.0+ explicit matte-layer link
        } else {
            // Legacy model: matte is the layer directly above `layer`.
            layer.trackMatteType = t;
            usedLegacyApi = true;
        }
        return JSON.stringify({ status: "success", message: "Track matte set", layer: layer.name, matteType: args.matteType, usedLegacyApi: usedLegacyApi }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- removeEffect: remove an effect from a layer ---
function removeEffect(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var fx = layer.property("ADBE Effect Parade");
        if (!fx || fx.numProperties === 0) { throw new Error("Layer has no effects"); }
        var target = null;
        if (args.effectIndex !== undefined && args.effectIndex !== null) {
            target = fx.property(args.effectIndex);
        } else if (args.effectName) {
            for (var i = 1; i <= fx.numProperties; i++) {
                if (fx.property(i).name === args.effectName) { target = fx.property(i); break; }
            }
        }
        if (!target) { throw new Error("Effect not found"); }
        var nm = target.name;
        target.remove();
        return JSON.stringify({ status: "success", message: "Effect removed", removed: nm }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- reorderEffect: move an effect to a new position in the effect stack ---
function reorderEffect(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var fx = layer.property("ADBE Effect Parade");
        if (!fx || fx.numProperties === 0) { throw new Error("Layer has no effects"); }
        var e = fx.property(args.effectIndex);
        if (!e) { throw new Error("Effect not found at index " + args.effectIndex); }
        var effectName = e.name;
        var to = Math.max(1, Math.min(fx.numProperties, args.toIndex));
        e.moveTo(to);
        // NOTE: `e` is invalidated after moveTo(); do not read from it afterwards.
        return JSON.stringify({ status: "success", message: "Effect reordered", effect: effectName, newIndex: to }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createLight: add a light layer ---
function createLight(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var name = args.name || "Light";
        var center = args.position ? [args.position[0], args.position[1]] : [comp.width / 2, comp.height / 2];
        var light = comp.layers.addLight(name, center);
        var lt = { "parallel": LightType.PARALLEL, "spot": LightType.SPOT, "point": LightType.POINT, "ambient": LightType.AMBIENT };
        if (args.lightType && lt[args.lightType] !== undefined) { light.lightType = lt[args.lightType]; }

        // User-supplied values must not fail silently: record any that don't apply.
        var warnings = [];
        if (args.position) {
            try { light.property("Position").setValue(args.position); }
            catch (e1) { warnings.push("position not applied: " + e1.toString()); }
        }
        if (args.pointOfInterest) {
            try { light.property("Point of Interest").setValue(args.pointOfInterest); }
            catch (e2) { warnings.push("pointOfInterest not applied: " + e2.toString()); }
        }
        var opts = light.property("ADBE Light Options Group");
        if (opts) {
            if (args.intensity !== undefined && args.intensity !== null) {
                try { opts.property("ADBE Light Intensity").setValue(args.intensity); }
                catch (e3) { warnings.push("intensity not applied: " + e3.toString()); }
            }
            if (args.color) {
                try { opts.property("ADBE Light Color").setValue(args.color); }
                catch (e4) { warnings.push("color not applied: " + e4.toString()); }
            }
        }
        var lightResult = { status: "success", message: "Light created", name: light.name, index: light.index };
        if (warnings.length) { lightResult.warnings = warnings; }
        return JSON.stringify(lightResult, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- set3DLayer: toggle a layer's 3D switch ---
function set3DLayer(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        layer.threeDLayer = (args.enabled === undefined) ? true : !!args.enabled;
        return JSON.stringify({ status: "success", message: "3D switch updated", layer: layer.name, threeD: layer.threeDLayer }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- renderComposition: render a comp via the Render Queue (blocking) ---
function renderComposition(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        if (!args.outPath) { throw new Error("outPath is required"); }
        var rqItem = app.project.renderQueue.items.add(comp);
        if (args.startTime !== undefined && args.startTime !== null) { rqItem.timeSpanStart = args.startTime; }
        if (args.duration !== undefined && args.duration !== null) { rqItem.timeSpanDuration = args.duration; }
        var om = rqItem.outputModule(1);
        var warnings = [];
        if (args.outputModuleTemplate) {
            // Don't silently render with the wrong settings if the template name is bad.
            try { om.applyTemplate(args.outputModuleTemplate); }
            catch (et) { warnings.push("outputModuleTemplate '" + args.outputModuleTemplate + "' could not be applied; rendered with the default output module: " + et.toString()); }
        }
        om.file = new File(args.outPath);
        app.project.renderQueue.render(); // blocking: freezes AE until the render finishes
        var savedPath = om.file.fsName;
        try { rqItem.remove(); } catch (er) {}
        // Re-stat with a fresh File object (ExtendScript caches File.exists).
        var verifyFile = new File(savedPath);
        if (!verifyFile.exists) {
            throw new Error("Render reported complete but the output file was not created: " + savedPath);
        }
        var renderResult = { status: "success", message: "Render complete", path: savedPath, comp: comp.name };
        if (warnings.length) { renderResult.warnings = warnings; }
        return JSON.stringify(renderResult, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setKeyframeEase: apply temporal easing to existing keyframes of a property ---
function setKeyframeEase(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var prop = layer.property(args.propertyName);
        if (!prop) { throw new Error("Property not found: " + args.propertyName); }
        if (prop.numKeys === 0) { throw new Error("Property has no keyframes: " + args.propertyName); }
        var influence = (args.influence !== undefined && args.influence !== null) ? args.influence : 33;
        var easeType = args.easeType || "easyEase";
        var sample = prop.keyValue(1);
        var dim = (sample instanceof Array) ? sample.length : 1;
        var keys = [];
        if (args.keyIndex !== undefined && args.keyIndex !== null) { keys = [args.keyIndex]; }
        else { for (var k = 1; k <= prop.numKeys; k++) { keys.push(k); } }
        for (var ki = 0; ki < keys.length; ki++) {
            var key = keys[ki];
            if (easeType === "linear") {
                prop.setInterpolationTypeAtKey(key, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                continue;
            }
            // AE convention: "ease in" eases the incoming handle, "ease out" the outgoing.
            // 0.1 is the minimum influence (~no ease) for the un-eased side.
            var inInf = (easeType === "easeOut") ? 0.1 : influence;
            var outInf = (easeType === "easeIn") ? 0.1 : influence;
            var inEases = [], outEases = [];
            for (var d = 0; d < dim; d++) {
                inEases.push(new KeyframeEase(0, inInf));
                outEases.push(new KeyframeEase(0, outInf));
            }
            prop.setInterpolationTypeAtKey(key, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            prop.setTemporalEaseAtKey(key, inEases, outEases);
        }
        return JSON.stringify({ status: "success", message: "Keyframe ease applied", property: args.propertyName, keysAffected: keys.length, easeType: easeType }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- applyTrimPaths: add Trim Paths to a shape layer, optionally animate the "draw on" ---
function applyTrimPaths(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var contents = layer.property("ADBE Root Vectors Group");
        if (!contents) { throw new Error("Layer is not a shape layer (no Contents)"); }
        var trim = contents.addProperty("ADBE Vector Filter - Trim");
        var startProp = trim.property("ADBE Vector Trim Start");
        var endProp = trim.property("ADBE Vector Trim End");
        var offsetProp = trim.property("ADBE Vector Trim Offset");
        if (args.start !== undefined && args.start !== null) { startProp.setValue(args.start); }
        if (args.offset !== undefined && args.offset !== null) { offsetProp.setValue(args.offset); }
        if (args.drawOn) {
            var from = (args.drawOn.from !== undefined) ? args.drawOn.from : 0;
            var to = (args.drawOn.to !== undefined) ? args.drawOn.to : 100;
            var st = (args.drawOn.startTime !== undefined) ? args.drawOn.startTime : 0;
            var du = (args.drawOn.duration !== undefined) ? args.drawOn.duration : 1;
            endProp.setValueAtTime(st, from);
            endProp.setValueAtTime(st + du, to);
        } else if (args.end !== undefined && args.end !== null) {
            endProp.setValue(args.end);
        }
        return JSON.stringify({ status: "success", message: "Trim Paths applied", layer: layer.name }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- addTextAnimator: add a text animator with a range selector for per-character animation ---
function addTextAnimator(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var textProps = layer.property("ADBE Text Properties");
        if (!textProps) { throw new Error("Layer is not a text layer"); }
        var animators = textProps.property("ADBE Text Animators");
        var animator = animators.addProperty("ADBE Text Animator");
        if (args.name) { animator.name = args.name; }
        var animProps = animator.property("ADBE Text Animator Properties");

        var which = args.property || "opacity";
        if (which === "opacity") {
            animProps.addProperty("ADBE Text Opacity").setValue((args.value !== undefined) ? args.value : 0);
        } else if (which === "position") {
            animProps.addProperty("ADBE Text Position 3D").setValue(args.value || [0, -80, 0]);
        } else if (which === "scale") {
            animProps.addProperty("ADBE Text Scale 3D").setValue(args.value || [40, 40, 100]);
        } else if (which === "rotation") {
            animProps.addProperty("ADBE Text Rotation").setValue((args.value !== undefined) ? args.value : -30);
        }

        var selectors = animator.property("ADBE Text Selectors");
        var sel = selectors.addProperty("ADBE Text Selector");
        if (args.revealDuration) {
            // Reveal left-to-right: animate the Range Selector Start from 0% to 100%.
            // With the animator's Opacity = 0 (selected chars hidden), this makes the
            // hidden selection retreat left-to-right, ending with ALL characters visible.
            var st = (args.startTime !== undefined) ? args.startTime : 0;
            var startProp = sel.property("ADBE Text Percent Start");
            startProp.setValueAtTime(st, 0);
            startProp.setValueAtTime(st + args.revealDuration, 100);
        } else if (args.offset !== undefined && args.offset !== null) {
            sel.property("ADBE Text Percent Offset").setValue(args.offset);
        }
        return JSON.stringify({ status: "success", message: "Text animator added", layer: layer.name, animator: animator.name }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- saveProject: save the current project (optionally to a new path) ---
function saveProject(args) {
    try {
        if (args && args.path) {
            app.project.save(new File(args.path));
        } else {
            if (!app.project.file) { throw new Error("Project has never been saved; provide a 'path'"); }
            app.project.save();
        }
        return JSON.stringify({ status: "success", message: "Project saved", path: app.project.file ? app.project.file.fsName : null }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- getLayerDetails: rich introspection of a single layer ---
function getLayerDetails(args) {
    try {
        var comp = mcpFindComp(args.compName || "");
        if (!comp) { throw new Error("Composition not found"); }
        var layer = mcpFindLayer(comp, args.layerIndex, args.layerName);
        if (!layer) { throw new Error("Layer not found"); }
        var effects = [];
        var fx = layer.property("ADBE Effect Parade");
        if (fx) {
            for (var i = 1; i <= fx.numProperties; i++) {
                var e = fx.property(i);
                effects.push({ index: i, name: e.name, matchName: e.matchName });
            }
        }
        var masks = layer.property("ADBE Mask Parade");
        var info = {
            status: "success",
            name: layer.name,
            index: layer.index,
            enabled: layer.enabled,
            threeD: layer.threeDLayer === true,
            blendingMode: layer.blendingMode,
            parent: layer.parent ? layer.parent.name : null,
            startTime: layer.startTime,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            numMasks: masks ? masks.numProperties : 0,
            effects: effects
        };
        return JSON.stringify(info, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- deleteComposition: remove a composition from the project ---
function deleteComposition(args) {
    try {
        var compName = args.compName || "";
        var compIndex = args.compIndex;
        var target = null;
        if (compName) {
            for (var i = 1; i <= app.project.numItems; i++) {
                var it = app.project.item(i);
                if (it instanceof CompItem && it.name === compName) { target = it; break; }
            }
        } else if (compIndex !== undefined && compIndex !== null) {
            var it2 = app.project.item(compIndex);
            if (it2 && it2 instanceof CompItem) { target = it2; }
        }
        if (!target) { throw new Error("Composition not found"); }
        var nm = target.name;
        target.remove();
        return JSON.stringify({ status: "success", message: "Composition deleted", name: nm }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// ===== Community-contributed bridge functions (ported into this bundle) ==========
// removeKeyframe — ported from PR #28 by @dellis23
//   https://github.com/Dakkshin/after-effects-mcp/pull/28
// getRendererInfo / setRenderer — ported from PR #25 by @Boke-kun (elias)
//   https://github.com/Dakkshin/after-effects-mcp/pull/25

// --- removeKeyframe: remove keyframe(s) by time, 1-based key index, or all ---
function removeKeyframe(args) {
    try {
        var compIndex = args.compIndex;
        var layerIndex = args.layerIndex;
        var propertyName = args.propertyName;
        var timeInSeconds = args.timeInSeconds;

        // Find comp (same logic as setLayerKeyframe)
        var comp = null;
        if (compIndex === 0 || compIndex === undefined || compIndex === null) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
        } else {
            comp = app.project.items[compIndex];
        }
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found" });
        }

        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex });
        }

        // Find property (same search logic as setLayerKeyframe)
        var transformGroup = layer.property("Transform");
        var property = transformGroup ? transformGroup.property(propertyName) : null;
        if (!property) {
            if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                property = layer.property("Effects").property(propertyName);
            }
            if (!property && layer.property("Effects")) {
                var effects = layer.property("Effects");
                for (var ei = 1; ei <= effects.numProperties; ei++) {
                    try {
                        var subProp = effects.property(ei).property(propertyName);
                        if (subProp) { property = subProp; break; }
                    } catch (e2) {}
                }
            }
            if (!property) {
                return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found" });
            }
        }

        if (property.numKeys === 0) {
            return JSON.stringify({ success: false, message: "Property has no keyframes" });
        }

        var keyIndex = args.keyIndex; // 1-based keyframe index
        var removeAll = args.removeAll || false;

        if (removeAll) {
            // Remove all keyframes (iterate backwards)
            var count = property.numKeys;
            for (var ki = count; ki >= 1; ki--) {
                property.removeKey(ki);
            }
            return JSON.stringify({ success: true, message: "Removed all " + count + " keyframes from '" + propertyName + "' on layer '" + layer.name + "'" });
        } else if (keyIndex !== undefined && keyIndex !== null) {
            // Remove by keyframe index
            if (keyIndex < 1 || keyIndex > property.numKeys) {
                return JSON.stringify({ success: false, message: "Key index " + keyIndex + " out of range (1 to " + property.numKeys + ")" });
            }
            var removedTime = property.keyTime(keyIndex);
            property.removeKey(keyIndex);
            return JSON.stringify({ success: true, message: "Keyframe " + keyIndex + " removed at " + removedTime + "s from '" + propertyName + "' on layer '" + layer.name + "'" });
        } else if (timeInSeconds !== undefined && timeInSeconds !== null) {
            // Remove by time (nearest match within tolerance)
            var nearestIdx = property.nearestKeyIndex(timeInSeconds);
            var nearestTime = property.keyTime(nearestIdx);
            if (Math.abs(nearestTime - timeInSeconds) < 0.05) {
                property.removeKey(nearestIdx);
                return JSON.stringify({ success: true, message: "Keyframe removed at " + nearestTime + "s from '" + propertyName + "' on layer '" + layer.name + "'" });
            } else {
                return JSON.stringify({ success: false, message: "No keyframe found at " + timeInSeconds + "s (nearest is at " + nearestTime + "s)" });
            }
        } else {
            return JSON.stringify({ success: false, message: "Must specify timeInSeconds, keyIndex, or removeAll" });
        }
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error: " + e.toString() });
    }
}

// --- getRendererInfo: report a comp's current and available 3D renderers ---
function getRendererInfo(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var renderers = [];
        try {
            var rendererList = comp.renderers;
            for (var i = 0; i < rendererList.length; i++) {
                renderers.push(rendererList[i]);
            }
        } catch (e) {
            // Fallback: known renderer names
            renderers = ["ADBE Ernst", "ADBE Advanced 3d"];
        }
        return JSON.stringify({
            status: "success",
            message: "Renderer info retrieved",
            currentRenderer: comp.renderer,
            availableRenderers: renderers,
            rendererDescriptions: {
                "ADBE Ernst": "Classic 3D renderer",
                "ADBE Advanced 3d": "Cinema 4D / Advanced 3D renderer"
            }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setRenderer: set a comp's 3D renderer by match name ---
function setRenderer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var renderer = args.renderer || "ADBE Ernst";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var oldRenderer = comp.renderer;
        comp.renderer = renderer;
        return JSON.stringify({
            status: "success", message: "Renderer set from '" + oldRenderer + "' to '" + renderer + "'",
            composition: { name: comp.name, renderer: comp.renderer }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setLayerProperties (modified to handle text properties) ---
function setLayerProperties(args) {
    try {
        var compName = args.compName || "";
        var layerName = args.layerName || "";
        var layerIndex = args.layerIndex; 
        
        // General Properties
        var position = args.position; 
        var scale = args.scale; 
        var rotation = args.rotation; 
        var opacity = args.opacity; 
        var startTime = args.startTime; 
        var duration = args.duration; 

        // Text Specific Properties
        var textContent = args.text; // New: text content
        var fontFamily = args.fontFamily; // New: font family
        var fontSize = args.fontSize; // New: font size
        var fillColor = args.fillColor; // New: font color
        
        // Find the composition (same logic as before)
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        
        // Find the layer (same logic as before)
        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); } 
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }
        
        var changedProperties = [];
        var textDocumentChanged = false;
        var textProp = null;
        var textDocument = null;

        // --- Text Property Handling ---
        if (layer instanceof TextLayer && (textContent !== undefined || fontFamily !== undefined || fontSize !== undefined || fillColor !== undefined)) {
            var sourceTextProp = layer.property("Source Text");
            if (sourceTextProp && sourceTextProp.value) {
                var currentTextDocument = sourceTextProp.value; // Get the current value
                var updated = false;

                if (textContent !== undefined && textContent !== null && currentTextDocument.text !== textContent) {
                    currentTextDocument.text = textContent;
                    changedProperties.push("text");
                    updated = true;
                }
                if (fontFamily !== undefined && fontFamily !== null && currentTextDocument.font !== fontFamily) {
                    // Add basic validation/logging for font existence if needed
                    // try { app.fonts.findFont(fontFamily); } catch (e) { logToPanel("Warning: Font '"+fontFamily+"' might not be installed."); }
                    currentTextDocument.font = fontFamily;
                    changedProperties.push("fontFamily");
                    updated = true;
                }
                if (fontSize !== undefined && fontSize !== null && currentTextDocument.fontSize !== fontSize) {
                    currentTextDocument.fontSize = fontSize;
                    changedProperties.push("fontSize");
                    updated = true;
                }
                // Comparing colors needs care due to potential floating point inaccuracies if set via UI
                // Simple comparison for now
                if (fillColor !== undefined && fillColor !== null && 
                    (currentTextDocument.fillColor[0] !== fillColor[0] || 
                     currentTextDocument.fillColor[1] !== fillColor[1] || 
                     currentTextDocument.fillColor[2] !== fillColor[2])) {
                    currentTextDocument.fillColor = fillColor;
                    changedProperties.push("fillColor");
                    updated = true;
                }

                // Only set the value if something actually changed
                if (updated) {
                    try {
                        sourceTextProp.setValue(currentTextDocument);
                        logToPanel("Applied changes to Text Document for layer: " + layer.name);
                    } catch (e) {
                        logToPanel("ERROR applying Text Document changes: " + e.toString());
                        // Decide if we should throw or just log the error for text properties
                        // For now, just log, other properties might still succeed
                    }
                }
                 // Store the potentially updated document for the return value
                 textDocument = currentTextDocument; 

            } else {
                logToPanel("Warning: Could not access Source Text property for layer: " + layer.name);
            }
        }

        // --- Enabled/Visible ---
        var enabled = args.enabled;
        if (enabled !== undefined && enabled !== null) { layer.enabled = !!enabled; changedProperties.push("enabled"); }

        // --- Blend Mode ---
        var blendMode = args.blendMode;
        if (blendMode !== undefined && blendMode !== null) {
            var modes = {
                "normal": BlendingMode.NORMAL,
                "add": BlendingMode.ADD,
                "multiply": BlendingMode.MULTIPLY,
                "screen": BlendingMode.SCREEN,
                "overlay": BlendingMode.OVERLAY,
                "softLight": BlendingMode.SOFT_LIGHT,
                "hardLight": BlendingMode.HARD_LIGHT,
                "colorDodge": BlendingMode.COLOR_DODGE,
                "colorBurn": BlendingMode.COLOR_BURN,
                "darken": BlendingMode.DARKEN,
                "lighten": BlendingMode.LIGHTEN,
                "difference": BlendingMode.DIFFERENCE,
                "exclusion": BlendingMode.EXCLUSION,
                "hue": BlendingMode.HUE,
                "saturation": BlendingMode.SATURATION,
                "color": BlendingMode.COLOR,
                "luminosity": BlendingMode.LUMINOSITY
            };
            if (modes[blendMode] !== undefined) {
                layer.blendingMode = modes[blendMode];
                changedProperties.push("blendMode");
            }
        }

        // --- Track Matte ---
        var trackMatteType = args.trackMatteType;
        if (trackMatteType !== undefined && trackMatteType !== null) {
            // Values: "none", "alpha", "alphaInverted", "luma", "lumaInverted"
            var matteTypes = {
                "none": TrackMatteType.NO_TRACK_MATTE,
                "alpha": TrackMatteType.ALPHA,
                "alphaInverted": TrackMatteType.ALPHA_INVERTED,
                "luma": TrackMatteType.LUMA,
                "lumaInverted": TrackMatteType.LUMA_INVERTED
            };
            if (matteTypes[trackMatteType] !== undefined) {
                layer.trackMatteType = matteTypes[trackMatteType];
                changedProperties.push("trackMatteType");
            }
        }

        // --- General Property Handling ---
        var threeDLayer = args.threeDLayer;
        if (threeDLayer !== undefined && threeDLayer !== null) { layer.threeDLayer = !!threeDLayer; changedProperties.push("threeDLayer"); }
        if (position !== undefined && position !== null) {
            var posProp = layer.property("Position");
            if (posProp.numKeys > 0) { while (posProp.numKeys > 0) { posProp.removeKey(1); } }
            posProp.setValue(position);
            changedProperties.push("position");
        }
        if (scale !== undefined && scale !== null) { layer.property("Scale").setValue(scale); changedProperties.push("scale"); }
        if (rotation !== undefined && rotation !== null) {
            if (layer.threeDLayer) { 
                // For 3D layers, Z rotation is often what's intended by a single value
                layer.property("Z Rotation").setValue(rotation);
            } else { 
                layer.property("Rotation").setValue(rotation); 
            }
            changedProperties.push("rotation");
        }
        if (opacity !== undefined && opacity !== null) { layer.property("Opacity").setValue(opacity); changedProperties.push("opacity"); }
        if (startTime !== undefined && startTime !== null) { layer.startTime = startTime; changedProperties.push("startTime"); }
        if (duration !== undefined && duration !== null && duration > 0) {
            var actualStartTime = (startTime !== undefined && startTime !== null) ? startTime : layer.startTime;
            layer.outPoint = actualStartTime + duration;
            changedProperties.push("duration");
        }

        // Return success with updated layer details (including text if changed)
        var returnLayerInfo = {
            name: layer.name,
            index: layer.index,
            threeDLayer: layer.threeDLayer,
            position: layer.property("Position").value,
            scale: layer.property("Scale").value,
            rotation: layer.threeDLayer ? layer.property("Z Rotation").value : layer.property("Rotation").value, // Return appropriate rotation
            opacity: layer.property("Opacity").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            changedProperties: changedProperties
        };
        // Add text properties to the return object if it was a text layer
        if (layer instanceof TextLayer && textDocument) {
            returnLayerInfo.text = textDocument.text;
            returnLayerInfo.fontFamily = textDocument.font;
            returnLayerInfo.fontSize = textDocument.fontSize;
            returnLayerInfo.fillColor = textDocument.fillColor;
        }

        // *** ADDED LOGGING HERE ***
        logToPanel("Final check before return:");
        logToPanel("  Changed Properties: " + changedProperties.join(", "));
        logToPanel("  Return Layer Info Font: " + (returnLayerInfo.fontFamily || "N/A")); 
        logToPanel("  TextDocument Font: " + (textDocument ? textDocument.font : "N/A"));

        return JSON.stringify({
            status: "success", message: "Layer properties updated successfully",
            layer: returnLayerInfo
        }, null, 2);
    } catch (error) {
        // Error handling remains similar, but add more specific checks if needed
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- batchSetLayerProperties: apply properties to multiple layers in one call ---
function batchSetLayerProperties(args) {
    try {
        var compName = args.compName || "";
        var operations = args.operations; // Array of {layerIndex, threeDLayer, position, scale, rotation, opacity, ...}

        if (!operations || !operations.length) {
            throw new Error("No operations provided. Pass an array of {layerIndex, ...properties}");
        }

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }

        var results = [];
        for (var o = 0; o < operations.length; o++) {
            var op = operations[o];
            var layer = null;
            if (op.layerIndex !== undefined && op.layerIndex !== null) {
                if (op.layerIndex > 0 && op.layerIndex <= comp.numLayers) { layer = comp.layer(op.layerIndex); }
                else { results.push({ layerIndex: op.layerIndex, status: "error", message: "Layer index out of bounds" }); continue; }
            } else if (op.layerName) {
                for (var j = 1; j <= comp.numLayers; j++) {
                    if (comp.layer(j).name === op.layerName) { layer = comp.layer(j); break; }
                }
            }
            if (!layer) { results.push({ layerIndex: op.layerIndex, layerName: op.layerName, status: "error", message: "Layer not found" }); continue; }

            var changed = [];
            if (op.threeDLayer !== undefined && op.threeDLayer !== null) { layer.threeDLayer = !!op.threeDLayer; changed.push("threeDLayer"); }
            if (op.position !== undefined && op.position !== null) {
                var posProp = layer.property("Position");
                if (posProp.numKeys > 0) {
                    while (posProp.numKeys > 0) { posProp.removeKey(1); }
                }
                posProp.setValue(op.position);
                changed.push("position");
            }
            if (op.scale !== undefined && op.scale !== null) { layer.property("Scale").setValue(op.scale); changed.push("scale"); }
            if (op.rotation !== undefined && op.rotation !== null) {
                if (layer.threeDLayer) { layer.property("Z Rotation").setValue(op.rotation); }
                else { layer.property("Rotation").setValue(op.rotation); }
                changed.push("rotation");
            }
            if (op.opacity !== undefined && op.opacity !== null) { layer.property("Opacity").setValue(op.opacity); changed.push("opacity"); }
            if (op.blendMode !== undefined && op.blendMode !== null) {
                var bModes = {"normal":BlendingMode.NORMAL,"add":BlendingMode.ADD,"multiply":BlendingMode.MULTIPLY,"screen":BlendingMode.SCREEN,"overlay":BlendingMode.OVERLAY,"softLight":BlendingMode.SOFT_LIGHT,"hardLight":BlendingMode.HARD_LIGHT,"darken":BlendingMode.DARKEN,"lighten":BlendingMode.LIGHTEN,"difference":BlendingMode.DIFFERENCE};
                if (bModes[op.blendMode] !== undefined) { layer.blendingMode = bModes[op.blendMode]; changed.push("blendMode"); }
            }
            if (op.startTime !== undefined && op.startTime !== null) { layer.startTime = op.startTime; changed.push("startTime"); }
            if (op.outPoint !== undefined && op.outPoint !== null) { layer.outPoint = op.outPoint; changed.push("outPoint"); }

            results.push({
                layerIndex: layer.index,
                name: layer.name,
                status: "success",
                threeDLayer: layer.threeDLayer,
                position: layer.property("Position").value,
                changedProperties: changed
            });
        }

        return JSON.stringify({ status: "success", results: results }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

/**
 * Sets a keyframe for a specific property on a layer.
 * Indices are 1-based for After Effects collections.
 * @param {number} compIndex - The index of the composition (1-based).
 * @param {number} layerIndex - The index of the layer within the composition (1-based).
 * @param {string} propertyName - The name of the property (e.g., "Position", "Scale", "Rotation", "Opacity").
 * @param {number} timeInSeconds - The time (in seconds) for the keyframe.
 * @param {any} value - The value for the keyframe (e.g., [x, y] for Position, [w, h] for Scale, angle for Rotation, percentage for Opacity).
 * @returns {string} JSON string indicating success or error.
 */
function setLayerKeyframe(compIndex, layerIndex, propertyName, timeInSeconds, value) {
    try {
        // Use 1-based indices as per After Effects API
        var comp = app.project.items[compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("Transform");
        if (!transformGroup) {
             return JSON.stringify({ success: false, message: "Transform properties not found for layer '" + layer.name + "' (type: " + layer.matchName + ")." });
        }

        var property = transformGroup.property(propertyName);
        if (!property) {
            // Check other common property groups if not in Transform
             if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                 property = layer.property("Effects").property(propertyName);
             } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                 property = layer.property("Text").property(propertyName);
            } // Add more groups if needed (e.g., Masks, Shapes)

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }


        // Ensure the property can be keyframed
        if (!property.canVaryOverTime) {
             return JSON.stringify({ success: false, message: "Property '" + propertyName + "' cannot be keyframed." });
        }

        // Make sure the property is enabled for keyframing
        if (property.numKeys === 0 && !property.isTimeVarying) {
             property.setValueAtTime(comp.time, property.value); // Set initial keyframe if none exist
        }


        property.setValueAtTime(timeInSeconds, value);

        return JSON.stringify({ success: true, message: "Keyframe set for '" + propertyName + "' on layer '" + layer.name + "' at " + timeInSeconds + "s." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting keyframe: " + e.toString() + " (Line: " + e.line + ")" });
    }
}


/**
 * Sets an expression for a specific property on a layer.
 * @param {number} compIndex - The index of the composition (1-based).
 * @param {number} layerIndex - The index of the layer within the composition (1-based).
 * @param {string} propertyName - The name of the property (e.g., "Position", "Scale", "Rotation", "Opacity").
 * @param {string} expressionString - The JavaScript expression string. Use "" to remove expression.
 * @returns {string} JSON string indicating success or error.
 */
function setLayerExpression(compIndex, layerIndex, propertyName, expressionString) {
    try {
         // Adjust indices to be 0-based for ExtendScript arrays
        var comp = app.project.items[compIndex];
         if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
         if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("Transform");
         if (!transformGroup) {
             // Allow expressions on non-transformable layers if property exists elsewhere
             // return JSON.stringify({ success: false, message: "Transform properties not found for layer '" + layer.name + "' (type: " + layer.matchName + ")." });
        }

        var property = transformGroup ? transformGroup.property(propertyName) : null;
         if (!property) {
            // Check other common property groups if not in Transform
             if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                 property = layer.property("Effects").property(propertyName);
             } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                 property = layer.property("Text").property(propertyName);
             }

            // Search inside individual effects for sub-properties
            if (!property && layer.property("Effects")) {
                var effects = layer.property("Effects");
                for (var ei = 1; ei <= effects.numProperties; ei++) {
                    var eff = effects.property(ei);
                    try {
                        var subProp = eff.property(propertyName);
                        if (subProp) { property = subProp; break; }
                    } catch (e2) {}
                }
            }

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }

        if (!property.canSetExpression) {
            return JSON.stringify({ success: false, message: "Property '" + propertyName + "' does not support expressions." });
        }

        property.expression = expressionString;

        var action = expressionString === "" ? "removed" : "set";
        return JSON.stringify({ success: true, message: "Expression " + action + " for '" + propertyName + "' on layer '" + layer.name + "'." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

// --- applyEffect (from applyEffect.jsx) ---
function applyEffect(args) {
    try {
        // Extract parameters
        var compIndex = args.compIndex || 1; // Default to first comp
        var layerIndex = args.layerIndex || 1; // Default to first layer
        var effectName = args.effectName; // Name of the effect to apply
        var effectMatchName = args.effectMatchName; // After Effects internal name (more reliable)
        var effectCategory = args.effectCategory || ""; // Optional category for filtering
        var presetPath = args.presetPath; // Optional path to an effect preset
        var effectSettings = args.effectSettings || {}; // Optional effect parameters
        
        if (!effectName && !effectMatchName && !presetPath) {
            throw new Error("You must specify either effectName, effectMatchName, or presetPath");
        }
        
        // Find the composition by index
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        // Find the layer by index
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        var effectResult;
        
        // Apply preset if a path is provided
        if (presetPath) {
            var presetFile = new File(presetPath);
            if (!presetFile.exists) {
                throw new Error("Effect preset file not found: " + presetPath);
            }
            
            // Apply the preset to the layer
            layer.applyPreset(presetFile);
            effectResult = {
                type: "preset",
                name: presetPath.split('/').pop().split('\\').pop(),
                applied: true
            };
        }
        // Apply effect by match name (more reliable method)
        else if (effectMatchName) {
            var effect = layer.Effects.addProperty(effectMatchName);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex
            };
            
            // Apply settings if provided
            applyEffectSettings(effect, effectSettings);
        }
        // Apply effect by display name
        else {
            // Get the effect from the Effect menu
            var effect = layer.Effects.addProperty(effectName);
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex
            };
            
            // Apply settings if provided
            applyEffectSettings(effect, effectSettings);
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect applied successfully",
            effect: effectResult,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// Helper function to apply effect settings
function applyEffectSettings(effect, settings) {
    // Skip if no settings are provided
    if (!settings) return;
    var hasKeys = false;
    for (var k in settings) { if (settings.hasOwnProperty(k)) { hasKeys = true; break; } }
    if (!hasKeys) return;
    
    // Iterate through all provided settings
    for (var propName in settings) {
        if (settings.hasOwnProperty(propName)) {
            try {
                // Find the property in the effect
                var property = null;
                
                // Try direct property access first
                try {
                    property = effect.property(propName);
                } catch (e) {
                    // If direct access fails, search through all properties
                    for (var i = 1; i <= effect.numProperties; i++) {
                        var prop = effect.property(i);
                        if (prop.name === propName) {
                            property = prop;
                            break;
                        }
                    }
                }
                
                // Set the property value if found
                if (property && property.setValue) {
                    property.setValue(settings[propName]);
                }
            } catch (e) {
                // Log error but continue with other properties
                $.writeln("Error setting effect property '" + propName + "': " + e.toString());
            }
        }
    }
}

// --- applyEffectTemplate (from applyEffectTemplate.jsx) ---
function applyEffectTemplate(args) {
    try {
        // Extract parameters
        var compIndex = args.compIndex || 1; // Default to first comp
        var layerIndex = args.layerIndex || 1; // Default to first layer
        var templateName = args.templateName; // Name of the template to apply
        var customSettings = args.customSettings || {}; // Optional customizations
        
        if (!templateName) {
            throw new Error("You must specify a templateName");
        }
        
        // Find the composition by index
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        // Find the layer by index
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        // Template definitions
        var templates = {
            // Blur effects
            "gaussian-blur": {
                effectMatchName: "ADBE Gaussian Blur 2",
                settings: {
                    "Blurriness": customSettings.blurriness || 20
                }
            },
            "directional-blur": {
                effectMatchName: "ADBE Directional Blur",
                settings: {
                    "Direction": customSettings.direction || 0,
                    "Blur Length": customSettings.length || 10
                }
            },
            
            // Color correction effects
            "color-balance": {
                effectMatchName: "ADBE Color Balance (HLS)",
                settings: {
                    "Hue": customSettings.hue || 0,
                    "Lightness": customSettings.lightness || 0,
                    "Saturation": customSettings.saturation || 0
                }
            },
            "brightness-contrast": {
                effectMatchName: "ADBE Brightness & Contrast 2",
                settings: {
                    "Brightness": customSettings.brightness || 0,
                    "Contrast": customSettings.contrast || 0,
                    "Use Legacy": false
                }
            },
            "curves": {
                effectMatchName: "ADBE CurvesCustom",
                // Curves are complex and would need special handling
            },
            
            // Stylistic effects
            "glow": {
                effectMatchName: "ADBE Glow",
                settings: {
                    "Glow Threshold": customSettings.threshold || 50,
                    "Glow Radius": customSettings.radius || 15,
                    "Glow Intensity": customSettings.intensity || 1
                }
            },
            "drop-shadow": {
                effectMatchName: "ADBE Drop Shadow",
                settings: {
                    "Shadow Color": customSettings.color || [0, 0, 0, 1],
                    "Opacity": customSettings.opacity || 50,
                    "Direction": customSettings.direction || 135,
                    "Distance": customSettings.distance || 10,
                    "Softness": customSettings.softness || 10
                }
            },
            
            // Common effect chains
            "cinematic-look": {
                effects: [
                    {
                        effectMatchName: "ADBE CurvesCustom",
                        settings: {}
                    },
                    {
                        effectMatchName: "ADBE Vibrance",
                        settings: {
                            "Vibrance": 15,
                            "Saturation": -5
                        }
                    }
                ]
            },
            "text-pop": {
                effects: [
                    {
                        effectMatchName: "ADBE Drop Shadow",
                        settings: {
                            "Shadow Color": [0, 0, 0, 1],
                            "Opacity": 75,
                            "Distance": 5,
                            "Softness": 10
                        }
                    },
                    {
                        effectMatchName: "ADBE Glow",
                        settings: {
                            "Glow Threshold": 50,
                            "Glow Radius": 10,
                            "Glow Intensity": 1.5
                        }
                    }
                ]
            }
        };
        
        // Check if the requested template exists
        var template = templates[templateName];
        if (!template) {
            var availableTemplates = Object.keys(templates).join(", ");
            throw new Error("Template '" + templateName + "' not found. Available templates: " + availableTemplates);
        }
        
        var appliedEffects = [];
        
        // Apply single effect or multiple effects based on template structure
        if (template.effectMatchName) {
            // Single effect template
            var effect = layer.Effects.addProperty(template.effectMatchName);
            
            // Apply settings
            for (var propName in template.settings) {
                try {
                    var property = effect.property(propName);
                    if (property) {
                        property.setValue(template.settings[propName]);
                    }
                } catch (e) {
                    $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                }
            }
            
            appliedEffects.push({
                name: effect.name,
                matchName: effect.matchName
            });
        } else if (template.effects) {
            // Multiple effects template
            for (var i = 0; i < template.effects.length; i++) {
                var effectData = template.effects[i];
                var effect = layer.Effects.addProperty(effectData.effectMatchName);
                
                // Apply settings
                for (var propName in effectData.settings) {
                    try {
                        var property = effect.property(propName);
                        if (property) {
                            property.setValue(effectData.settings[propName]);
                        }
                    } catch (e) {
                        $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                    }
                }
                
                appliedEffects.push({
                    name: effect.name,
                    matchName: effect.matchName
                });
            }
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect template '" + templateName + "' applied successfully",
            appliedEffects: appliedEffects,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

// --- End of Function Definitions ---

// --- Bridge test function to verify communication and effects application ---
function bridgeTestEffects(args) {
    try {
        var compIndex = (args && args.compIndex) ? args.compIndex : 1;
        var layerIndex = (args && args.layerIndex) ? args.layerIndex : 1;

        // Apply a light Gaussian Blur
        var blurRes = JSON.parse(applyEffect({
            compIndex: compIndex,
            layerIndex: layerIndex,
            effectMatchName: "ADBE Gaussian Blur 2",
            effectSettings: { "Blurriness": 5 }
        }));

        // Apply a simple drop shadow via template
        var shadowRes = JSON.parse(applyEffectTemplate({
            compIndex: compIndex,
            layerIndex: layerIndex,
            templateName: "drop-shadow"
        }));

        return JSON.stringify({
            status: "success",
            message: "Bridge test effects applied.",
            results: [blurRes, shadowRes]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}

// JSON polyfill for ExtendScript (when JSON is undefined)
if (typeof JSON === "undefined") {
    JSON = {};
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        // Safe-ish fallback for trusted input (our own command file)
        return eval("(" + text + ")");
    };
}
if (typeof JSON.stringify !== "function") {
    (function () {
        function esc(str) {
            return (str + "")
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t");
        }
        function toJSON(val) {
            if (val === null) return "null";
            var t = typeof val;
            if (t === "number" || t === "boolean") return String(val);
            if (t === "string") return '"' + esc(val) + '"';
            if (val instanceof Array) {
                var a = [];
                for (var i = 0; i < val.length; i++) a.push(toJSON(val[i]));
                return "[" + a.join(",") + "]";
            }
            if (t === "object") {
                var props = [];
                for (var k in val) {
                    if (val.hasOwnProperty(k) && typeof val[k] !== "function" && typeof val[k] !== "undefined") {
                        props.push('"' + esc(k) + '":' + toJSON(val[k]));
                    }
                }
                return "{" + props.join(",") + "}";
            }
            return "null";
        }
        JSON.stringify = function (value, _replacer, _space) {
            return toJSON(value);
        };
    })();
}

// Detect AE version (AE 2025 = version 25.x, AE 2026 = version 26.x)
var aeVersion = parseFloat(app.version);
var isAE2025OrLater = aeVersion >= 25.0;

// Always create a floating palette window for AE 2025+
var panel = new Window("palette", "MCP Bridge Auto", undefined);
panel.orientation = "column";
panel.alignChildren = ["fill", "top"];
panel.spacing = 10;
panel.margins = 16;

// Status display
var statusText = panel.add("statictext", undefined, "Waiting for commands...");
statusText.alignment = ["fill", "top"];

// Add log area
var logPanel = panel.add("panel", undefined, "Command Log");
logPanel.orientation = "column";
logPanel.alignChildren = ["fill", "fill"];
var logText = logPanel.add("edittext", undefined, "", {multiline: true, readonly: true});
logText.preferredSize.height = 200;

// AE 2025 warning
if (isAE2025OrLater) {
    var warning = panel.add("statictext", undefined, "AE 2025+: Dockable panels are not supported. Floating window only.");
    warning.graphics.foregroundColor = warning.graphics.newPen(warning.graphics.PenType.SOLID_COLOR, [1,0.3,0,1], 1);
}

// Auto-run checkbox
var autoRunCheckbox = panel.add("checkbox", undefined, "Auto-run commands");
autoRunCheckbox.value = true;

// Check interval (ms)
var checkInterval = 2000;
var isChecking = false;

// Command file path - use Documents folder for reliable access
function getCommandFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_command.json";
}

// Result file path - use Documents folder for reliable access
function getResultFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_mcp_result.json";
}

// --- setCompositionProperties: set duration, frameRate, etc. on active or named comp ---
function setCompositionProperties(args) {
    try {
        var compName = args.compName || "";
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; }
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var changed = [];
        if (args.duration !== undefined && args.duration !== null) { comp.duration = args.duration; changed.push("duration"); }
        if (args.frameRate !== undefined && args.frameRate !== null) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.width !== undefined && args.width !== null && args.height !== undefined && args.height !== null) {
            comp.width = args.width; comp.height = args.height; changed.push("dimensions");
        }
        return JSON.stringify({
            status: "success",
            composition: { name: comp.name, duration: comp.duration, frameRate: comp.frameRate, width: comp.width, height: comp.height },
            changedProperties: changed
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// Functions for each script type
function getProjectInfo() {
    var project = app.project;
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        path: project.file ? project.file.fsName : "",
        numItems: project.numItems,
        bitsPerChannel: project.bitsPerChannel,
        timeMode: project.timeDisplayType === TimeDisplayType.FRAMES ? "Frames" : "Timecode",
        items: []
    };

    // Count item types
    var countByType = {
        compositions: 0,
        footage: 0,
        folders: 0,
        solids: 0
    };

    // Get item information (limited for performance)
    for (var i = 1; i <= Math.min(project.numItems, 50); i++) {
        var item = project.item(i);
        var itemType = "";
        
        if (item instanceof CompItem) {
            itemType = "Composition";
            countByType.compositions++;
        } else if (item instanceof FolderItem) {
            itemType = "Folder";
            countByType.folders++;
        } else if (item instanceof FootageItem) {
            if (item.mainSource instanceof SolidSource) {
                itemType = "Solid";
                countByType.solids++;
            } else {
                itemType = "Footage";
                countByType.footage++;
            }
        }
        
        result.items.push({
            id: item.id,
            name: item.name,
            type: itemType
        });
    }
    
    result.itemCounts = countByType;

    // Include active composition metadata if available
    if (app.project.activeItem instanceof CompItem) {
        var ac = app.project.activeItem;
        result.activeComp = {
            id: ac.id,
            name: ac.name,
            width: ac.width,
            height: ac.height,
            duration: ac.duration,
            frameRate: ac.frameRate,
            numLayers: ac.numLayers
        };
    }

    return JSON.stringify(result, null, 2);
}

function listCompositions() {
    var project = app.project;
    var result = {
        compositions: []
    };
    
    // Loop through items in the project
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        
        // Check if the item is a composition
        if (item instanceof CompItem) {
            result.compositions.push({
                id: item.id,
                name: item.name,
                duration: item.duration,
                frameRate: item.frameRate,
                width: item.width,
                height: item.height,
                numLayers: item.numLayers
            });
        }
    }
    
    return JSON.stringify(result, null, 2);
}

function getLayerInfo() {
    var project = app.project;
    var result = {
        layers: []
    };
    
    // Get the active composition
    var activeComp = null;
    if (app.project.activeItem instanceof CompItem) {
        activeComp = app.project.activeItem;
    } else {
        return JSON.stringify({ error: "No active composition" }, null, 2);
    }
    
    // Loop through layers in the active composition
    for (var i = 1; i <= activeComp.numLayers; i++) {
        var layer = activeComp.layer(i);
        var layerInfo = {
            index: layer.index,
            name: layer.name,
            enabled: layer.enabled,
            locked: layer.locked,
            threeDLayer: layer.threeDLayer,
            position: layer.property("Position").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint
        };
        
        result.layers.push(layerInfo);
    }
    
    return JSON.stringify(result, null, 2);
}

// Execute command
function executeCommand(command, args) {
    var result = "";

    logToPanel("Executing command: " + command);
    statusText.text = "Running: " + command;
    panel.update();

    try {
        logToPanel("Attempting to execute: " + command); // Log before switch
        // Use a switch statement for clarity
        switch (command) {
            case "getProjectInfo":
                result = getProjectInfo();
                break;
            case "listCompositions":
                result = listCompositions();
                break;
            case "getLayerInfo":
                result = getLayerInfo();
                break;
            case "createComposition":
                logToPanel("Calling createComposition function...");
                result = createComposition(args);
                logToPanel("Returned from createComposition.");
                break;
            case "createTextLayer":
                logToPanel("Calling createTextLayer function...");
                result = createTextLayer(args);
                logToPanel("Returned from createTextLayer.");
                break;
            case "createShapeLayer":
                logToPanel("Calling createShapeLayer function...");
                result = createShapeLayer(args);
                logToPanel("Returned from createShapeLayer. Result type: " + typeof result);
                break;
            case "createSolidLayer":
                logToPanel("Calling createSolidLayer function...");
                result = createSolidLayer(args);
                logToPanel("Returned from createSolidLayer.");
                break;
            case "setLayerProperties":
                logToPanel("Calling setLayerProperties function...");
                result = setLayerProperties(args);
                logToPanel("Returned from setLayerProperties.");
                break;
            case "setLayerKeyframe":
                logToPanel("Calling setLayerKeyframe function...");
                result = setLayerKeyframe(args.compIndex, args.layerIndex, args.propertyName, args.timeInSeconds, args.value);
                logToPanel("Returned from setLayerKeyframe.");
                break;
            case "setLayerExpression":
                logToPanel("Calling setLayerExpression function...");
                result = setLayerExpression(args.compIndex, args.layerIndex, args.propertyName, args.expressionString);
                logToPanel("Returned from setLayerExpression.");
                break;
            case "applyEffect":
                logToPanel("Calling applyEffect function...");
                result = applyEffect(args);
                logToPanel("Returned from applyEffect.");
                break;
            case "applyEffectTemplate":
                logToPanel("Calling applyEffectTemplate function...");
                result = applyEffectTemplate(args);
                logToPanel("Returned from applyEffectTemplate.");
                break;
            case "bridgeTestEffects":
                logToPanel("Calling bridgeTestEffects function...");
                result = bridgeTestEffects(args);
                logToPanel("Returned from bridgeTestEffects.");
                break;
            case "createCamera":
                logToPanel("Calling createCamera function...");
                result = createCamera(args);
                logToPanel("Returned from createCamera.");
                break;
            case "batchSetLayerProperties":
                logToPanel("Calling batchSetLayerProperties function...");
                result = batchSetLayerProperties(args);
                logToPanel("Returned from batchSetLayerProperties.");
                break;
            case "setCompositionProperties":
                logToPanel("Calling setCompositionProperties function...");
                result = setCompositionProperties(args);
                logToPanel("Returned from setCompositionProperties.");
                break;
            case "duplicateLayer":
                logToPanel("Calling duplicateLayer function...");
                result = duplicateLayer(args);
                logToPanel("Returned from duplicateLayer.");
                break;
            case "deleteLayer":
                logToPanel("Calling deleteLayer function...");
                result = deleteLayer(args);
                logToPanel("Returned from deleteLayer.");
                break;
            case "setLayerMask":
                logToPanel("Calling setLayerMask function...");
                result = setLayerMask(args);
                logToPanel("Returned from setLayerMask.");
                break;
            case "saveFrame":
                logToPanel("Calling saveFrame function...");
                result = saveFrame(args);
                logToPanel("Returned from saveFrame.");
                break;
            case "moveLayer":
                logToPanel("Calling moveLayer function...");
                result = moveLayer(args);
                logToPanel("Returned from moveLayer.");
                break;
            case "deleteComposition":
                logToPanel("Calling deleteComposition function...");
                result = deleteComposition(args);
                logToPanel("Returned from deleteComposition.");
                break;
            case "importFootage":
                logToPanel("Calling importFootage function...");
                result = importFootage(args);
                logToPanel("Returned from importFootage.");
                break;
            case "precompose":
                logToPanel("Calling precompose function...");
                result = precompose(args);
                logToPanel("Returned from precompose.");
                break;
            case "setLayerParent":
                logToPanel("Calling setLayerParent function...");
                result = setLayerParent(args);
                logToPanel("Returned from setLayerParent.");
                break;
            case "createNull":
                logToPanel("Calling createNull function...");
                result = createNull(args);
                logToPanel("Returned from createNull.");
                break;
            case "setBlendMode":
                logToPanel("Calling setBlendMode function...");
                result = setBlendMode(args);
                logToPanel("Returned from setBlendMode.");
                break;
            case "setTrackMatte":
                logToPanel("Calling setTrackMatte function...");
                result = setTrackMatte(args);
                logToPanel("Returned from setTrackMatte.");
                break;
            case "removeEffect":
                logToPanel("Calling removeEffect function...");
                result = removeEffect(args);
                logToPanel("Returned from removeEffect.");
                break;
            case "reorderEffect":
                logToPanel("Calling reorderEffect function...");
                result = reorderEffect(args);
                logToPanel("Returned from reorderEffect.");
                break;
            case "createLight":
                logToPanel("Calling createLight function...");
                result = createLight(args);
                logToPanel("Returned from createLight.");
                break;
            case "set3DLayer":
                logToPanel("Calling set3DLayer function...");
                result = set3DLayer(args);
                logToPanel("Returned from set3DLayer.");
                break;
            case "renderComposition":
                logToPanel("Calling renderComposition function...");
                result = renderComposition(args);
                logToPanel("Returned from renderComposition.");
                break;
            case "setKeyframeEase":
                logToPanel("Calling setKeyframeEase function...");
                result = setKeyframeEase(args);
                logToPanel("Returned from setKeyframeEase.");
                break;
            case "applyTrimPaths":
                logToPanel("Calling applyTrimPaths function...");
                result = applyTrimPaths(args);
                logToPanel("Returned from applyTrimPaths.");
                break;
            case "addTextAnimator":
                logToPanel("Calling addTextAnimator function...");
                result = addTextAnimator(args);
                logToPanel("Returned from addTextAnimator.");
                break;
            case "saveProject":
                logToPanel("Calling saveProject function...");
                result = saveProject(args);
                logToPanel("Returned from saveProject.");
                break;
            case "getLayerDetails":
                logToPanel("Calling getLayerDetails function...");
                result = getLayerDetails(args);
                logToPanel("Returned from getLayerDetails.");
                break;
            case "removeKeyframe":
                logToPanel("Calling removeKeyframe function...");
                result = removeKeyframe(args);
                logToPanel("Returned from removeKeyframe.");
                break;
            case "getRendererInfo":
                logToPanel("Calling getRendererInfo function...");
                result = getRendererInfo(args);
                logToPanel("Returned from getRendererInfo.");
                break;
            case "setRenderer":
                logToPanel("Calling setRenderer function...");
                result = setRenderer(args);
                logToPanel("Returned from setRenderer.");
                break;
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        logToPanel("Execution finished for: " + command); // Log after switch
        
        // Save the result (ensure result is always a string)
        logToPanel("Preparing to write result file...");
        var resultString = (typeof result === 'string') ? result : JSON.stringify(result);
        
        // Try to parse the result as JSON to add a timestamp
        try {
            var resultObj = JSON.parse(resultString);
            // Add a timestamp to help identify if we're getting fresh results
            resultObj._responseTimestamp = new Date().toISOString();
            resultObj._commandExecuted = command;
            resultString = JSON.stringify(resultObj, null, 2);
            logToPanel("Added timestamp to result JSON for tracking freshness.");
        } catch (parseError) {
            // If it's not valid JSON, append the timestamp as a comment
            logToPanel("Could not parse result as JSON to add timestamp: " + parseError.toString());
            // We'll still continue with the original string
        }
        
        var resultFile = new File(getResultFilePath());
        resultFile.encoding = "UTF-8"; // Ensure UTF-8 encoding
        logToPanel("Opening result file for writing...");
        var opened = resultFile.open("w");
        if (!opened) {
            logToPanel("ERROR: Failed to open result file for writing: " + resultFile.fsName);
            throw new Error("Failed to open result file for writing.");
        }
        logToPanel("Writing to result file...");
        var written = resultFile.write(resultString);
        if (!written) {
             logToPanel("ERROR: Failed to write to result file (write returned false): " + resultFile.fsName);
             // Still try to close, but log the error
        }
        logToPanel("Closing result file...");
        var closed = resultFile.close();
         if (!closed) {
             logToPanel("ERROR: Failed to close result file: " + resultFile.fsName);
             // Continue, but log the error
        }
        logToPanel("Result file write process complete.");
        
        logToPanel("Command completed successfully: " + command); // Changed log message
        statusText.text = "Command completed: " + command;
        
        // Update command file status
        logToPanel("Updating command status to completed...");
        updateCommandStatus("completed");
        logToPanel("Command status updated.");
        
    } catch (error) {
        var errorMsg = "ERROR in executeCommand for '" + command + "': " + error.toString() + (error.line ? " (line: " + error.line + ")" : "");
        logToPanel(errorMsg); // Log detailed error
        statusText.text = "Error: " + error.toString();
        
        // Write detailed error to result file
        try {
            logToPanel("Attempting to write ERROR to result file...");
            var errorResult = JSON.stringify({ 
                status: "error", 
                command: command,
                message: error.toString(),
                line: error.line,
                fileName: error.fileName
            });
            var errorFile = new File(getResultFilePath());
            errorFile.encoding = "UTF-8";
            if (errorFile.open("w")) {
                errorFile.write(errorResult);
                errorFile.close();
                logToPanel("Successfully wrote ERROR to result file.");
            } else {
                 logToPanel("CRITICAL ERROR: Failed to open result file to write error!");
            }
        } catch (writeError) {
             logToPanel("CRITICAL ERROR: Failed to write error to result file: " + writeError.toString());
        }
        
        // Update command file status even after error
        logToPanel("Updating command status to error...");
        updateCommandStatus("error");
        logToPanel("Command status updated to error.");
    }
}

// Update command file status
function updateCommandStatus(status) {
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();
            
            if (content) {
                var commandData = JSON.parse(content);
                commandData.status = status;
                
                commandFile.open("w");
                commandFile.write(JSON.stringify(commandData, null, 2));
                commandFile.close();
            }
        }
    } catch (e) {
        logToPanel("Error updating command status: " + e.toString());
    }
}

// Log message to panel
function logToPanel(message) {
    var timestamp = new Date().toLocaleTimeString();
    logText.text = timestamp + ": " + message + "\n" + logText.text;
}

// Check for new commands
function checkForCommands() {
    if (!autoRunCheckbox.value || isChecking) return;
    
    isChecking = true;
    
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();
            
            if (content) {
                var commandData = (typeof JSON !== "undefined" && JSON.parse)
                    ? JSON.parse(content)
                    : eval("(" + content + ")");
                
                // Only execute pending commands
                if (commandData.status === "pending") {
                    // Update status to running
                    updateCommandStatus("running");
                    
                    // Execute the command
                    executeCommand(commandData.command, commandData.args || {});
                }
            }
        }
    } catch (e) {
        logToPanel("Error checking for commands: " + e.toString());
    }
    
    isChecking = false;
}

// Set up timer to check for commands
function startCommandChecker() {
    app.scheduleTask("checkForCommands()", checkInterval, true);
}

// Add manual check button
var checkButton = panel.add("button", undefined, "Check for Commands Now");
checkButton.onClick = function() {
    logToPanel("Manually checking for commands");
    checkForCommands();
};

// Log startup
logToPanel("MCP Bridge Auto started");
logToPanel("Command file: " + getCommandFilePath());
statusText.text = "Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF");

// Start the command checker
startCommandChecker();

// Show the panel
panel.center();
panel.show();

