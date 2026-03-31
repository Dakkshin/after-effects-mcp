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

        // --- General Property Handling ---
        if (position !== undefined && position !== null) { layer.property("Position").setValue(position); changedProperties.push("position"); }
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
             } // Add more groups if needed

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
    if (!settings || Object.keys(settings).length === 0) {
        return;
    }
    
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

// --- End of Original Function Definitions ---

// --- NEW FUNCTIONS ---

// --- createNullObject ---
function createNullObject(args) {
    try {
        var compIndex = args.compIndex || 1;
        var name = args.name || "Null";
        var startTime = args.startTime || 0;
        var duration = args.duration || 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var nullLayer = comp.layers.addNull(duration || comp.duration);
        nullLayer.name = name;
        nullLayer.startTime = startTime;
        return JSON.stringify({
            status: "success", message: "Null object created",
            layer: { name: nullLayer.name, index: nullLayer.index, inPoint: nullLayer.inPoint, outPoint: nullLayer.outPoint }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- createCamera ---
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

// --- createLight ---
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
            var lightTypeMap = { "PARALLEL": LightType.PARALLEL, "SPOT": LightType.SPOT, "POINT": LightType.POINT, "AMBIENT": LightType.AMBIENT };
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

// --- deleteLayer ---
function deleteLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var layerName = layer.name;
        layer.remove();
        return JSON.stringify({ status: "success", message: "Layer deleted: " + layerName, layerName: layerName }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- duplicateLayer ---
function duplicateLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var newLayer = layer.duplicate();
        return JSON.stringify({
            status: "success", message: "Layer duplicated",
            layer: { name: newLayer.name, index: newLayer.index, inPoint: newLayer.inPoint, outPoint: newLayer.outPoint }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- reorderLayer ---
function reorderLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var newIndex = args.newIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.moveToIndex(newIndex);
        return JSON.stringify({ status: "success", message: "Layer moved to index " + newIndex, layer: { name: layer.name, index: layer.index } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- renameLayer ---
function renameLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var newName = args.newName || "Layer";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var oldName = layer.name;
        layer.name = newName;
        return JSON.stringify({ status: "success", message: "Layer renamed from '" + oldName + "' to '" + newName + "'", layer: { name: layer.name, index: layer.index } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setLayerParent ---
function setLayerParent(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var parentLayerIndex = args.parentLayerIndex !== undefined ? args.parentLayerIndex : 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (parentLayerIndex === 0 || parentLayerIndex === null) {
            layer.parent = null;
            return JSON.stringify({ status: "success", message: "Layer parent cleared", layer: { name: layer.name, index: layer.index, parent: null } }, null, 2);
        } else {
            var parentLayer = comp.layer(parentLayerIndex);
            if (!parentLayer) throw new Error("Parent layer not found at index " + parentLayerIndex);
            layer.parent = parentLayer;
            return JSON.stringify({ status: "success", message: "Layer parent set", layer: { name: layer.name, index: layer.index, parent: { name: parentLayer.name, index: parentLayer.index } } }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setLayerBlendMode ---
function setLayerBlendMode(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var blendModeStr = args.blendMode || "NORMAL";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var blendModeMap = {
            "NORMAL": BlendingMode.NORMAL, "DISSOLVE": BlendingMode.DISSOLVE,
            "DANCING_DISSOLVE": BlendingMode.DANCING_DISSOLVE, "DARKEN": BlendingMode.DARKEN,
            "MULTIPLY": BlendingMode.MULTIPLY, "COLOR_BURN": BlendingMode.COLOR_BURN,
            "CLASSIC_COLOR_BURN": BlendingMode.CLASSIC_COLOR_BURN, "LINEAR_BURN": BlendingMode.LINEAR_BURN,
            "DARKER_COLOR": BlendingMode.DARKER_COLOR, "ADD": BlendingMode.ADD,
            "LIGHTEN": BlendingMode.LIGHTEN, "SCREEN": BlendingMode.SCREEN,
            "COLOR_DODGE": BlendingMode.COLOR_DODGE, "CLASSIC_COLOR_DODGE": BlendingMode.CLASSIC_COLOR_DODGE,
            "LINEAR_DODGE": BlendingMode.LINEAR_DODGE, "LIGHTER_COLOR": BlendingMode.LIGHTER_COLOR,
            "OVERLAY": BlendingMode.OVERLAY, "SOFT_LIGHT": BlendingMode.SOFT_LIGHT,
            "HARD_LIGHT": BlendingMode.HARD_LIGHT, "LINEAR_LIGHT": BlendingMode.LINEAR_LIGHT,
            "VIVID_LIGHT": BlendingMode.VIVID_LIGHT, "PIN_LIGHT": BlendingMode.PIN_LIGHT,
            "HARD_MIX": BlendingMode.HARD_MIX, "DIFFERENCE": BlendingMode.DIFFERENCE,
            "CLASSIC_DIFFERENCE": BlendingMode.CLASSIC_DIFFERENCE, "EXCLUSION": BlendingMode.EXCLUSION,
            "HUE": BlendingMode.HUE, "SATURATION": BlendingMode.SATURATION,
            "COLOR": BlendingMode.COLOR, "LUMINOSITY": BlendingMode.LUMINOSITY,
            "STENCIL_ALPHA": BlendingMode.STENCIL_ALPHA, "STENCIL_LUMA": BlendingMode.STENCIL_LUMA,
            "SILHOUETTE_ALPHA": BlendingMode.SILHOUETTE_ALPHA, "SILHOUETTE_LUMA": BlendingMode.SILHOUETTE_LUMA,
            "ALPHA_ADD": BlendingMode.ALPHA_ADD, "LUMINESCENT_PREMUL": BlendingMode.LUMINESCENT_PREMUL
        };
        var mode = blendModeMap[blendModeStr.toUpperCase()];
        if (mode === undefined) throw new Error("Unknown blend mode: " + blendModeStr);
        layer.blendingMode = mode;
        return JSON.stringify({ status: "success", message: "Blend mode set to " + blendModeStr, layer: { name: layer.name, index: layer.index, blendMode: blendModeStr } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setLayerTrackMatte ---
function setLayerTrackMatte(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var matteTypeStr = args.matteType || "NONE";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var matteMap = {
            "NONE": TrackMatteType.NO_TRACK_MATTE, "ALPHA": TrackMatteType.ALPHA,
            "ALPHA_INVERTED": TrackMatteType.ALPHA_INVERTED, "LUMA": TrackMatteType.LUMA,
            "LUMA_INVERTED": TrackMatteType.LUMA_INVERTED
        };
        var matteType = matteMap[matteTypeStr.toUpperCase()];
        if (matteType === undefined) throw new Error("Unknown matte type: " + matteTypeStr);
        layer.trackMatteType = matteType;
        return JSON.stringify({ status: "success", message: "Track matte set to " + matteTypeStr, layer: { name: layer.name, index: layer.index, matteType: matteTypeStr } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setLayerFlags ---
function setLayerFlags(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var flags = args.flags || {};
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var changed = [];
        if (flags.solo !== undefined) { layer.solo = flags.solo; changed.push("solo=" + flags.solo); }
        if (flags.shy !== undefined) { layer.shy = flags.shy; changed.push("shy=" + flags.shy); }
        if (flags.locked !== undefined) { layer.locked = flags.locked; changed.push("locked=" + flags.locked); }
        if (flags.motionBlur !== undefined) { layer.motionBlur = flags.motionBlur; changed.push("motionBlur=" + flags.motionBlur); }
        if (flags.enable3D !== undefined) { layer.threeDLayer = flags.enable3D; changed.push("threeDLayer=" + flags.enable3D); }
        if (flags.adjustmentLayer !== undefined) { layer.adjustmentLayer = flags.adjustmentLayer; changed.push("adjustmentLayer=" + flags.adjustmentLayer); }
        if (flags.collapseTransformation !== undefined) { layer.collapseTransformation = flags.collapseTransformation; changed.push("collapseTransformation=" + flags.collapseTransformation); }
        if (flags.frameBlending !== undefined) { layer.frameBlending = flags.frameBlending; changed.push("frameBlending=" + flags.frameBlending); }
        if (flags.frameBlendingType !== undefined) {
            var fbTypeMap = { "FRAME_MIX": FrameBlendingType.FRAME_MIX, "PIXEL_MOTION": FrameBlendingType.PIXEL_MOTION };
            var fbType = fbTypeMap[flags.frameBlendingType];
            if (fbType !== undefined) { layer.frameBlendingType = fbType; changed.push("frameBlendingType=" + flags.frameBlendingType); }
        }
        return JSON.stringify({ status: "success", message: "Layer flags updated: " + changed.join(", "), layer: { name: layer.name, index: layer.index, changed: changed } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- precomposeLayer ---
function precomposeLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndices = args.layerIndices || [1];
        var newCompName = args.newCompName || "Precomp";
        var moveAllAttributes = args.moveAllAttributes !== undefined ? args.moveAllAttributes : true;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var indices = [];
        for (var i = 0; i < layerIndices.length; i++) { indices.push(layerIndices[i]); }
        var newComp = comp.layers.precompose(indices, newCompName, moveAllAttributes);
        return JSON.stringify({ status: "success", message: "Precomposed " + indices.length + " layer(s) into '" + newCompName + "'", newComp: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, duration: newComp.duration } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- moveLayerToTime ---
function moveLayerToTime(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var startTime = args.startTime !== undefined ? args.startTime : 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.startTime = startTime;
        return JSON.stringify({ status: "success", message: "Layer moved to time " + startTime, layer: { name: layer.name, index: layer.index, startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- trimLayer ---
function trimLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var inPoint = args.inPoint;
        var outPoint = args.outPoint;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (inPoint !== undefined && inPoint !== null) layer.inPoint = inPoint;
        if (outPoint !== undefined && outPoint !== null) layer.outPoint = outPoint;
        return JSON.stringify({ status: "success", message: "Layer trimmed", layer: { name: layer.name, index: layer.index, inPoint: layer.inPoint, outPoint: layer.outPoint } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- splitLayer ---
function splitLayer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var splitTime = args.splitTime !== undefined ? args.splitTime : 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (splitTime <= layer.inPoint || splitTime >= layer.outPoint) {
            throw new Error("splitTime " + splitTime + " must be between layer inPoint " + layer.inPoint + " and outPoint " + layer.outPoint);
        }
        var origOutPoint = layer.outPoint;
        var newLayer = layer.duplicate();
        layer.outPoint = splitTime;
        newLayer.inPoint = splitTime;
        newLayer.outPoint = origOutPoint;
        newLayer.moveAfter(layer);
        return JSON.stringify({ status: "success", message: "Layer split at " + splitTime, originalLayer: { name: layer.name, index: layer.index, inPoint: layer.inPoint, outPoint: layer.outPoint }, newLayer: { name: newLayer.name, index: newLayer.index, inPoint: newLayer.inPoint, outPoint: newLayer.outPoint } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- addMask ---
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
            var cx = w / 2; var cy = h / 2; var rx = w / 2; var ry = h / 2; var k = 0.5522847498;
            shape.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
            shape.inTangents = [[-k * rx, 0], [0, -k * ry], [k * rx, 0], [0, k * ry]];
            shape.outTangents = [[k * rx, 0], [0, k * ry], [-k * rx, 0], [0, -k * ry]];
            shape.closed = true;
        } else if (maskShape === "freeform" && vertices.length >= 3) {
            var verts = []; var inTans = []; var outTans = [];
            for (var i = 0; i < vertices.length; i++) { verts.push([vertices[i][0], vertices[i][1]]); inTans.push([0, 0]); outTans.push([0, 0]); }
            shape.vertices = verts; shape.inTangents = inTans; shape.outTangents = outTans; shape.closed = true;
        } else {
            shape.vertices = [[0, 0], [w, 0], [w, h], [0, h]];
            shape.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
            shape.closed = true;
        }
        maskPath.setValue(shape);
        return JSON.stringify({ status: "success", message: "Mask added", mask: { index: mask.propertyIndex, inverted: inverted, shape: maskShape } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setMaskProperties ---
function setMaskProperties(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var maskIndex = args.maskIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var maskGroup = layer.property("Masks");
        var mask = maskGroup.property(maskIndex);
        if (!mask) throw new Error("Mask not found at index " + maskIndex);
        var changed = [];
        if (args.feather !== undefined && args.feather !== null) {
            var featherProp = mask.property("Mask Feather");
            if (featherProp) { featherProp.setValue(args.feather instanceof Array ? args.feather : [args.feather, args.feather]); changed.push("feather"); }
        }
        if (args.opacity !== undefined && args.opacity !== null) {
            var opacityProp = mask.property("Mask Opacity");
            if (opacityProp) { opacityProp.setValue(args.opacity); changed.push("opacity"); }
        }
        if (args.expansion !== undefined && args.expansion !== null) {
            var expansionProp = mask.property("Mask Expansion");
            if (expansionProp) { expansionProp.setValue(args.expansion); changed.push("expansion"); }
        }
        if (args.inverted !== undefined) { mask.inverted = args.inverted; changed.push("inverted"); }
        if (args.mode !== undefined) {
            var modeMap = { "NONE": MaskMode.NONE, "ADD": MaskMode.ADD, "SUBTRACT": MaskMode.SUBTRACT, "INTERSECT": MaskMode.INTERSECT, "LIGHTEN": MaskMode.LIGHTEN, "DARKEN": MaskMode.DARKEN, "DIFFERENCE": MaskMode.DIFFERENCE };
            var mode = modeMap[args.mode.toUpperCase()];
            if (mode !== undefined) { mask.maskMode = mode; changed.push("mode"); }
        }
        return JSON.stringify({ status: "success", message: "Mask properties updated: " + changed.join(", "), mask: { index: maskIndex, changed: changed } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- deleteMask ---
function deleteMask(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var maskIndex = args.maskIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var maskGroup = layer.property("Masks");
        var mask = maskGroup.property(maskIndex);
        if (!mask) throw new Error("Mask not found at index " + maskIndex);
        mask.remove();
        return JSON.stringify({ status: "success", message: "Mask " + maskIndex + " deleted" }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- importFootage ---
function importFootage(args) {
    try {
        var filePath = args.filePath;
        var name = args.name;
        var sequenceOptions = args.sequenceOptions || {};
        if (!filePath) throw new Error("filePath is required");
        var file = new File(filePath);
        if (!file.exists) throw new Error("File not found: " + filePath);
        var importOptions = new ImportOptions(file);
        if (sequenceOptions.importAsSequence) {
            importOptions.sequence = true;
            if (sequenceOptions.frameRate) importOptions.frameRate = sequenceOptions.frameRate;
        }
        var footageItem = app.project.importFile(importOptions);
        if (name) footageItem.name = name;
        return JSON.stringify({ status: "success", message: "Footage imported: " + footageItem.name, footage: { name: footageItem.name, id: footageItem.id } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- saveProject ---
function saveProject(args) {
    try {
        var filePath = args.filePath;
        if (filePath) {
            var file = new File(filePath);
            app.project.save(file);
            return JSON.stringify({ status: "success", message: "Project saved to: " + filePath, path: filePath }, null, 2);
        } else {
            app.project.save();
            var savedPath = app.project.file ? app.project.file.fsName : "Untitled";
            return JSON.stringify({ status: "success", message: "Project saved", path: savedPath }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- replaceFootage ---
function replaceFootage(args) {
    try {
        var itemIndex = args.itemIndex || 1;
        var newFilePath = args.newFilePath;
        if (!newFilePath) throw new Error("newFilePath is required");
        var item = app.project.item(itemIndex);
        if (!item) throw new Error("Item not found at index " + itemIndex);
        if (!(item instanceof FootageItem)) throw new Error("Item at index " + itemIndex + " is not a footage item");
        var newFile = new File(newFilePath);
        if (!newFile.exists) throw new Error("File not found: " + newFilePath);
        item.replace(newFile);
        return JSON.stringify({ status: "success", message: "Footage replaced with: " + newFilePath, footage: { name: item.name, id: item.id } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- addToRenderQueue ---
function addToRenderQueue(args) {
    try {
        var compIndex = args.compIndex || 1;
        var outputPath = args.outputPath;
        var outputModuleTemplate = args.outputModuleTemplate || "Lossless";
        var renderSettingsTemplate = args.renderSettingsTemplate || "Best Settings";
        if (!outputPath) throw new Error("outputPath is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var rqItem = app.project.renderQueue.items.add(comp);
        try { rqItem.applyTemplate(renderSettingsTemplate); } catch (e) { /* use defaults */ }
        var om = rqItem.outputModule(1);
        try { om.applyTemplate(outputModuleTemplate); } catch (e) { /* use defaults */ }
        om.file = new File(outputPath);
        return JSON.stringify({ status: "success", message: "Added to render queue", renderQueueItem: { index: rqItem.index, outputPath: outputPath, comp: comp.name } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- renderQueue ---
function renderQueue(args) {
    try {
        var action = args.action || "status";
        var rq = app.project.renderQueue;
        if (action === "start") {
            rq.render();
            return JSON.stringify({ status: "success", message: "Render started", action: "start" }, null, 2);
        } else if (action === "stop") {
            rq.stopRendering();
            return JSON.stringify({ status: "success", message: "Render stopped", action: "stop" }, null, 2);
        } else if (action === "clear") {
            var removed = 0;
            for (var i = rq.numItems; i >= 1; i--) { try { rq.item(i).remove(); removed++; } catch (e) { /* skip */ } }
            return JSON.stringify({ status: "success", message: "Cleared " + removed + " items from render queue", action: "clear" }, null, 2);
        } else {
            var items = [];
            for (var j = 1; j <= rq.numItems; j++) { var item = rq.item(j); items.push({ index: j, comp: item.comp ? item.comp.name : "Unknown", status: item.status.toString() }); }
            return JSON.stringify({ status: "success", action: "status", numItems: rq.numItems, items: items }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- exportFrame ---
function exportFrame(args) {
    try {
        var compIndex = args.compIndex || 1;
        var timeInSeconds = args.timeInSeconds !== undefined ? args.timeInSeconds : 0;
        var outputPath = args.outputPath;
        if (!outputPath) throw new Error("outputPath is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.timeSpanStart = timeInSeconds;
        rqItem.timeSpanDuration = 1 / comp.frameRate;
        var om = rqItem.outputModule(1);
        om.file = new File(outputPath);
        try { om.applyTemplate("PNG Sequence"); } catch (e) { /* ignore */ }
        om.file = new File(outputPath);
        app.project.renderQueue.render();
        rqItem.remove();
        return JSON.stringify({ status: "success", message: "Frame exported to " + outputPath, outputPath: outputPath, time: timeInSeconds }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setCompositionSettings ---
function setCompositionSettings(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var changed = [];
        if (args.name !== undefined) { comp.name = args.name; changed.push("name"); }
        if (args.width !== undefined) { comp.width = args.width; changed.push("width"); }
        if (args.height !== undefined) { comp.height = args.height; changed.push("height"); }
        if (args.frameRate !== undefined) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.duration !== undefined) { comp.duration = args.duration; changed.push("duration"); }
        if (args.pixelAspect !== undefined) { comp.pixelAspect = args.pixelAspect; changed.push("pixelAspect"); }
        if (args.bgColor !== undefined) {
            var bg = args.bgColor;
            comp.bgColor = [bg.r !== undefined ? bg.r : bg[0], bg.g !== undefined ? bg.g : bg[1], bg.b !== undefined ? bg.b : bg[2]];
            changed.push("bgColor");
        }
        return JSON.stringify({ status: "success", message: "Composition settings updated: " + changed.join(", "), composition: { name: comp.name, width: comp.width, height: comp.height, frameRate: comp.frameRate, duration: comp.duration, pixelAspect: comp.pixelAspect } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setWorkArea ---
function setWorkArea(args) {
    try {
        var compIndex = args.compIndex || 1;
        var workAreaStart = args.workAreaStart !== undefined ? args.workAreaStart : 0;
        var workAreaDuration = args.workAreaDuration;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        comp.workAreaStart = workAreaStart;
        if (workAreaDuration !== undefined && workAreaDuration !== null) comp.workAreaDuration = workAreaDuration;
        return JSON.stringify({ status: "success", message: "Work area set", workArea: { start: comp.workAreaStart, duration: comp.workAreaDuration, end: comp.workAreaStart + comp.workAreaDuration } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- trimCompToWorkArea ---
function trimCompToWorkArea(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var waStart = comp.workAreaStart;
        var waDuration = comp.workAreaDuration;
        if (waStart > 0) {
            for (var i = 1; i <= comp.numLayers; i++) { comp.layer(i).startTime = comp.layer(i).startTime - waStart; }
        }
        comp.duration = waDuration;
        comp.workAreaStart = 0;
        return JSON.stringify({ status: "success", message: "Composition trimmed to work area", composition: { name: comp.name, duration: comp.duration, workAreaStart: comp.workAreaStart, workAreaDuration: comp.workAreaDuration } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- addMarker ---
function addMarker(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex;
        var time = args.time !== undefined ? args.time : 0;
        var comment = args.comment || "";
        var duration = args.duration || 0;
        var url = args.url || "";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var mv = new MarkerValue(comment);
        if (duration > 0) mv.duration = duration;
        if (url) mv.url = url;
        if (layerIndex && layerIndex > 0) {
            var layer = comp.layer(layerIndex);
            if (!layer) throw new Error("Layer not found at index " + layerIndex);
            layer.property("Marker").setValueAtTime(time, mv);
            return JSON.stringify({ status: "success", message: "Layer marker added at time " + time, markerType: "layer", time: time, comment: comment }, null, 2);
        } else {
            comp.markerProperty.setValueAtTime(time, mv);
            return JSON.stringify({ status: "success", message: "Composition marker added at time " + time, markerType: "composition", time: time, comment: comment }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- removeEffect ---
function removeEffect(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var effectName = args.effectName;
        var effectIndex = args.effectIndex;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var effects = layer.property("Effects");
        if (!effects) throw new Error("No effects on this layer");
        var effect = null;
        if (effectIndex !== undefined && effectIndex !== null) {
            effect = effects.property(effectIndex);
        } else if (effectName) {
            for (var i = 1; i <= effects.numProperties; i++) { if (effects.property(i).name === effectName) { effect = effects.property(i); break; } }
        }
        if (!effect) throw new Error("Effect not found: " + (effectName || "index " + effectIndex));
        var removedName = effect.name;
        effect.remove();
        return JSON.stringify({ status: "success", message: "Effect removed: " + removedName }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- getEffectParams ---
function getEffectParams(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var effectName = args.effectName;
        var effectIndex = args.effectIndex;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var effects = layer.property("Effects");
        if (!effects) throw new Error("No effects on this layer");
        var effect = null;
        if (effectIndex !== undefined && effectIndex !== null) {
            effect = effects.property(effectIndex);
        } else if (effectName) {
            for (var i = 1; i <= effects.numProperties; i++) { if (effects.property(i).name === effectName) { effect = effects.property(i); break; } }
        }
        if (!effect) throw new Error("Effect not found: " + (effectName || "index " + effectIndex));
        var params = [];
        for (var j = 1; j <= effect.numProperties; j++) {
            try { var prop = effect.property(j); var paramInfo = { name: prop.name, index: j }; try { paramInfo.value = prop.value; } catch (e) { paramInfo.value = null; } params.push(paramInfo); } catch (e) { /* skip */ }
        }
        return JSON.stringify({ status: "success", message: "Effect params retrieved", effect: { name: effect.name, matchName: effect.matchName, index: effect.propertyIndex, params: params } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setEffectParam ---
function setEffectParam(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var effectName = args.effectName;
        var paramName = args.paramName;
        var value = args.value;
        if (!effectName) throw new Error("effectName is required");
        if (!paramName) throw new Error("paramName is required");
        if (value === undefined) throw new Error("value is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var effects = layer.property("Effects");
        var effect = null;
        for (var i = 1; i <= effects.numProperties; i++) { if (effects.property(i).name === effectName) { effect = effects.property(i); break; } }
        if (!effect) throw new Error("Effect not found: " + effectName);
        var param = null;
        try { param = effect.property(paramName); } catch (e) { param = null; }
        if (!param) { for (var j = 1; j <= effect.numProperties; j++) { if (effect.property(j).name === paramName) { param = effect.property(j); break; } } }
        if (!param) throw new Error("Parameter not found: " + paramName);
        param.setValue(value);
        return JSON.stringify({ status: "success", message: "Effect parameter set: " + paramName, effect: effectName, param: paramName, value: value }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setAudioLevel ---
function setAudioLevel(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var level = args.level !== undefined ? args.level : 0;
        var timeInSeconds = args.timeInSeconds;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var audio = layer.property("Audio");
        if (!audio) throw new Error("Layer does not have audio properties");
        var audioLevels = audio.property("Audio Levels");
        if (!audioLevels) throw new Error("Audio Levels property not found");
        if (timeInSeconds !== undefined && timeInSeconds !== null) {
            audioLevels.setValueAtTime(timeInSeconds, [level, level]);
            return JSON.stringify({ status: "success", message: "Audio level keyframe set at " + timeInSeconds + "s: " + level + " dB", level: level, time: timeInSeconds }, null, 2);
        } else {
            audioLevels.setValue([level, level]);
            return JSON.stringify({ status: "success", message: "Audio level set to " + level + " dB", level: level }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- enableTimeRemap ---
function enableTimeRemap(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.timeRemapEnabled = true;
        return JSON.stringify({ status: "success", message: "Time remap enabled", layer: { name: layer.name, index: layer.index, timeRemapEnabled: layer.timeRemapEnabled } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setTimeRemapKeyframe ---
function setTimeRemapKeyframe(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var timeInSeconds = args.timeInSeconds !== undefined ? args.timeInSeconds : 0;
        var remapValue = args.remapValue !== undefined ? args.remapValue : 0;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        if (!layer.timeRemapEnabled) layer.timeRemapEnabled = true;
        var timeRemap = layer.property("Time Remap");
        if (!timeRemap) throw new Error("Time Remap property not found");
        timeRemap.setValueAtTime(timeInSeconds, remapValue);
        return JSON.stringify({ status: "success", message: "Time remap keyframe set at " + timeInSeconds + "s to " + remapValue, timeInSeconds: timeInSeconds, remapValue: remapValue }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- executeScript ---
function executeScript(args) {
    try {
        var script = args.script;
        if (!script) throw new Error("script is required");
        var result;
        try { result = eval(script); } catch (evalErr) { return JSON.stringify({ status: "error", message: "Script execution error: " + evalErr.toString() }, null, 2); }
        var resultStr;
        if (result === undefined || result === null) { resultStr = String(result); }
        else if (typeof result === "object") { try { resultStr = JSON.stringify(result); } catch (e) { resultStr = result.toString(); } }
        else { resultStr = String(result); }
        return JSON.stringify({ status: "success", message: "Script executed successfully", result: resultStr }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- getCompFrame ---
function getCompFrame(args) {
    try {
        var compIndex = args.compIndex || 1;
        var timeInSeconds = args.timeInSeconds !== undefined ? args.timeInSeconds : 0;
        var outputDir = args.outputDir;
        if (!outputDir) {
            var userFolder = Folder.myDocuments;
            outputDir = userFolder.fsName + "/ae-mcp-bridge/frames";
        }
        var outFolder = new Folder(outputDir);
        if (!outFolder.exists) outFolder.create();
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var safeName = comp.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        var frameNum = Math.round(timeInSeconds * comp.frameRate);
        var outputPath = outputDir + "/" + safeName + "_frame_" + frameNum + ".png";
        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.timeSpanStart = timeInSeconds;
        rqItem.timeSpanDuration = 1 / comp.frameRate;
        var om = rqItem.outputModule(1);
        om.file = new File(outputPath);
        try { om.applyTemplate("PNG Sequence"); } catch (e) { /* ignore */ }
        om.file = new File(outputPath);
        app.project.renderQueue.render();
        rqItem.remove();
        return JSON.stringify({ status: "success", message: "Frame saved to " + outputPath, outputPath: outputPath, time: timeInSeconds }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- createCaption ---
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
        var posX = comp.width / 2;
        var posY;
        if (style === "lower-third") { posY = comp.height * 0.8; }
        else if (style === "upper-third") { posY = comp.height * 0.15; }
        else if (style === "center") { posY = comp.height / 2; }
        else { posY = comp.height * 0.8; }
        if (backgroundColor) {
            var bgColor = [backgroundColor.r || 0, backgroundColor.g || 0, backgroundColor.b || 0];
            var bgOpacity = backgroundColor.opacity !== undefined ? backgroundColor.opacity : 70;
            var bgSolid = comp.layers.addSolid(bgColor, "Caption BG", comp.width, Math.round(fontSize * 2), 1);
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
        return JSON.stringify({ status: "success", message: "Caption created", layer: { name: textLayer.name, index: textLayer.index, position: [posX, posY], startTime: startTime, endTime: endTime, style: style } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- createZoomEffect ---
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
        if (anchorPoint) { var apProp = layer.property("Transform").property("Anchor Point"); if (apProp) apProp.setValue(anchorPoint); }
        scaleProp.setValueAtTime(startTime, [zoomFrom, zoomFrom]);
        scaleProp.setValueAtTime(endTime, [zoomTo, zoomTo]);
        var numKeys = scaleProp.numKeys;
        if (numKeys >= 2) {
            var easeIn, easeOut;
            if (easingType === "ease-in-out") {
                easeIn = [new KeyframeEase(33, 33)]; easeOut = [new KeyframeEase(33, 33)];
                scaleProp.setTemporalEaseAtKey(numKeys - 1, easeIn, easeOut);
                scaleProp.setTemporalEaseAtKey(numKeys, easeIn, easeOut);
            } else if (easingType === "ease-in") {
                easeIn = [new KeyframeEase(0, 33)]; easeOut = [new KeyframeEase(33, 33)];
                scaleProp.setTemporalEaseAtKey(numKeys - 1, easeIn, easeOut);
            } else if (easingType === "ease-out") {
                easeIn = [new KeyframeEase(33, 33)]; easeOut = [new KeyframeEase(33, 0)];
                scaleProp.setTemporalEaseAtKey(numKeys, easeIn, easeOut);
            }
        }
        return JSON.stringify({ status: "success", message: "Zoom effect created from " + zoomFrom + "% to " + zoomTo + "%", layer: { name: layer.name, index: layer.index, zoomFrom: zoomFrom, zoomTo: zoomTo, startTime: startTime, endTime: endTime, easingType: easingType } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- addTextAnimator ---
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
        var selectors = animator.property("Selector");
        if (!selectors || selectors.numProperties === 0) { animator.property("Selector").addProperty("ADBE Text Selector"); }
        var selector = animator.property("Selector").property(1);
        if (selector) {
            var startProp = selector.property("Start");
            var endProp = selector.property("End");
            if (startProp) startProp.setValue(rangeStart);
            if (endProp) endProp.setValue(rangeEnd);
        }
        var animProps = animator.property("Animator Properties");
        var typeMap = { "opacity": "ADBE Text Opacity", "position": "ADBE Text Position", "scale": "ADBE Text Scale", "rotation": "ADBE Text Rotation", "fill_color": "ADBE Text Fill Color", "character_offset": "ADBE Text Character Change Type", "blur": "ADBE Text Blur" };
        var propMatchName = typeMap[animatorType.toLowerCase()] || "ADBE Text Opacity";
        var animProp = animProps.addProperty(propMatchName);
        if (animProp && value !== undefined) { try { animProp.setValue(value); } catch (e) { /* ignore */ } }
        return JSON.stringify({ status: "success", message: "Text animator added: " + animatorType, animator: { type: animatorType, rangeStart: rangeStart, rangeEnd: rangeEnd, value: value } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- getAudioWaveform ---
function getAudioWaveform(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var startTime = args.startTime !== undefined ? args.startTime : 0;
        var endTime = args.endTime !== undefined ? args.endTime : 1;
        var samples = args.samples || 10;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var audio = layer.property("Audio");
        var levelData = [];
        var step = (endTime - startTime) / samples;
        if (audio) {
            var audioLevels = audio.property("Audio Levels");
            if (audioLevels) {
                for (var i = 0; i < samples; i++) {
                    var t = startTime + (i * step);
                    try { var lv = audioLevels.valueAtTime(t, true); levelData.push({ time: t, left: lv[0], right: lv[1] }); } catch (e) { levelData.push({ time: t, left: 0, right: 0 }); }
                }
            }
        }
        return JSON.stringify({ status: "success", message: "Audio waveform data approximated via Audio Levels property", note: "Full PCM waveform data is not accessible via ExtendScript.", layer: { name: layer.name, index: layer.index }, startTime: startTime, endTime: endTime, samples: samples, levelData: levelData }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- alignLayers ---
function alignLayers(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndices = args.layerIndices || [];
        var alignTo = args.alignTo || "compHCenter";
        if (layerIndices.length === 0) throw new Error("layerIndices array is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layers = [];
        for (var i = 0; i < layerIndices.length; i++) { var l = comp.layer(layerIndices[i]); if (!l) throw new Error("Layer not found at index " + layerIndices[i]); layers.push(l); }
        var compW = comp.width; var compH = comp.height;
        var refPos = layers[0].property("Position").value;
        var changed = [];
        for (var j = 0; j < layers.length; j++) {
            var pos = layers[j].property("Position").value;
            var newX = pos[0]; var newY = pos[1];
            if (alignTo === "compLeft") { newX = 0; } else if (alignTo === "compRight") { newX = compW; }
            else if (alignTo === "compTop") { newY = 0; } else if (alignTo === "compBottom") { newY = compH; }
            else if (alignTo === "compHCenter") { newX = compW / 2; } else if (alignTo === "compVCenter") { newY = compH / 2; }
            else if (alignTo === "left" || alignTo === "right" || alignTo === "horizontalCenter") { newX = refPos[0]; }
            else if (alignTo === "top" || alignTo === "bottom" || alignTo === "verticalCenter") { newY = refPos[1]; }
            var newPos = pos.length === 3 ? [newX, newY, pos[2]] : [newX, newY];
            layers[j].property("Position").setValue(newPos);
            changed.push({ name: layers[j].name, index: layers[j].index, newPosition: newPos });
        }
        return JSON.stringify({ status: "success", message: "Layers aligned to " + alignTo, alignedLayers: changed }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- distributeKeyframes ---
function distributeKeyframes(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var propertyName = args.propertyName;
        var values = args.values || [];
        var times = args.times || [];
        var interpolationType = args.interpolationType || "linear";
        if (!propertyName) throw new Error("propertyName is required");
        if (values.length === 0) throw new Error("values array is required");
        if (times.length === 0) throw new Error("times array is required");
        if (values.length !== times.length) throw new Error("values and times arrays must have the same length");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var prop = null;
        var transform = layer.property("Transform");
        if (transform) { try { prop = transform.property(propertyName); } catch (e) { prop = null; } }
        if (!prop) { try { prop = layer.property(propertyName); } catch (e) { prop = null; } }
        if (!prop) throw new Error("Property not found: " + propertyName);
        var addedKeys = [];
        for (var i = 0; i < times.length; i++) { prop.setValueAtTime(times[i], values[i]); addedKeys.push({ time: times[i], value: values[i] }); }
        if (interpolationType === "hold") {
            for (var k = 1; k <= prop.numKeys; k++) { try { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD); } catch (e) { /* ignore */ } }
        } else if (interpolationType === "easy-ease") {
            for (var k2 = 1; k2 <= prop.numKeys; k2++) { try { var ease = [new KeyframeEase(33, 33)]; prop.setTemporalEaseAtKey(k2, ease, ease); } catch (e) { /* ignore */ } }
        }
        return JSON.stringify({ status: "success", message: "Added " + addedKeys.length + " keyframes to " + propertyName, propertyName: propertyName, keyframes: addedKeys, interpolationType: interpolationType }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setLayerStretch ---
function setLayerStretch(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var stretch = args.stretch !== undefined ? args.stretch : 100;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        layer.stretch = stretch;
        return JSON.stringify({ status: "success", message: "Layer stretch set to " + stretch + "%", layer: { name: layer.name, index: layer.index, stretch: layer.stretch } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- duplicateComposition ---
function duplicateComposition(args) {
    try {
        var compIndex = args.compIndex || 1;
        var newName = args.newName;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var newComp = comp.duplicate();
        if (newName) newComp.name = newName;
        return JSON.stringify({ status: "success", message: "Composition duplicated", newComp: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, duration: newComp.duration, frameRate: newComp.frameRate, numLayers: newComp.numLayers } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- getRendererInfo ---
function getRendererInfo(args) {
    try {
        var compIndex = args.compIndex || 1;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var renderers = [];
        try { var rl = comp.renderers; for (var i = 0; i < rl.length; i++) { renderers.push(rl[i]); } } catch (e) { renderers = ["ADBE Ernst", "ADBE Advanced 3d"]; }
        return JSON.stringify({ status: "success", message: "Renderer info retrieved", currentRenderer: comp.renderer, availableRenderers: renderers, rendererDescriptions: { "ADBE Ernst": "Classic 3D renderer", "ADBE Advanced 3d": "Cinema 4D / Advanced 3D renderer" } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- setRenderer ---
function setRenderer(args) {
    try {
        var compIndex = args.compIndex || 1;
        var renderer = args.renderer || "ADBE Ernst";
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var oldRenderer = comp.renderer;
        comp.renderer = renderer;
        return JSON.stringify({ status: "success", message: "Renderer set from '" + oldRenderer + "' to '" + renderer + "'", composition: { name: comp.name, renderer: comp.renderer } }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- addLutEffect ---
function addLutEffect(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var lutPath = args.lutPath;
        if (!lutPath) throw new Error("lutPath is required");
        var lutFile = new File(lutPath);
        if (!lutFile.exists) throw new Error("LUT file not found: " + lutPath);
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        var effect = null;
        try { effect = layer.property("Effects").addProperty("ADBE Apply Color LUT2"); } catch (e) { effect = null; }
        if (!effect) { try { effect = layer.property("Effects").addProperty("ADBE Apply Color LUT"); } catch (e) { effect = null; } }
        if (!effect) throw new Error("Could not add Apply Color LUT effect");
        var lutFileProp = null;
        try { lutFileProp = effect.property("LUT"); } catch (e) { lutFileProp = null; }
        if (!lutFileProp) {
            for (var i = 1; i <= effect.numProperties; i++) { var p = effect.property(i); if (p.name.toLowerCase().indexOf("lut") !== -1) { lutFileProp = p; break; } }
        }
        if (lutFileProp) { lutFileProp.setValue(lutFile); }
        return JSON.stringify({ status: "success", message: "LUT effect applied: " + lutPath, effect: { name: effect.name, matchName: effect.matchName }, lutPath: lutPath }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- createSlideShow ---
function createSlideShow(args) {
    try {
        var compIndex = args.compIndex || 1;
        var imagePaths = args.imagePaths || [];
        var durationPerSlide = args.durationPerSlide !== undefined ? args.durationPerSlide : 3;
        var transition = args.transition || "cut";
        var transitionDuration = args.transitionDuration !== undefined ? args.transitionDuration : 0.5;
        if (imagePaths.length === 0) throw new Error("imagePaths is required");
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layers = [];
        for (var i = 0; i < imagePaths.length; i++) {
            var file = new File(imagePaths[i]);
            if (!file.exists) throw new Error("Image file not found: " + imagePaths[i]);
            var importOptions = new ImportOptions(file);
            var footageItem = app.project.importFile(importOptions);
            var slideStart = i * durationPerSlide;
            var slideEnd = slideStart + durationPerSlide;
            var footageLayer = comp.layers.add(footageItem);
            footageLayer.startTime = slideStart;
            footageLayer.outPoint = slideEnd;
            var scaleX = (comp.width / footageLayer.width) * 100;
            var scaleY = (comp.height / footageLayer.height) * 100;
            var scale = Math.min(scaleX, scaleY);
            footageLayer.property("Scale").setValue([scale, scale]);
            footageLayer.property("Position").setValue([comp.width / 2, comp.height / 2]);
            if (transition === "fade" && i > 0) {
                var opacityProp = footageLayer.property("Opacity");
                opacityProp.setValueAtTime(slideStart, 0); opacityProp.setValueAtTime(slideStart + transitionDuration, 100);
                opacityProp.setValueAtTime(slideEnd - transitionDuration, 100); opacityProp.setValueAtTime(slideEnd, 0);
            } else if (transition === "zoom") {
                var scaleProp = footageLayer.property("Scale");
                scaleProp.setValueAtTime(slideStart, [scale * 0.9, scale * 0.9]); scaleProp.setValueAtTime(slideEnd, [scale * 1.1, scale * 1.1]);
            }
            layers.push({ name: footageLayer.name, index: footageLayer.index, start: slideStart, end: slideEnd });
        }
        return JSON.stringify({ status: "success", message: "Slideshow created with " + layers.length + " slides", totalDuration: imagePaths.length * durationPerSlide, transition: transition, layers: layers }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}

// --- End of NEW FUNCTIONS ---

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
            case "createNullObject":
                logToPanel("Calling createNullObject function...");
                result = createNullObject(args);
                logToPanel("Returned from createNullObject.");
                break;
            case "createCamera":
                logToPanel("Calling createCamera function...");
                result = createCamera(args);
                logToPanel("Returned from createCamera.");
                break;
            case "createLight":
                logToPanel("Calling createLight function...");
                result = createLight(args);
                logToPanel("Returned from createLight.");
                break;
            case "deleteLayer":
                logToPanel("Calling deleteLayer function...");
                result = deleteLayer(args);
                logToPanel("Returned from deleteLayer.");
                break;
            case "duplicateLayer":
                logToPanel("Calling duplicateLayer function...");
                result = duplicateLayer(args);
                logToPanel("Returned from duplicateLayer.");
                break;
            case "reorderLayer":
                logToPanel("Calling reorderLayer function...");
                result = reorderLayer(args);
                logToPanel("Returned from reorderLayer.");
                break;
            case "renameLayer":
                logToPanel("Calling renameLayer function...");
                result = renameLayer(args);
                logToPanel("Returned from renameLayer.");
                break;
            case "setLayerParent":
                logToPanel("Calling setLayerParent function...");
                result = setLayerParent(args);
                logToPanel("Returned from setLayerParent.");
                break;
            case "setLayerBlendMode":
                logToPanel("Calling setLayerBlendMode function...");
                result = setLayerBlendMode(args);
                logToPanel("Returned from setLayerBlendMode.");
                break;
            case "setLayerTrackMatte":
                logToPanel("Calling setLayerTrackMatte function...");
                result = setLayerTrackMatte(args);
                logToPanel("Returned from setLayerTrackMatte.");
                break;
            case "setLayerFlags":
                logToPanel("Calling setLayerFlags function...");
                result = setLayerFlags(args);
                logToPanel("Returned from setLayerFlags.");
                break;
            case "precomposeLayer":
                logToPanel("Calling precomposeLayer function...");
                result = precomposeLayer(args);
                logToPanel("Returned from precomposeLayer.");
                break;
            case "moveLayerToTime":
                logToPanel("Calling moveLayerToTime function...");
                result = moveLayerToTime(args);
                logToPanel("Returned from moveLayerToTime.");
                break;
            case "trimLayer":
                logToPanel("Calling trimLayer function...");
                result = trimLayer(args);
                logToPanel("Returned from trimLayer.");
                break;
            case "splitLayer":
                logToPanel("Calling splitLayer function...");
                result = splitLayer(args);
                logToPanel("Returned from splitLayer.");
                break;
            case "addMask":
                logToPanel("Calling addMask function...");
                result = addMask(args);
                logToPanel("Returned from addMask.");
                break;
            case "setMaskProperties":
                logToPanel("Calling setMaskProperties function...");
                result = setMaskProperties(args);
                logToPanel("Returned from setMaskProperties.");
                break;
            case "deleteMask":
                logToPanel("Calling deleteMask function...");
                result = deleteMask(args);
                logToPanel("Returned from deleteMask.");
                break;
            case "importFootage":
                logToPanel("Calling importFootage function...");
                result = importFootage(args);
                logToPanel("Returned from importFootage.");
                break;
            case "saveProject":
                logToPanel("Calling saveProject function...");
                result = saveProject(args);
                logToPanel("Returned from saveProject.");
                break;
            case "replaceFootage":
                logToPanel("Calling replaceFootage function...");
                result = replaceFootage(args);
                logToPanel("Returned from replaceFootage.");
                break;
            case "addToRenderQueue":
                logToPanel("Calling addToRenderQueue function...");
                result = addToRenderQueue(args);
                logToPanel("Returned from addToRenderQueue.");
                break;
            case "renderQueue":
                logToPanel("Calling renderQueue function...");
                result = renderQueue(args);
                logToPanel("Returned from renderQueue.");
                break;
            case "exportFrame":
                logToPanel("Calling exportFrame function...");
                result = exportFrame(args);
                logToPanel("Returned from exportFrame.");
                break;
            case "setCompositionSettings":
                logToPanel("Calling setCompositionSettings function...");
                result = setCompositionSettings(args);
                logToPanel("Returned from setCompositionSettings.");
                break;
            case "setWorkArea":
                logToPanel("Calling setWorkArea function...");
                result = setWorkArea(args);
                logToPanel("Returned from setWorkArea.");
                break;
            case "trimCompToWorkArea":
                logToPanel("Calling trimCompToWorkArea function...");
                result = trimCompToWorkArea(args);
                logToPanel("Returned from trimCompToWorkArea.");
                break;
            case "addMarker":
                logToPanel("Calling addMarker function...");
                result = addMarker(args);
                logToPanel("Returned from addMarker.");
                break;
            case "removeEffect":
                logToPanel("Calling removeEffect function...");
                result = removeEffect(args);
                logToPanel("Returned from removeEffect.");
                break;
            case "getEffectParams":
                logToPanel("Calling getEffectParams function...");
                result = getEffectParams(args);
                logToPanel("Returned from getEffectParams.");
                break;
            case "setEffectParam":
                logToPanel("Calling setEffectParam function...");
                result = setEffectParam(args);
                logToPanel("Returned from setEffectParam.");
                break;
            case "setAudioLevel":
                logToPanel("Calling setAudioLevel function...");
                result = setAudioLevel(args);
                logToPanel("Returned from setAudioLevel.");
                break;
            case "enableTimeRemap":
                logToPanel("Calling enableTimeRemap function...");
                result = enableTimeRemap(args);
                logToPanel("Returned from enableTimeRemap.");
                break;
            case "setTimeRemapKeyframe":
                logToPanel("Calling setTimeRemapKeyframe function...");
                result = setTimeRemapKeyframe(args);
                logToPanel("Returned from setTimeRemapKeyframe.");
                break;
            case "executeScript":
                logToPanel("Calling executeScript function...");
                result = executeScript(args);
                logToPanel("Returned from executeScript.");
                break;
            case "getCompFrame":
                logToPanel("Calling getCompFrame function...");
                result = getCompFrame(args);
                logToPanel("Returned from getCompFrame.");
                break;
            case "createCaption":
                logToPanel("Calling createCaption function...");
                result = createCaption(args);
                logToPanel("Returned from createCaption.");
                break;
            case "createZoomEffect":
                logToPanel("Calling createZoomEffect function...");
                result = createZoomEffect(args);
                logToPanel("Returned from createZoomEffect.");
                break;
            case "addTextAnimator":
                logToPanel("Calling addTextAnimator function...");
                result = addTextAnimator(args);
                logToPanel("Returned from addTextAnimator.");
                break;
            case "getAudioWaveform":
                logToPanel("Calling getAudioWaveform function...");
                result = getAudioWaveform(args);
                logToPanel("Returned from getAudioWaveform.");
                break;
            case "alignLayers":
                logToPanel("Calling alignLayers function...");
                result = alignLayers(args);
                logToPanel("Returned from alignLayers.");
                break;
            case "distributeKeyframes":
                logToPanel("Calling distributeKeyframes function...");
                result = distributeKeyframes(args);
                logToPanel("Returned from distributeKeyframes.");
                break;
            case "setLayerStretch":
                logToPanel("Calling setLayerStretch function...");
                result = setLayerStretch(args);
                logToPanel("Returned from setLayerStretch.");
                break;
            case "duplicateComposition":
                logToPanel("Calling duplicateComposition function...");
                result = duplicateComposition(args);
                logToPanel("Returned from duplicateComposition.");
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
            case "addLutEffect":
                logToPanel("Calling addLutEffect function...");
                result = addLutEffect(args);
                logToPanel("Returned from addLutEffect.");
                break;
            case "createSlideShow":
                logToPanel("Calling createSlideShow function...");
                result = createSlideShow(args);
                logToPanel("Returned from createSlideShow.");
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
