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

function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
}

function padNumber(value, length) {
    var text = String(value);
    while (text.length < length) {
        text = "0" + text;
    }
    return text;
}

function getIsoTimestamp() {
    var now = new Date();
    return now.getUTCFullYear() + "-" +
        padNumber(now.getUTCMonth() + 1, 2) + "-" +
        padNumber(now.getUTCDate(), 2) + "T" +
        padNumber(now.getUTCHours(), 2) + ":" +
        padNumber(now.getUTCMinutes(), 2) + ":" +
        padNumber(now.getUTCSeconds(), 2) + "." +
        padNumber(now.getUTCMilliseconds(), 3) + "Z";
}

function getBridgeFolderPath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName;
}

function getBridgeLogsFolderPath() {
    var logsFolder = new Folder(getBridgeFolderPath() + "/logs");
    if (!logsFolder.exists) {
        logsFolder.create();
    }
    return logsFolder.fsName;
}

function getBridgeLogFilePath() {
    return getBridgeLogsFolderPath() + "/ae_bridge_log.jsonl";
}

function getActiveComp() {
    if (app.project.activeItem instanceof CompItem) {
        return app.project.activeItem;
    }
    return null;
}

function findProjectItemIndexById(itemId) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item && item.id === itemId) {
            return i;
        }
    }
    return null;
}

function getProjectItemType(item) {
    if (!item) {
        return "Unknown";
    }
    if (item instanceof CompItem) {
        return "Composition";
    }
    if (item instanceof FolderItem) {
        return "Folder";
    }
    if (item instanceof FootageItem) {
        if (item.mainSource instanceof SolidSource) {
            return "Solid";
        }
        return "Footage";
    }
    return "Unknown";
}

function buildProjectItemSummary(item) {
    if (!item) {
        return null;
    }

    var summary = {
        id: item.id,
        index: findProjectItemIndexById(item.id),
        name: item.name,
        type: getProjectItemType(item)
    };

    if (item instanceof CompItem) {
        summary.width = item.width;
        summary.height = item.height;
        summary.duration = item.duration;
        summary.frameRate = item.frameRate;
        summary.numLayers = item.numLayers;
    } else if (item instanceof FootageItem) {
        try {
            summary.width = item.width;
            summary.height = item.height;
            summary.duration = item.duration;
        } catch (footageError) {}
    }

    return summary;
}

function buildCompSummary(comp) {
    if (!comp) {
        return null;
    }
    return {
        id: comp.id,
        index: findProjectItemIndexById(comp.id),
        name: comp.name,
        width: comp.width,
        height: comp.height,
        duration: comp.duration,
        frameRate: comp.frameRate
    };
}

function buildLayerSummary(layer) {
    if (!layer) {
        return null;
    }
    return {
        index: layer.index,
        name: layer.name
    };
}

function getLayerType(layer) {
    if (!layer) {
        return "unknown";
    }
    try {
        if (layer instanceof CameraLayer) {
            return "camera";
        }
    } catch (cameraErr) {}
    try {
        if (layer instanceof LightLayer) {
            return "light";
        }
    } catch (lightErr) {}
    try {
        if (layer instanceof ShapeLayer) {
            return "shape";
        }
    } catch (shapeErr) {}
    try {
        if (layer instanceof TextLayer) {
            return "text";
        }
    } catch (textErr) {}
    if (layer.nullLayer === true) {
        return "null";
    }
    if (layer.adjustmentLayer === true) {
        return "adjustment";
    }
    if (layer.source && layer.source.mainSource instanceof SolidSource) {
        return "solid";
    }
    if (layer.source) {
        return "av";
    }
    return "layer";
}

function buildEffectsSummary(layer) {
    var result = [];
    var parade = getEffectParade(layer);
    if (!parade) {
        return result;
    }
    for (var i = 1; i <= parade.numProperties; i++) {
        var fx = parade.property(i);
        result.push({
            index: fx.propertyIndex,
            name: fx.name,
            matchName: fx.matchName
        });
    }
    return result;
}

function buildMasksSummary(layer) {
    var result = [];
    var masks = null;
    try {
        masks = layer.property("Masks");
    } catch (e) {
        masks = null;
    }
    if (!masks) {
        return result;
    }
    for (var i = 1; i <= masks.numProperties; i++) {
        var mask = masks.property(i);
        result.push({
            index: mask.propertyIndex,
            name: mask.name,
            mode: mask.maskMode
        });
    }
    return result;
}

function buildTransformSummary(layer) {
    var transform = null;
    try {
        transform = layer.property("ADBE Transform Group") || layer.property("Transform");
    } catch (e) {
        transform = null;
    }
    if (!transform) {
        return null;
    }

    function readTransformValue(name) {
        try {
            var prop = transform.property(name);
            return prop ? prop.value : null;
        } catch (e) {
            return null;
        }
    }

    return {
        anchorPoint: readTransformValue("Anchor Point"),
        position: readTransformValue("Position"),
        scale: readTransformValue("Scale"),
        rotation: readTransformValue("Rotation"),
        opacity: readTransformValue("Opacity")
    };
}

function buildLayerDetails(layer) {
    if (!layer) {
        return null;
    }

    var details = {
        index: layer.index,
        name: layer.name,
        type: getLayerType(layer),
        enabled: layer.enabled,
        locked: layer.locked,
        shy: layer.shy,
        solo: layer.solo,
        motionBlur: layer.motionBlur,
        adjustmentLayer: layer.adjustmentLayer === true,
        threeDLayer: layer.threeDLayer === true,
        nullLayer: layer.nullLayer === true,
        guideLayer: layer.guideLayer === true,
        label: layer.label,
        inPoint: layer.inPoint,
        outPoint: layer.outPoint,
        startTime: layer.startTime,
        stretch: layer.stretch,
        parent: layer.parent ? buildLayerSummary(layer.parent) : null,
        transform: buildTransformSummary(layer),
        masks: buildMasksSummary(layer),
        effects: buildEffectsSummary(layer)
    };

    try {
        if (layer.source) {
            details.source = buildProjectItemSummary(layer.source);
        }
    } catch (sourceError) {}

    try {
        if (layer instanceof TextLayer && layer.property("Source Text")) {
            details.text = {
                expressionEnabled: layer.property("Source Text").expressionEnabled,
                expressionError: layer.property("Source Text").expressionError || "",
                expressionLength: layer.property("Source Text").expression ? layer.property("Source Text").expression.length : 0
            };
        }
    } catch (textError) {}

    return details;
}

function findCompositionsByName(name) {
    var matches = [];
    if (!hasValue(name)) {
        return matches;
    }
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.name === name) {
            matches.push(item);
        }
    }
    return matches;
}

function resolveComposition(args) {
    args = args || {};
    var targetComp = args.targetComp || null;
    var compIndex = args.compIndex;
    var compName = args.compName || "";

    if (targetComp && targetComp.mode) {
        if (targetComp.mode === "index" && hasValue(targetComp.index)) {
            compIndex = targetComp.index;
        } else if (targetComp.mode === "name" && hasValue(targetComp.name)) {
            compName = targetComp.name;
        }
    }

    if (hasValue(compIndex)) {
        var indexedComp = app.project.item(compIndex);
        if (!indexedComp || !(indexedComp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        return indexedComp;
    }

    if (hasValue(compName)) {
        var matches = findCompositionsByName(compName);
        if (matches.length === 1) {
            return matches[0];
        }
        if (matches.length > 1) {
            throw new Error("Composition name is ambiguous: '" + compName + "'");
        }
        throw new Error("No composition found with name '" + compName + "'");
    }

    var activeComp = getActiveComp();
    if (activeComp) {
        return activeComp;
    }

    throw new Error("No active composition");
}

function activateComposition(comp) {
    if (!comp) {
        throw new Error("Composition is required");
    }
    comp.openInViewer();
    return comp;
}

function findLayersByName(comp, layerName) {
    var matches = [];
    if (!comp || !hasValue(layerName)) {
        return matches;
    }
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (layer && layer.name === layerName) {
            matches.push(layer);
        }
    }
    return matches;
}

function getSelectedLayersForComp(comp) {
    var activeComp = getActiveComp();
    if (!activeComp || activeComp.id !== comp.id) {
        return [];
    }
    return activeComp.selectedLayers || [];
}

function resolveSingleLayerInComp(comp, args) {
    args = args || {};
    var targetLayer = args.targetLayer || null;
    var targetLayers = args.targetLayers || null;
    var layerIndex = args.layerIndex;
    var layerName = args.layerName || "";
    var useSelectedLayer = args.useSelectedLayer === true;

    if (targetLayer && targetLayer.mode) {
        if (targetLayer.mode === "index" && hasValue(targetLayer.index)) {
            layerIndex = targetLayer.index;
        } else if (targetLayer.mode === "name" && hasValue(targetLayer.name)) {
            layerName = targetLayer.name;
        } else if (targetLayer.mode === "selected") {
            useSelectedLayer = true;
        }
    }

    if (targetLayers && targetLayers.mode) {
        if (targetLayers.mode === "selected") {
            useSelectedLayer = true;
        } else if (targetLayers.mode === "names" && targetLayers.names && targetLayers.names.length === 1) {
            layerName = targetLayers.names[0];
        }
    }

    if (hasValue(layerIndex)) {
        if (layerIndex > 0 && layerIndex <= comp.numLayers) {
            return comp.layer(layerIndex);
        }
        throw new Error("Layer index out of bounds: " + layerIndex);
    }

    if (useSelectedLayer) {
        var selectedLayers = getSelectedLayersForComp(comp);
        if (!selectedLayers.length) {
            throw new Error("No selected layer in the active composition");
        }
        if (selectedLayers.length > 1) {
            throw new Error("Selected layer target is ambiguous; multiple layers are selected");
        }
        return selectedLayers[0];
    }

    if (hasValue(layerName)) {
        var matches = findLayersByName(comp, layerName);
        if (matches.length === 1) {
            return matches[0];
        }
        if (matches.length > 1) {
            throw new Error("Layer name is ambiguous: '" + layerName + "'");
        }
        throw new Error("Layer not found: " + layerName);
    }

    throw new Error("No target layer provided");
}

function sortLayersByStackOrder(layers) {
    return layers.sort(function(a, b) {
        return a.index - b.index;
    });
}

function resolveMultipleLayersInComp(comp, args) {
    args = args || {};
    var targetLayers = args.targetLayers || null;
    var layerNames = args.layerNames || null;
    var useSelectedLayers = args.useSelectedLayers === true;
    var resolved = [];
    var seen = {};

    if (targetLayers && targetLayers.mode) {
        if (targetLayers.mode === "selected") {
            useSelectedLayers = true;
        } else if (targetLayers.mode === "names" && targetLayers.names && targetLayers.names.length) {
            layerNames = targetLayers.names;
        }
    }

    if (useSelectedLayers) {
        var selectedLayers = getSelectedLayersForComp(comp);
        if (!selectedLayers.length) {
            throw new Error("No selected layers in the active composition");
        }
        for (var i = 0; i < selectedLayers.length; i++) {
            resolved.push(selectedLayers[i]);
            seen[selectedLayers[i].index] = true;
        }
    }

    if (layerNames && layerNames.length) {
        for (var n = 0; n < layerNames.length; n++) {
            var matches = findLayersByName(comp, layerNames[n]);
            if (!matches.length) {
                throw new Error("Layer not found: " + layerNames[n]);
            }
            if (matches.length > 1) {
                throw new Error("Layer name is ambiguous: '" + layerNames[n] + "'");
            }
            if (!seen[matches[0].index]) {
                resolved.push(matches[0]);
                seen[matches[0].index] = true;
            }
        }
    }

    if (!resolved.length) {
        throw new Error("No target layers resolved");
    }

    return resolved;
}

function resolveLayersByIndexes(comp, layerIndexes) {
    var resolved = [];
    var seen = {};
    if (!layerIndexes || !layerIndexes.length) {
        return resolved;
    }
    for (var i = 0; i < layerIndexes.length; i++) {
        var layerIndex = parseInt(layerIndexes[i], 10);
        if (isNaN(layerIndex) || layerIndex < 1 || layerIndex > comp.numLayers) {
            throw new Error("Layer index out of bounds: " + layerIndexes[i]);
        }
        if (!seen[layerIndex]) {
            resolved.push(comp.layer(layerIndex));
            seen[layerIndex] = true;
        }
    }
    return resolved;
}

function resolvePropertyOnLayer(layer, propertyName) {
    if (!layer) {
        throw new Error("Layer is required to resolve property");
    }
    if (!hasValue(propertyName)) {
        throw new Error("Property name is required");
    }

    var transformGroup = layer.property("Transform");
    var property = transformGroup ? transformGroup.property(propertyName) : null;

    if (!property && layer.property("Effects") && layer.property("Effects").property(propertyName)) {
        property = layer.property("Effects").property(propertyName);
    }
    if (!property && layer.property("Text") && layer.property("Text").property(propertyName)) {
        property = layer.property("Text").property(propertyName);
    }
    if (!property && layer.property("Effects")) {
        var effects = layer.property("Effects");
        for (var ei = 1; ei <= effects.numProperties; ei++) {
            var effect = effects.property(ei);
            try {
                var subProp = effect.property(propertyName);
                if (subProp) {
                    property = subProp;
                    break;
                }
            } catch (nestedError) {}
        }
    }

    if (!property) {
        throw new Error("Property '" + propertyName + "' not found on layer '" + layer.name + "'");
    }

    return property;
}

function listRequestedSetLayerProperties(args) {
    var requested = [];
    if (!args) {
        return requested;
    }
    if (args.position !== undefined && args.position !== null) { requested.push("Position"); }
    if (args.scale !== undefined && args.scale !== null) { requested.push("Scale"); }
    if (args.rotation !== undefined && args.rotation !== null) { requested.push("Rotation"); }
    if (args.opacity !== undefined && args.opacity !== null) { requested.push("Opacity"); }
    if (args.text !== undefined && args.text !== null) { requested.push("Source Text"); }
    if (args.fontFamily !== undefined && args.fontFamily !== null) { requested.push("Source Text"); }
    if (args.fontSize !== undefined && args.fontSize !== null) { requested.push("Source Text"); }
    if (args.fillColor !== undefined && args.fillColor !== null) { requested.push("Source Text"); }
    return requested;
}

function inspectPropertyState(property) {
    if (!property) {
        return null;
    }

    var expressionText = "";
    try {
        expressionText = property.expression || "";
    } catch (expressionError) {
        expressionText = "";
    }

    return {
        name: property.name,
        matchName: property.matchName || "",
        propertyType: property.propertyType || null,
        canSetExpression: property.canSetExpression === true,
        canVaryOverTime: property.canVaryOverTime === true,
        expressionEnabled: property.expressionEnabled === true,
        hasExpression: expressionText !== "",
        writable: property.propertyType === PropertyType.PROPERTY
    };
}

function preflightMutation(args) {
    try {
        args = args || {};
        var command = args.command || "";
        var mutationArgs = args.args || {};
        var riskClass = args.riskClass || "low";
        var response = {
            status: "success",
            command: command,
            riskClass: riskClass,
            checks: {
                targetExists: true,
                propertyWritable: null,
                expressionDependencyRisk: "none",
                checkpointRequired: riskClass === "high",
                projectSaved: !!app.project.file,
                checkpointPossible: !!app.project.file
            },
            target: null,
            inspectedProperties: []
        };
        var comp = null;
        var layer = null;
        var layers = null;
        var property = null;
        var requested = null;
        var i = 0;

        function pushPropertyInspection(prop) {
            var inspected = inspectPropertyState(prop);
            if (inspected) {
                response.inspectedProperties.push(inspected);
                if (inspected.writable === false) {
                    response.checks.propertyWritable = false;
                } else if (response.checks.propertyWritable !== false) {
                    response.checks.propertyWritable = true;
                }
                if (inspected.expressionEnabled || inspected.hasExpression) {
                    response.checks.expressionDependencyRisk = "present";
                }
            }
        }

        switch (command) {
            case "setLayerKeyframe":
            case "setLayerExpression":
                comp = resolveComposition(mutationArgs);
                layer = resolveSingleLayerInComp(comp, mutationArgs);
                property = resolvePropertyOnLayer(layer, mutationArgs.propertyName);
                response.target = {
                    composition: buildCompSummary(comp),
                    layer: buildLayerSummary(layer),
                    property: mutationArgs.propertyName
                };
                pushPropertyInspection(property);
                break;
            case "setLayerProperties":
                comp = resolveComposition(mutationArgs);
                layer = resolveSingleLayerInComp(comp, mutationArgs);
                requested = listRequestedSetLayerProperties(mutationArgs);
                response.target = {
                    composition: buildCompSummary(comp),
                    layer: buildLayerSummary(layer),
                    properties: requested
                };
                for (i = 0; i < requested.length; i++) {
                    pushPropertyInspection(resolvePropertyOnLayer(layer, requested[i]));
                }
                break;
            case "applyEffect":
            case "applyEffectTemplate":
            case "applyBwTint":
            case "duplicateLayer":
            case "deleteLayer":
            case "setLayerMask":
                comp = resolveComposition(mutationArgs);
                layer = resolveSingleLayerInComp(comp, mutationArgs);
                response.target = {
                    composition: buildCompSummary(comp),
                    layer: buildLayerSummary(layer)
                };
                break;
            case "enableMotionBlur":
            case "createDropdownController":
                comp = resolveComposition(mutationArgs);
                response.target = {
                    composition: buildCompSummary(comp)
                };
                break;
            case "sequenceLayerPosition":
            case "copyPathsToMasks":
            case "createTimerRig":
            case "linkOpacityToDropdown":
                comp = resolveComposition(mutationArgs);
                layers = resolveMultipleLayersInComp(comp, mutationArgs);
                response.target = {
                    composition: buildCompSummary(comp),
                    layers: buildLayerListSummary(layers)
                };
                break;
            case "setupTypewriterText":
                comp = resolveComposition(mutationArgs);
                layer = resolveSingleLayerInComp(comp, mutationArgs);
                response.target = {
                    composition: buildCompSummary(comp),
                    layer: buildLayerSummary(layer)
                };
                break;
            case "cleanupKeyframes":
            case "setupRetimingMode":
                comp = getActiveComp();
                if (!comp) {
                    throw new Error("An active composition is required for selected-property workflows");
                }
                response.target = {
                    composition: buildCompSummary(comp),
                    selectedLayers: buildLayerListSummary(comp.selectedLayers || [])
                };
                break;
            case "setCompositionProperties":
                comp = resolveComposition(mutationArgs);
                response.target = {
                    composition: buildCompSummary(comp)
                };
                break;
            default:
                response.target = null;
                response.checks.targetExists = false;
                response.checks.propertyWritable = null;
                response.warning = "No command-specific preflight implementation exists for this command.";
                break;
        }

        if (response.checks.checkpointRequired && !response.checks.projectSaved) {
            response.checks.checkpointPossible = false;
        }

        return JSON.stringify(response, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            code: "PREFLIGHT_FAILED",
            message: error.toString()
        }, null, 2);
    }
}

function prepareProjectCheckpoint(args) {
    try {
        var revisionBeforeSave = app.project.revision;
        if (!app.project.file) {
            return JSON.stringify({
                status: "error",
                code: "PROJECT_NOT_SAVED",
                message: "Checkpoint creation requires a saved project."
            }, null, 2);
        }

        app.project.save();

        return JSON.stringify({
            status: "success",
            message: "Project prepared for checkpoint creation.",
            label: args && args.label ? args.label : null,
            projectName: app.project.file ? app.project.file.name : "Untitled Project",
            projectPath: app.project.file ? app.project.file.fsName : "",
            revisionBeforeSave: revisionBeforeSave,
            revisionAfterSave: app.project.revision,
            savedAt: getIsoTimestamp()
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            code: "CHECKPOINT_PREPARE_FAILED",
            message: error.toString()
        }, null, 2);
    }
}

function restoreCheckpoint(args) {
    try {
        args = args || {};
        var checkpointPath = args.checkpointPath || "";
        var branchPath = args.branchPath || "";
        var branchBeforeRevert = args.branchBeforeRevert !== false;
        var checkpointFile = new File(checkpointPath);
        if (!checkpointFile.exists) {
            throw new Error("Checkpoint file does not exist: " + checkpointPath);
        }

        var previousProjectPath = app.project.file ? app.project.file.fsName : "";
        var previousRevision = app.project.revision;
        var branchCreated = false;

        if (branchBeforeRevert && branchPath) {
            var branchFile = new File(branchPath);
            if (branchFile.parent && !branchFile.parent.exists) {
                branchFile.parent.create();
            }
            app.project.save(branchFile);
            branchCreated = true;
        }

        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        app.open(checkpointFile);

        return JSON.stringify({
            status: "success",
            message: "Checkpoint restored successfully.",
            previousProjectPath: previousProjectPath,
            previousRevision: previousRevision,
            branchBeforeRevert: branchBeforeRevert,
            branchCreated: branchCreated,
            branchPath: branchCreated ? branchPath : "",
            openedProjectPath: app.project.file ? app.project.file.fsName : "",
            openedProjectName: app.project.file ? app.project.file.name : "Untitled Project",
            revisionAfterOpen: app.project.revision
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            code: "RESTORE_CHECKPOINT_FAILED",
            message: error.toString()
        }, null, 2);
    }
}

function inferCreatedItems(command, resultObj) {
    var created = [];
    if (!resultObj) {
        return created;
    }
    if (command === "createComposition" && resultObj.composition) {
        created.push({ type: "composition", name: resultObj.composition.name });
    }
    if ((command === "createTextLayer" || command === "createShapeLayer" || command === "createSolidLayer" || command === "createCamera") && resultObj.layer) {
        created.push({ type: "layer", name: resultObj.layer.name, index: resultObj.layer.index });
    }
    if (command === "setLayerMask" && resultObj.mask) {
        created.push({ type: "mask", name: resultObj.mask.name, index: resultObj.mask.index });
    }
    return created;
}

function inferChangedItems(resultObj) {
    if (!resultObj) {
        return [];
    }
    if (resultObj.changed) {
        return resultObj.changed;
    }
    if (resultObj.changedProperties) {
        return resultObj.changedProperties;
    }
    if (resultObj.layer && resultObj.layer.changedProperties) {
        return resultObj.layer.changedProperties;
    }
    return [];
}

function buildTargetSummary(args, resultObj) {
    var target = {};
    if (resultObj && resultObj.target) {
        return resultObj.target;
    }
    if (resultObj && resultObj.composition) {
        target.composition = resultObj.composition;
    } else if (args && (hasValue(args.compName) || hasValue(args.compIndex))) {
        target.composition = {};
        if (hasValue(args.compName)) {
            target.composition.name = args.compName;
        }
        if (hasValue(args.compIndex)) {
            target.composition.index = args.compIndex;
        }
    }
    if (resultObj && resultObj.layer) {
        target.layer = { name: resultObj.layer.name, index: resultObj.layer.index };
    } else if (args && (hasValue(args.layerName) || hasValue(args.layerIndex) || args.useSelectedLayer === true)) {
        target.layer = {};
        if (hasValue(args.layerName)) {
            target.layer.name = args.layerName;
        }
        if (hasValue(args.layerIndex)) {
            target.layer.index = args.layerIndex;
        }
        if (args.useSelectedLayer === true) {
            target.layer.mode = "selected";
        }
    }
    if (args && hasValue(args.propertyName)) {
        target.property = args.propertyName;
    }
    for (var key in target) {
        if (target.hasOwnProperty(key)) {
            return target;
        }
    }
    return null;
}

function normalizeCommandResult(command, args, commandData, rawResult) {
    var resultObj = null;
    if (typeof rawResult === "string") {
        try {
            resultObj = JSON.parse(rawResult);
        } catch (parseError) {
            resultObj = { status: "success", message: rawResult };
        }
    } else if (rawResult && typeof rawResult === "object") {
        resultObj = rawResult;
    } else {
        resultObj = { status: "success", message: String(rawResult) };
    }

    if (resultObj.success !== undefined && resultObj.status === undefined) {
        resultObj.status = resultObj.success ? "success" : "error";
    }
    if (!resultObj.status) {
        resultObj.status = "success";
    }
    if (!resultObj.message && resultObj.error) {
        resultObj.message = resultObj.error;
    }

    resultObj.command = command;
    resultObj.commandId = commandData && commandData.commandId ? commandData.commandId : (args && args.commandId ? args.commandId : null);
    resultObj.target = buildTargetSummary(args, resultObj);
    resultObj.changed = inferChangedItems(resultObj);
    resultObj.created = inferCreatedItems(command, resultObj);
    resultObj.warnings = resultObj.warnings || [];
    resultObj.timestamp = getIsoTimestamp();
    resultObj._responseTimestamp = resultObj.timestamp;
    resultObj._commandExecuted = command;
    resultObj._commandId = resultObj.commandId;

    return JSON.stringify(resultObj, null, 2);
}

function buildLayerListSummary(layers) {
    var result = [];
    for (var i = 0; i < layers.length; i++) {
        result.push(buildLayerSummary(layers[i]));
    }
    return result;
}

function getEffectParade(layer) {
    try {
        return layer.property("ADBE Effect Parade") || layer.property("Effects");
    } catch (e) {
        return null;
    }
}

function findEffectByName(layer, effectName) {
    var parade = getEffectParade(layer);
    if (!parade) {
        return null;
    }
    for (var i = 1; i <= parade.numProperties; i++) {
        var fx = parade.property(i);
        if (fx && fx.name === effectName) {
            return fx;
        }
    }
    return null;
}

function ensureNamedEffect(layer, matchName, effectName) {
    var parade = getEffectParade(layer);
    if (!parade) {
        throw new Error("No effect parade on layer '" + layer.name + "'");
    }
    var existing = findEffectByName(layer, effectName);
    if (existing) {
        if (existing.matchName !== matchName) {
            throw new Error("Effect name conflict on layer '" + layer.name + "': " + effectName);
        }
        return existing;
    }
    var created = parade.addProperty(matchName);
    created.name = effectName;
    return created;
}

function ensureNullLayer(comp, layerName) {
    var matches = findLayersByName(comp, layerName);
    if (matches.length > 1) {
        throw new Error("Layer name is ambiguous: '" + layerName + "'");
    }
    if (matches.length === 1) {
        return { layer: matches[0], created: false };
    }
    var nullLayer = comp.layers.addNull();
    nullLayer.name = layerName;
    return { layer: nullLayer, created: true };
}

function setSingleEffectValue(effect, value) {
    if (!effect || !effect.property(1)) {
        throw new Error("Effect control is not writable");
    }
    effect.property(1).setValue(value);
}

function ensureSliderControl(layer, name, value) {
    var fx = ensureNamedEffect(layer, "ADBE Slider Control", name);
    setSingleEffectValue(fx, value);
    return fx;
}

function ensureCheckboxControl(layer, name, value) {
    var fx = ensureNamedEffect(layer, "ADBE Checkbox Control", name);
    setSingleEffectValue(fx, value ? 1 : 0);
    return fx;
}

function getDropdownMenuProperty(effect) {
    if (!effect) {
        return null;
    }
    try {
        var firstProp = effect.property(1);
        if (firstProp && firstProp.isDropdownEffect) {
            return firstProp;
        }
    } catch (e) {}
    try {
        var menuProp = effect.property("Menu");
        if (menuProp && menuProp.isDropdownEffect) {
            return menuProp;
        }
    } catch (e2) {}
    return null;
}

function ensureDropdownControl(layer, name, items, selectedIndex) {
    var parade = getEffectParade(layer);
    if (!parade) {
        throw new Error("No effect parade on layer '" + layer.name + "'");
    }
    var fx = findEffectByName(layer, name);
    if (fx && !getDropdownMenuProperty(fx)) {
        throw new Error("Effect name conflict on layer '" + layer.name + "': " + name);
    }
    if (!fx) {
        fx = parade.addProperty("Dropdown Menu Control");
        fx.name = name;
    }
    var effectIndex = fx.propertyIndex;
    var dropdownProp = getDropdownMenuProperty(fx);
    if (!dropdownProp) {
        throw new Error("Dropdown Menu control not available on this After Effects version");
    }

    if (items && items.length) {
        dropdownProp.setPropertyParameters(items);
        fx = parade.property(effectIndex);
        if (!fx) {
            throw new Error("Dropdown Menu control became invalid after updating menu items");
        }
        if (fx.name !== name) {
            fx.name = name;
        }
        dropdownProp = getDropdownMenuProperty(fx);
        if (!dropdownProp) {
            throw new Error("Dropdown Menu control is not writable after updating menu items");
        }
    }

    var normalizedSelectedIndex = parseInt(selectedIndex, 10);
    if (isNaN(normalizedSelectedIndex) || normalizedSelectedIndex < 1) {
        normalizedSelectedIndex = 1;
    }
    if (items && items.length && normalizedSelectedIndex > items.length) {
        normalizedSelectedIndex = items.length;
    }
    dropdownProp.setValue(normalizedSelectedIndex);
    return fx;
}

function parseHexColor(text) {
    var hex = String(text || "").replace(/^\s+|\s+$/g, "").replace(/^#/, "").toUpperCase();
    if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) +
              hex.charAt(1) + hex.charAt(1) +
              hex.charAt(2) + hex.charAt(2);
    }
    if (hex.length !== 6 || !/^[0-9A-F]{6}$/.test(hex)) {
        return null;
    }
    return [
        parseInt(hex.substr(0, 2), 16) / 255,
        parseInt(hex.substr(2, 2), 16) / 255,
        parseInt(hex.substr(4, 2), 16) / 255
    ];
}

function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function mixColor(a, b, t) {
    var tt = clamp(t, 0, 1);
    return [
        a[0] + (b[0] - a[0]) * tt,
        a[1] + (b[1] - a[1]) * tt,
        a[2] + (b[2] - a[2]) * tt
    ];
}

function addUniqueProperty(list, prop) {
    for (var i = 0; i < list.length; i++) {
        if (list[i] === prop) {
            return;
        }
    }
    list.push(prop);
}

function collectKeyedProperties(item, outList) {
    if (!item) return;

    try {
        if (item instanceof Property) {
            if (item.numKeys && item.numKeys > 0) {
                addUniqueProperty(outList, item);
            }
            return;
        }
    } catch (errProperty) {}

    var count = 0;
    try {
        count = item.numProperties || 0;
    } catch (errCount) {
        count = 0;
    }

    for (var i = 1; i <= count; i++) {
        var child = null;
        try {
            child = item.property(i);
        } catch (errChild) {
            child = null;
        }
        if (child) {
            collectKeyedProperties(child, outList);
        }
    }
}

function getSelectedKeyedPropertiesFromActiveComp() {
    var comp = getActiveComp();
    if (!comp) {
        throw new Error("No active composition");
    }
    var selectedProps = comp.selectedProperties;
    if (!selectedProps || selectedProps.length === 0) {
        throw new Error("No selected properties");
    }
    var properties = [];
    for (var i = 0; i < selectedProps.length; i++) {
        collectKeyedProperties(selectedProps[i], properties);
    }
    if (!properties.length) {
        throw new Error("Selected properties do not contain keyframes");
    }
    return {
        comp: comp,
        properties: properties
    };
}

function getPropertyOwningLayer(prop) {
    if (!prop || !prop.propertyDepth) {
        return null;
    }
    try {
        return prop.propertyGroup(prop.propertyDepth);
    } catch (e) {
        return null;
    }
}

function propertyLabel(prop) {
    try {
        return prop.name || prop.matchName || "Property";
    } catch (e) {
        return "Property";
    }
}

function safeKeyValue(prop, index) {
    try {
        return prop.keyValue(index);
    } catch (e) {
        return null;
    }
}

function isArrayLike(value) {
    return value && typeof value === "object" && typeof value.length === "number" && typeof value !== "string";
}

function compareShapeLike(a, b, tolerance) {
    if (!a || !b) return false;
    if (!!a.closed !== !!b.closed) return false;
    if (!valuesNearEqual(a.vertices, b.vertices, tolerance)) return false;
    if (!valuesNearEqual(a.inTangents, b.inTangents, tolerance)) return false;
    if (!valuesNearEqual(a.outTangents, b.outTangents, tolerance)) return false;
    return true;
}

function valuesNearEqual(a, b, tolerance) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;

    var typeA = typeof a;
    var typeB = typeof b;
    if (typeA !== typeB) return false;

    if (typeA === "number") {
        return Math.abs(a - b) <= tolerance;
    }
    if (typeA === "boolean" || typeA === "string") {
        return a === b;
    }
    if (isArrayLike(a) && isArrayLike(b)) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (!valuesNearEqual(a[i], b[i], tolerance)) return false;
        }
        return true;
    }
    if (typeA === "object") {
        if (a.vertices !== undefined && b.vertices !== undefined) {
            return compareShapeLike(a, b, tolerance);
        }
        if (a.text !== undefined && b.text !== undefined) {
            return a.text === b.text;
        }
        try {
            return a.toSource() === b.toSource();
        } catch (err) {
            return false;
        }
    }
    return false;
}

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
        var text = args.text || "Text Layer";
        var position = args.position || [960, 540]; 
        var fontSize = args.fontSize || 72;
        var color = args.color || [1, 1, 1]; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var fontFamily = args.fontFamily || "Arial";
        var alignment = args.alignment || "center"; 
        var comp = resolveComposition(args);
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
            composition: buildCompSummary(comp),
            layer: { name: textLayer.name, index: textLayer.index, type: "text", inPoint: textLayer.inPoint, outPoint: textLayer.outPoint, position: textLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createShapeLayer (from createShapeLayer.jsx) --- 
function createShapeLayer(args) {
    try {
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
        var comp = resolveComposition(args);
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
            composition: buildCompSummary(comp),
            layer: { name: shapeLayer.name, index: shapeLayer.index, type: "shape", shapeType: shapeType, inPoint: shapeLayer.inPoint, outPoint: shapeLayer.outPoint, position: shapeLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- createCamera ---
function createCamera(args) {
    try {
        var name = args.name || "Camera";
        var zoom = args.zoom || 1777.78; // Default ~50mm equivalent
        var position = args.position; // Optional [x, y, z]
        var pointOfInterest = args.pointOfInterest; // Optional [x, y, z]
        var oneNode = args.oneNode || false; // If true, create a one-node camera (no point of interest)
        var comp = resolveComposition(args);

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
            composition: buildCompSummary(comp),
            layer: result
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- duplicateLayer ---
function duplicateLayer(args) {
    try {
        var newName = args.newName; // optional rename
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);

        var newLayer = layer.duplicate();
        if (newName) { newLayer.name = newName; }

        return JSON.stringify({
            status: "success",
            message: "Layer duplicated successfully",
            composition: buildCompSummary(comp),
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
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);

        var deletedName = layer.name;
        var deletedIndex = layer.index;
        layer.remove();

        return JSON.stringify({
            status: "success",
            message: "Layer deleted successfully",
            composition: buildCompSummary(comp),
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
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);

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
            composition: buildCompSummary(comp),
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
        var color = args.color || [1, 1, 1]; 
        var name = args.name || "Solid Layer";
        var position = args.position || [960, 540]; 
        var size = args.size; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var isAdjustment = args.isAdjustment || false; 
        var comp = resolveComposition(args);
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
            composition: buildCompSummary(comp),
            layer: { name: solidLayer.name, index: solidLayer.index, type: isAdjustment ? "adjustment" : "solid", inPoint: solidLayer.inPoint, outPoint: solidLayer.outPoint, position: solidLayer.property("Position").value, isAdjustment: solidLayer.adjustmentLayer }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function normalizeRgbColorInput(colorValue, fallback) {
    var fallbackColor = fallback || [0, 0, 0];
    if (!hasValue(colorValue)) {
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
        args = args || {};
        var comp = resolveComposition(args);
        var startTime = hasValue(args.startTime) ? Number(args.startTime) : 0;
        var duration = hasValue(args.duration) ? Number(args.duration) : Math.max(0, comp.duration - startTime);
        var color = normalizeRgbColorInput(args.color || args.hexColor || args.backgroundColor, [0, 0, 0]);
        var layerName = args.name || "Background";
        var solidLayer = comp.layers.addSolid(color, layerName, comp.width, comp.height, comp.pixelAspect || 1);
        var position = [comp.width / 2, comp.height / 2];

        solidLayer.property("Position").setValue(position);
        solidLayer.startTime = startTime;
        if (duration > 0) {
            solidLayer.outPoint = Math.min(comp.duration, startTime + duration);
        }
        if (args.moveToBack !== false) {
            solidLayer.moveToEnd();
        }

        return JSON.stringify({
            status: "success",
            message: "Background solid created successfully",
            composition: buildCompSummary(comp),
            layer: {
                name: solidLayer.name,
                index: solidLayer.index,
                type: "solid",
                inPoint: solidLayer.inPoint,
                outPoint: solidLayer.outPoint,
                position: solidLayer.property("Position").value
            },
            defaultsApplied: {
                fullFrame: true,
                moveToBack: args.moveToBack !== false
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function animateTextEntry(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);
        if (!(layer instanceof TextLayer)) {
            throw new Error("Target layer must be a text layer");
        }

        var direction = args.direction || "bottom";
        var distance = hasValue(args.distance) ? Number(args.distance) : 120;
        var duration = hasValue(args.duration) ? Number(args.duration) : 1;
        var startTime = hasValue(args.startTime) ? Number(args.startTime) : layer.inPoint;
        var fadeIn = args.fadeIn !== false;
        var overshoot = args.overshoot !== false;
        var opacityFrom = hasValue(args.opacityFrom) ? Number(args.opacityFrom) : 0;

        var positionProp = layer.property("Position");
        var opacityProp = layer.property("Opacity");
        var finalPosition = positionProp.value;
        var finalOpacity = opacityProp.value;
        var startPosition = finalPosition instanceof Array ? finalPosition.slice(0) : [finalPosition];
        var overshootPosition = finalPosition instanceof Array ? finalPosition.slice(0) : [finalPosition];

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

        positionProp.setValueAtTime(startTime, startPosition);
        if (overshoot) {
            positionProp.setValueAtTime(startTime + duration * 0.82, overshootPosition);
        }
        positionProp.setValueAtTime(startTime + duration, finalPosition);

        if (fadeIn) {
            opacityProp.setValueAtTime(startTime, opacityFrom);
            opacityProp.setValueAtTime(startTime + duration, finalOpacity);
        }

        return JSON.stringify({
            status: "success",
            message: "Text entry animation applied successfully",
            composition: buildCompSummary(comp),
            layer: buildLayerSummary(layer),
            animation: {
                direction: direction,
                distance: distance,
                duration: duration,
                startTime: startTime,
                fadeIn: fadeIn,
                overshoot: overshoot,
                startPosition: startPosition,
                finalPosition: finalPosition
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setLayerProperties (modified to handle text properties) ---
function setLayerProperties(args) {
    try {
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
        
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);
        
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
            composition: buildCompSummary(comp),
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
        var operations = args.operations; // Array of {layerIndex, threeDLayer, position, scale, rotation, opacity, ...}

        if (!operations || !operations.length) {
            throw new Error("No operations provided. Pass an array of {layerIndex, ...properties}");
        }

        var comp = resolveComposition(args);

        var results = [];
        for (var o = 0; o < operations.length; o++) {
            var op = operations[o];
            var layer = null;
            try {
                layer = resolveSingleLayerInComp(comp, op);
            } catch (layerError) {
                results.push({ layerIndex: op.layerIndex, layerName: op.layerName, status: "error", message: layerError.toString() });
                continue;
            }

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

        return JSON.stringify({ status: "success", composition: buildCompSummary(comp), results: results }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setLayerKeyframe(args) {
    try {
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);
        var propertyName = args.propertyName;
        var timeInSeconds = args.timeInSeconds;
        if (timeInSeconds === undefined || timeInSeconds === null || timeInSeconds === "") {
            timeInSeconds = args.time;
        }
        var value = args.value;
        var property = resolvePropertyOnLayer(layer, propertyName);

        if (!property.canVaryOverTime) {
            return JSON.stringify({ status: "error", message: "Property '" + propertyName + "' cannot be keyframed." });
        }

        if (property.numKeys === 0 && !property.isTimeVarying) {
            property.setValueAtTime(comp.time, property.value);
        }

        property.setValueAtTime(timeInSeconds, value);

        return JSON.stringify({
            status: "success",
            message: "Keyframe set for '" + propertyName + "' on layer '" + layer.name + "' at " + timeInSeconds + "s.",
            composition: buildCompSummary(comp),
            layer: buildLayerSummary(layer),
            propertyName: propertyName,
            timeInSeconds: timeInSeconds,
            value: value,
            changed: ["keyframe"]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: "Error setting keyframe: " + e.toString() + " (Line: " + e.line + ")" }, null, 2);
    }
}


function setLayerExpression(args) {
    try {
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);
        var propertyName = args.propertyName;
        var expressionString = args.expressionString;
        var property = resolvePropertyOnLayer(layer, propertyName);
        if (!property.canSetExpression) {
            return JSON.stringify({ status: "error", message: "Property '" + propertyName + "' does not support expressions." }, null, 2);
        }

        property.expression = expressionString;

        var action = expressionString === "" ? "removed" : "set";
        return JSON.stringify({
            status: "success",
            message: "Expression " + action + " for '" + propertyName + "' on layer '" + layer.name + "'.",
            composition: buildCompSummary(comp),
            layer: buildLayerSummary(layer),
            propertyName: propertyName,
            changed: ["expression"]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" }, null, 2);
    }
}

function enableMotionBlur(args) {
    try {
        args = args || {};
        var scope = args.scope || "active_comp";
        var includeLocked = args.includeLocked === true;
        var comps = [];
        var i, j;

        if (scope === "all_comps") {
            for (i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (item instanceof CompItem) {
                    comps.push(item);
                }
            }
            if (!comps.length) {
                throw new Error("No compositions found in the project");
            }
        } else {
            comps.push(resolveComposition(args));
        }

        var changedComps = 0;
        var changedLayers = 0;
        var skippedLockedLayers = 0;
        var compResults = [];

        for (i = 0; i < comps.length; i++) {
            var comp = comps[i];
            var compChanged = false;
            var compLayerChanges = 0;
            var compSkippedLocked = 0;

            if (!comp.motionBlur) {
                comp.motionBlur = true;
                compChanged = true;
            }

            for (j = 1; j <= comp.numLayers; j++) {
                var layer = comp.layer(j);
                var wasLocked = layer.locked;

                if (wasLocked && !includeLocked) {
                    compSkippedLocked++;
                    skippedLockedLayers++;
                    continue;
                }

                if (wasLocked && includeLocked) {
                    layer.locked = false;
                }

                if (!layer.motionBlur) {
                    layer.motionBlur = true;
                    compLayerChanges++;
                    changedLayers++;
                }

                if (wasLocked && includeLocked) {
                    layer.locked = true;
                }
            }

            if (compChanged || compLayerChanges > 0) {
                changedComps++;
            }

            compResults.push({
                name: comp.name,
                index: findProjectItemIndexById(comp.id),
                changedCompSwitch: compChanged,
                changedLayers: compLayerChanges,
                skippedLockedLayers: compSkippedLocked
            });
        }

        return JSON.stringify({
            status: "success",
            message: "Motion blur enabled successfully",
            scope: scope,
            changed: ["motionBlur"],
            changedComps: changedComps,
            changedLayers: changedLayers,
            skippedLockedLayers: skippedLockedLayers,
            results: compResults
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function sequenceLayerPosition(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var offsetX = hasValue(args.offsetX) ? parseFloat(args.offsetX) : 0;
        var offsetY = hasValue(args.offsetY) ? parseFloat(args.offsetY) : 36.6;
        var order = args.order || "layer_stack";

        if (isNaN(offsetX) || isNaN(offsetY)) {
            throw new Error("offsetX and offsetY must be valid numbers");
        }

        var layers = resolveMultipleLayersInComp(comp, args);
        if (order === "layer_stack") {
            layers = sortLayersByStackOrder(layers);
        }

        function cloneArrayLike(value) {
            var copy = [];
            for (var c = 0; c < value.length; c++) {
                copy.push(value[c]);
            }
            return copy;
        }

        var results = [];
        var anchorPosition = null;
        var anchorLayer = null;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var posProp = layer.property("Position");
            if (!posProp) {
                throw new Error("Layer '" + layer.name + "' does not have a position property");
            }
            var pos = posProp.value;
            if (!pos || pos.length === undefined || pos.length < 2) {
                throw new Error("Layer '" + layer.name + "' does not expose a writable XY position array");
            }
            if (!anchorPosition) {
                anchorPosition = cloneArrayLike(pos);
                anchorLayer = layer;
            }
            var newPos = cloneArrayLike(pos);
            newPos[0] = anchorPosition[0] + (offsetX * i);
            newPos[1] = anchorPosition[1] + (offsetY * i);
            posProp.setValue(newPos);
            results.push({
                layer: buildLayerSummary(layer),
                orderIndex: i,
                previousPosition: cloneArrayLike(pos),
                position: newPos
            });
        }

        return JSON.stringify({
            status: "success",
            message: "Layer positions sequenced successfully",
            composition: buildCompSummary(comp),
            targetLayers: buildLayerListSummary(layers),
            changed: ["position"],
            offset: { x: offsetX, y: offsetY },
            order: order,
            anchorLayer: buildLayerSummary(anchorLayer),
            anchorPosition: anchorPosition,
            results: results
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function copyPathsToMasks(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var activeComp = getActiveComp();
        if (!activeComp || activeComp.id !== comp.id) {
            throw new Error("Selected path workflows require the target composition to be the active composition");
        }

        function isPathProperty(prop) {
            return prop && (prop.matchName === "ADBE Vector Shape" || prop.matchName === "ADBE Mask Shape");
        }

        function extractPathFromGroup(prop) {
            if (prop && prop.canSetExpression === false && prop.property && prop.property("Path") && prop.property("Path").matchName === "ADBE Vector Shape") {
                return prop.property("Path");
            }
            return null;
        }

        function collectUniquePaths(targetComp) {
            var uniquePaths = [];
            var selectedLayers = targetComp.selectedLayers;
            if (!selectedLayers || selectedLayers.length === 0) {
                throw new Error("Select at least one layer containing a path");
            }

            for (var l = 0; l < selectedLayers.length; l++) {
                var layer = selectedLayers[l];
                var selectedProps = layer.selectedProperties;

                for (var p = 0; p < selectedProps.length; p++) {
                    var prop = selectedProps[p];
                    var validPath = null;

                    if (isPathProperty(prop)) {
                        validPath = prop;
                    } else {
                        var extracted = extractPathFromGroup(prop);
                        if (extracted) {
                            validPath = extracted;
                        }
                    }

                    if (validPath) {
                        var exists = false;
                        for (var k = 0; k < uniquePaths.length; k++) {
                            if (uniquePaths[k].pathProp === validPath) {
                                exists = true;
                                break;
                            }
                        }
                        if (!exists) {
                            uniquePaths.push({ sourceLayer: layer, pathProp: validPath });
                        }
                    }
                }
            }
            return uniquePaths;
        }

        function deg2rad(d){ return d * Math.PI / 180; }
        function mulMat(a,b){
            var r = [[0,0,0],[0,0,0],[0,0,0]];
            for (var i=0;i<3;i++){
                for (var j=0;j<3;j++){
                    r[i][j]=a[i][0]*b[0][j]+a[i][1]*b[1][j]+a[i][2]*b[2][j];
                }
            }
            return r;
        }
        function matTranslate(x,y){ return [[1,0,x],[0,1,y],[0,0,1]]; }
        function matScale(sx,sy){ return [[sx,0,0],[0,sy,0],[0,0,1]]; }
        function matRotate(deg){
            var r = deg2rad(deg);
            var c = Math.cos(r), s = Math.sin(r);
            return [[c,-s,0],[s,c,0],[0,0,1]];
        }
        function applyMatPoint(m, pt){
            return [
                m[0][0]*pt[0] + m[0][1]*pt[1] + m[0][2],
                m[1][0]*pt[0] + m[1][1]*pt[1] + m[1][2]
            ];
        }
        function applyMatVectorNoTranslate(m, v){
            return [
                m[0][0]*v[0] + m[0][1]*v[1],
                m[1][0]*v[0] + m[1][1]*v[1]
            ];
        }
        function getVectorGroupMatrix(group){
            var t = group.property("ADBE Vector Transform Group");
            if (!t) return [[1,0,0],[0,1,0],[0,0,1]];
            var pos = t.property("ADBE Vector Position").value;
            var anc = t.property("ADBE Vector Anchor").value;
            var sc  = t.property("ADBE Vector Scale").value;
            var rot = t.property("ADBE Vector Rotation").value;
            var sx = sc[0]/100, sy = sc[1]/100;
            var m = matTranslate(pos[0], pos[1]);
            m = mulMat(m, matRotate(rot));
            m = mulMat(m, matScale(sx, sy));
            m = mulMat(m, matTranslate(-anc[0], -anc[1]));
            return m;
        }
        function bakeShapeToLayerSpace(shapeProp){
            var shape = shapeProp.value;
            var m = [[1,0,0],[0,1,0],[0,0,1]];
            var cur = shapeProp.parentProperty;
            while (cur){
                if (cur.matchName === "ADBE Root Vectors Group") break;
                if (cur.property && cur.property("ADBE Vector Transform Group")){
                    var gm = getVectorGroupMatrix(cur);
                    m = mulMat(gm, m);
                }
                cur = cur.parentProperty;
            }

            var v = shape.vertices;
            var inT = shape.inTangents;
            var outT = shape.outTangents;
            for (var i=0; i<v.length; i++){
                v[i] = applyMatPoint(m, v[i]);
                inT[i] = applyMatVectorNoTranslate(m, inT[i]);
                outT[i] = applyMatVectorNoTranslate(m, outT[i]);
            }

            var newShape = new Shape();
            newShape.vertices = v;
            newShape.inTangents = inT;
            newShape.outTangents = outT;
            newShape.closed = shape.closed;
            return newShape;
        }

        var pathEntries = collectUniquePaths(comp);
        if (!pathEntries.length) {
            throw new Error("No valid selected paths found");
        }

        var targetLayerMode = args.targetLayerMode || "same_layer";
        var maskMode = args.maskMode || "add";
        var targetLayers = [];
        if (targetLayerMode === "selected_layers") {
            targetLayers = resolveMultipleLayersInComp(comp, args);
        }

        var maskModes = {
            "none": MaskMode.NONE,
            "add": MaskMode.ADD,
            "subtract": MaskMode.SUBTRACT,
            "intersect": MaskMode.INTERSECT
        };
        var resolvedMaskMode = maskModes[maskMode];
        if (resolvedMaskMode === undefined) {
            throw new Error("Unsupported maskMode: " + maskMode);
        }

        var createdMasks = [];
        for (var pIndex = 0; pIndex < pathEntries.length; pIndex++) {
            var entry = pathEntries[pIndex];
            var shapeToSet = entry.pathProp.matchName === "ADBE Mask Shape" ? entry.pathProp.value : bakeShapeToLayerSpace(entry.pathProp);
            var destinations = targetLayerMode === "selected_layers" ? targetLayers : [entry.sourceLayer];

            for (var d = 0; d < destinations.length; d++) {
                var destinationLayer = destinations[d];
                var newMask = destinationLayer.Masks.addProperty("ADBE Mask Atom");
                newMask.maskMode = resolvedMaskMode;
                newMask.property("ADBE Mask Shape").setValue(shapeToSet);
                createdMasks.push({
                    sourceLayer: buildLayerSummary(entry.sourceLayer),
                    targetLayer: buildLayerSummary(destinationLayer),
                    mask: {
                        name: newMask.name,
                        index: newMask.propertyIndex,
                        mode: maskMode
                    }
                });
            }
        }

        return JSON.stringify({
            status: "success",
            message: "Selected paths copied to masks successfully",
            composition: buildCompSummary(comp),
            changed: ["mask"],
            created: createdMasks,
            pathCount: pathEntries.length,
            maskCount: createdMasks.length,
            targetLayerMode: targetLayerMode
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setupTypewriterText(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);
        if (!(layer instanceof TextLayer) || !layer.property("Source Text")) {
            throw new Error("Target layer must be a text layer");
        }

        var speed = hasValue(args.speed) ? parseFloat(args.speed) : 10;
        var blinkSpeed = hasValue(args.blinkSpeed) ? parseFloat(args.blinkSpeed) : 2;
        var startAt = hasValue(args.startAt) ? parseFloat(args.startAt) : 0;
        var blinkOn = args.blinkOn !== false;
        var controllerName = args.controllerName || "CTRL_Typewriter";

        if (isNaN(speed) || isNaN(blinkSpeed) || isNaN(startAt)) {
            throw new Error("speed, blinkSpeed, and startAt must be valid numbers");
        }

        var controllerInfo = ensureNullLayer(comp, controllerName);
        var controllerLayer = controllerInfo.layer;
        ensureSliderControl(controllerLayer, "Speed", speed);
        ensureSliderControl(controllerLayer, "Blink Speed", blinkSpeed);
        ensureSliderControl(controllerLayer, "Start At", startAt);
        ensureCheckboxControl(controllerLayer, "Blink On", blinkOn);

        var escapedControllerName = controllerName.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
        var expr =
'txt = value.toString();\n' +
'ctrl = thisComp.layer("' + escapedControllerName + '");\n' +
'speed = ctrl.effect("Speed")("Slider");\n' +
'blinkSpeed = ctrl.effect("Blink Speed")("Slider");\n' +
'start = ctrl.effect("Start At")("Slider");\n' +
'blinkOn = ctrl.effect("Blink On")("Checkbox");\n' +
't = time - inPoint - start;\n' +
'count = Math.floor(t * speed);\n' +
'count = clamp(count, 0, txt.length);\n' +
'blink = Math.sin(time * blinkSpeed * Math.PI * 2) > 0;\n' +
'cursor = "";\n' +
'if (blinkOn == 1){ cursor = blink ? "|" : " "; }\n' +
'if (count <= 0){\n' +
'    cursor;\n' +
'}else{\n' +
'    txt.substr(0, count) + cursor;\n' +
'}';

        layer.property("Source Text").expression = expr;

        return JSON.stringify({
            status: "success",
            message: "Typewriter setup applied successfully",
            composition: buildCompSummary(comp),
            layer: buildLayerSummary(layer),
            controller: {
                name: controllerLayer.name,
                index: controllerLayer.index,
                created: controllerInfo.created
            },
            changed: ["expression", "controller"],
            settings: {
                speed: speed,
                blinkSpeed: blinkSpeed,
                startAt: startAt,
                blinkOn: blinkOn
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function createTimerRig(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var mode = args.mode || "countdown";
        var timeFormat = args.timeFormat || "HH:MM:SS";
        var rate = hasValue(args.rate) ? parseFloat(args.rate) : 1;
        var startHours = hasValue(args.startHours) ? parseFloat(args.startHours) : 24;
        var startMinutes = hasValue(args.startMinutes) ? parseFloat(args.startMinutes) : 0;
        var startSeconds = hasValue(args.startSeconds) ? parseFloat(args.startSeconds) : 0;
        var showMilliseconds = args.showMilliseconds === true;
        var allowNegativeTime = args.allowNegativeTime === true;
        var layerName = args.layerName || "Timer";

        if (isNaN(rate) || isNaN(startHours) || isNaN(startMinutes) || isNaN(startSeconds)) {
            throw new Error("Timer values must be valid numbers");
        }

        var dropdownIndexMap = {
            "HH:MM:SS": 1,
            "MM:SS": 2,
            "SS": 3
        };
        var dropdownIndex = dropdownIndexMap[timeFormat];
        if (!dropdownIndex) {
            throw new Error("Unsupported timeFormat: " + timeFormat);
        }

        var textLayer = comp.layers.addText("00:00:00");
        textLayer.name = layerName;
        var textLayerIndex = textLayer.index;

        ensureCheckboxControl(textLayer, "Countdown", mode === "countdown");
        ensureDropdownControl(textLayer, "Time Format", ["HH:MM:SS", "MM:SS", "SS"], dropdownIndex);
        textLayer = comp.layer(textLayerIndex);
        ensureSliderControl(textLayer, "Rate", rate);
        ensureSliderControl(textLayer, "Start Time - Hours", startHours);
        ensureSliderControl(textLayer, "Start Time - Minutes", startMinutes);
        ensureSliderControl(textLayer, "Start Time - Seconds", startSeconds);
        ensureCheckboxControl(textLayer, "Milliseconds", showMilliseconds);
        ensureCheckboxControl(textLayer, "Negative Time", allowNegativeTime);
        textLayer = comp.layer(textLayerIndex);

        var exp =
'rate = clamp(effect("Rate")("Slider"), 0, 100);\n' +
'h = effect("Start Time - Hours")("Slider");\n' +
'm = effect("Start Time - Minutes")("Slider");\n' +
's = effect("Start Time - Seconds")("Slider");\n' +
'c = effect("Countdown")("Checkbox").value;\n' +
'ms = effect("Milliseconds")("Checkbox").value;\n' +
'format = effect("Time Format")("Menu").value;\n' +
'n = effect("Negative Time")("Checkbox").value;\n' +
'st = h*3600 + m*60 + s;\n' +
't = c ? st - rate*(time - inPoint) : st + rate*(time - inPoint);\n' +
'f = t <= 0 ? [0, 0, 0, 0] : [t/3600, (t%3600)/60, t%60, t.toFixed(3).substr(-3)];\n' +
'for (i in f){ f[i] = String(Math.floor(f[i])).padStart(i>2?3:2, "0"); }\n' +
'if(!ms) f.pop();\n' +
'switch (format){\n' +
'case 1: t = f.join(":"); break;\n' +
'case 2: t = f.slice(1).join(":"); break;\n' +
'case 3: t = f.slice(2).join(":"); break;\n' +
'}\n' +
'n ? "-" + t : t;';

        textLayer.text.sourceText.expression = exp;

        return JSON.stringify({
            status: "success",
            message: "Timer rig created successfully",
            composition: buildCompSummary(comp),
            layer: buildLayerSummary(textLayer),
            changed: ["created", "expression", "controls"],
            settings: {
                mode: mode,
                timeFormat: timeFormat,
                rate: rate,
                startHours: startHours,
                startMinutes: startMinutes,
                startSeconds: startSeconds,
                showMilliseconds: showMilliseconds,
                allowNegativeTime: allowNegativeTime
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function applyBwTint(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var layers = resolveMultipleLayersInComp(comp, args);
        var amount = hasValue(args.amount) ? parseFloat(args.amount) : 100;
        var whiteishAmount = hasValue(args.whiteishAmount) ? parseFloat(args.whiteishAmount) : 0;
        var skipLocked = args.skipLocked !== false;
        var presetName = args.presetName || "Warm";
        var presets = {
            "Neutral": "#FFFFFF",
            "Warm": "#FFD8A8",
            "Gold": "#F7C948",
            "Orange": "#FF9F43",
            "Sepia": "#C38B5F",
            "Cool": "#B7D7FF",
            "Teal": "#7FD6D2"
        };
        var hexColor = args.hexColor || presets[presetName] || presets.Warm;
        var tintColor = parseHexColor(hexColor);

        if (isNaN(amount) || isNaN(whiteishAmount)) {
            throw new Error("amount and whiteishAmount must be valid numbers");
        }
        if (!tintColor) {
            throw new Error("Invalid hexColor. Use #RRGGBB or #RGB.");
        }

        function ensureTintEffect(layer) {
            return ensureNamedEffect(layer, "ADBE Tint", "BW Tint");
        }

        function setupTintEffect(fx, tintAmount, color, whiteMixAmount) {
            var mapBlack = fx.property(1);
            var mapWhite = fx.property(2);
            var amt = fx.property(3);

            var whiteMix = clamp(whiteMixAmount / 100, 0, 1);
            var shadowMix = whiteMix * 0.65;
            var blackTarget = mixColor([0, 0, 0], [1, 1, 1], shadowMix);
            var whiteTarget = mixColor([color[0], color[1], color[2]], [1, 1, 1], whiteMix);

            if (mapBlack) mapBlack.setValue(blackTarget);
            if (mapWhite) mapWhite.setValue(whiteTarget);
            if (amt) amt.setValue(tintAmount);
        }

        var applied = [];
        var skippedLockedLayers = [];
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (skipLocked && layer.locked) {
                skippedLockedLayers.push(buildLayerSummary(layer));
                continue;
            }
            var fx = ensureTintEffect(layer);
            setupTintEffect(fx, amount, tintColor, whiteishAmount);
            applied.push({
                layer: buildLayerSummary(layer),
                effect: {
                    name: fx.name,
                    matchName: fx.matchName,
                    index: fx.propertyIndex
                }
            });
        }

        return JSON.stringify({
            status: "success",
            message: "BW tint applied successfully",
            composition: buildCompSummary(comp),
            changed: ["effect"],
            applied: applied,
            skippedLockedLayers: skippedLockedLayers,
            settings: {
                amount: amount,
                presetName: presetName,
                hexColor: hexColor,
                whiteishAmount: whiteishAmount,
                skipLocked: skipLocked
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function cleanupKeyframes(args) {
    try {
        args = args || {};
        var selection = getSelectedKeyedPropertiesFromActiveComp();
        var comp = selection.comp;
        var properties = selection.properties;
        var mode = args.mode || "remove_duplicates";
        var keepFirst = args.keepFirst !== false;
        var keepLast = args.keepLast !== false;
        var tolerance = hasValue(args.tolerance) ? parseFloat(args.tolerance) : 0;
        var dryRun = args.dryRun === true;

        if (isNaN(tolerance) || tolerance < 0) {
            throw new Error("tolerance must be a valid number >= 0");
        }

        function isProtectedKey(index, numKeys) {
            if (keepFirst && index === 1) return true;
            if (keepLast && index === numKeys) return true;
            return false;
        }

        function shouldRemove(prop, keyIndex) {
            if (mode === "remove_odd" || mode === "remove_even") {
                var frameIndex = Math.round(prop.keyTime(keyIndex) * comp.frameRate);
                var parity = ((frameIndex % 2) + 2) % 2;
                return mode === "remove_odd" ? parity === 1 : parity === 0;
            }
            if (mode === "remove_duplicates" || mode === "remove_unnecessary") {
                if (keyIndex <= 1) return false;
                var currentValue = safeKeyValue(prop, keyIndex);
                var previousValue = safeKeyValue(prop, keyIndex - 1);
                return valuesNearEqual(currentValue, previousValue, tolerance);
            }
            throw new Error("Unsupported cleanup mode: " + mode);
        }

        var results = [];
        var totalRemoved = 0;
        var protectedSkips = 0;

        for (var p = 0; p < properties.length; p++) {
            var prop = properties[p];
            var layer = getPropertyOwningLayer(prop);
            var removeIndexes = [];

            for (var k = prop.numKeys; k >= 1; k--) {
                if (!shouldRemove(prop, k)) continue;
                if (isProtectedKey(k, prop.numKeys)) {
                    protectedSkips++;
                    continue;
                }
                removeIndexes.push(k);
            }

            if (!dryRun) {
                for (var r = 0; r < removeIndexes.length; r++) {
                    prop.removeKey(removeIndexes[r]);
                }
            }

            totalRemoved += removeIndexes.length;
            results.push({
                layer: layer ? buildLayerSummary(layer) : null,
                property: propertyLabel(prop),
                removedKeys: removeIndexes.length,
                mode: mode
            });
        }

        return JSON.stringify({
            status: "success",
            message: dryRun ? "Cleanup preview generated successfully" : "Keyframe cleanup applied successfully",
            composition: buildCompSummary(comp),
            changed: dryRun ? [] : ["keyframes"],
            dryRun: dryRun,
            mode: mode,
            keepFirst: keepFirst,
            keepLast: keepLast,
            tolerance: tolerance,
            protectedSkips: protectedSkips,
            removedKeys: totalRemoved,
            results: results
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setupRetimingMode(args) {
    try {
        args = args || {};
        var selection = getSelectedKeyedPropertiesFromActiveComp();
        var comp = selection.comp;
        var properties = selection.properties;
        var controllerName = args.controllerName || "Retiming Mode";
        var defaultMode = args.defaultMode || "comp_end";
        var modeItems = ["Comp End", "Comp Stretched", "Layer End", "Layer Stretched"];
        var modeIndexMap = {
            "comp_end": 1,
            "comp_stretched": 2,
            "layer_end": 3,
            "layer_stretched": 4
        };
        var selectedIndex = modeIndexMap[defaultMode];
        if (!selectedIndex) {
            throw new Error("Unsupported defaultMode: " + defaultMode);
        }

        var expr =
'var mode = effect("' + controllerName.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '")("Menu").value;\n' +
'if (mode == 1) {\n' +
'    var dur = thisComp.duration;\n' +
'    var lastKeyTime = thisProperty.key(thisProperty.numKeys).time;\n' +
'    valueAtTime(time - dur + lastKeyTime);\n' +
'} else if (mode == 2) {\n' +
'    var firstKeyTime = thisProperty.key(1).time;\n' +
'    var lastKeyTime = thisProperty.key(thisProperty.numKeys).time;\n' +
'    var t = linear(time, 0, thisComp.duration, firstKeyTime, lastKeyTime);\n' +
'    valueAtTime(t);\n' +
'} else if (mode == 3) {\n' +
'    var dur = thisLayer.outPoint - thisLayer.inPoint;\n' +
'    var lastKeyTime = thisProperty.key(thisProperty.numKeys).time;\n' +
'    valueAtTime(time - dur + lastKeyTime);\n' +
'} else if (mode == 4) {\n' +
'    var firstKeyTime = thisProperty.key(1).time;\n' +
'    var lastKeyTime = thisProperty.key(thisProperty.numKeys).time;\n' +
'    var t = linear(time, thisLayer.inPoint, thisLayer.outPoint, firstKeyTime, lastKeyTime);\n' +
'    valueAtTime(t);\n' +
'} else {\n' +
'    value;\n' +
'}';

        var processedLayers = [];
        var createdControllers = [];
        var linkedProperties = [];
        for (var i = 0; i < properties.length; i++) {
            var prop = properties[i];
            if (!prop.canSetExpression || prop.numKeys < 1) {
                continue;
            }
            var layer = getPropertyOwningLayer(prop);
            if (!layer) {
                continue;
            }

            var layerSeen = false;
            for (var s = 0; s < processedLayers.length; s++) {
                if (processedLayers[s] === layer) {
                    layerSeen = true;
                    break;
                }
            }
            if (!layerSeen) {
                ensureDropdownControl(layer, controllerName, modeItems, selectedIndex);
                processedLayers.push(layer);
                createdControllers.push({
                    layer: buildLayerSummary(layer),
                    controllerName: controllerName
                });
            }

            prop.expression = expr;
            linkedProperties.push({
                layer: buildLayerSummary(layer),
                property: propertyLabel(prop)
            });
        }

        return JSON.stringify({
            status: "success",
            message: "Retiming mode setup applied successfully",
            composition: buildCompSummary(comp),
            changed: ["expression", "controls"],
            controllerName: controllerName,
            defaultMode: defaultMode,
            controllers: createdControllers,
            linkedProperties: linkedProperties
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function createDropdownController(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var controllerName = args.controllerName || "CTRL_NULL";
        var menuItems = args.menuItems && args.menuItems.length ? args.menuItems : ["Option 1", "Option 2"];
        var reuseIfExists = args.reuseIfExists !== false;

        var matches = findLayersByName(comp, controllerName);
        if (matches.length > 1) {
            throw new Error("Layer name is ambiguous: '" + controllerName + "'");
        }

        var controllerLayer = null;
        var created = false;
        if (matches.length === 1) {
            if (!reuseIfExists) {
                throw new Error("Controller already exists: '" + controllerName + "'");
            }
            controllerLayer = matches[0];
        } else {
            controllerLayer = comp.layers.addNull();
            controllerLayer.name = controllerName;
            created = true;
        }

        var dropdownName = args.dropdownName || "Dropdown";
        var selectedIndex = hasValue(args.selectedIndex) ? parseInt(args.selectedIndex, 10) : 1;
        if (isNaN(selectedIndex) || selectedIndex < 1) {
            selectedIndex = 1;
        }
        if (selectedIndex > menuItems.length) {
            selectedIndex = menuItems.length;
        }

        var dropdown = ensureDropdownControl(controllerLayer, dropdownName, menuItems, selectedIndex);
        controllerLayer = comp.layer(controllerLayer.index);
        dropdown = findEffectByName(controllerLayer, dropdownName);

        return JSON.stringify({
            status: "success",
            message: "Dropdown controller ready",
            composition: buildCompSummary(comp),
            layer: buildLayerSummary(controllerLayer),
            changed: ["controls"],
            created: created ? ["layer"] : [],
            controller: {
                name: controllerLayer.name,
                index: controllerLayer.index,
                created: created
            },
            dropdown: {
                name: dropdown.name,
                selectedIndex: selectedIndex,
                menuItems: menuItems
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function linkOpacityToDropdown(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var controllerName = args.controllerName || "CTRL_NULL";
        var dropdownName = args.dropdownName || "Dropdown";
        var mappingMode = args.mappingMode || "exclusive";
        var targetLayers = resolveMultipleLayersInComp(comp, args);
        var controllerMatches = findLayersByName(comp, controllerName);

        if (!controllerMatches.length) {
            throw new Error("Controller layer not found: " + controllerName);
        }
        if (controllerMatches.length > 1) {
            throw new Error("Controller layer name is ambiguous: '" + controllerName + "'");
        }

        var controllerLayer = controllerMatches[0];
        var dropdown = findEffectByName(controllerLayer, dropdownName);
        if (!dropdown || !dropdown.property(1) || !dropdown.property(1).isDropdownEffect) {
            throw new Error("Dropdown control not found on controller layer: " + dropdownName);
        }

        var compNameEsc = comp.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var controllerNameEsc = controllerName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var dropdownNameEsc = dropdownName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var linked = [];

        for (var i = 0; i < targetLayers.length; i++) {
            var layer = targetLayers[i];
            var checkValue = i + 1;
            var expr;
            if (mappingMode === "threshold") {
                expr =
'var ctrl = comp("' + compNameEsc + '").layer("' + controllerNameEsc + '").effect("' + dropdownNameEsc + '")("Menu");\n' +
'ctrl >= ' + checkValue + ' ? 100 : 0;';
            } else {
                expr =
'var ctrl = comp("' + compNameEsc + '").layer("' + controllerNameEsc + '").effect("' + dropdownNameEsc + '")("Menu");\n' +
'ctrl == ' + checkValue + ' ? 100 : 0;';
            }

            var opacityProp = layer.property("ADBE Transform Group").property("ADBE Opacity");
            opacityProp.expression = expr;
            linked.push({
                layer: buildLayerSummary(layer),
                menuValue: checkValue
            });
        }

        return JSON.stringify({
            status: "success",
            message: "Opacity linked to dropdown successfully",
            composition: buildCompSummary(comp),
            controller: {
                name: controllerLayer.name,
                index: controllerLayer.index,
                dropdownName: dropdownName
            },
            changed: ["expression"],
            mappingMode: mappingMode,
            linkedLayers: linked
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
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

function createBridgeUI(thisObj) {
    var useDockablePanel = (thisObj instanceof Panel) && !isAE2025OrLater;
    var bridgePanel = useDockablePanel
        ? thisObj
        : new Window("palette", "MCP Bridge Auto", undefined, { resizeable: true });

    if (!bridgePanel) {
        throw new Error("Failed to create MCP Bridge UI.");
    }

    bridgePanel.orientation = "column";
    bridgePanel.alignChildren = ["fill", "top"];
    bridgePanel.spacing = 10;
    bridgePanel.margins = 16;
    bridgePanel.preferredSize = [620, 420];
    bridgePanel.minimumSize = [520, 320];

    // Status display
    statusText = bridgePanel.add("statictext", undefined, "Waiting for commands...");
    statusText.alignment = ["fill", "top"];

    // Add log area
    var logPanel = bridgePanel.add("panel", undefined, "Command Log");
    logPanel.orientation = "column";
    logPanel.alignChildren = ["fill", "fill"];
    logPanel.preferredSize.width = 580;
    logText = logPanel.add("edittext", undefined, "", {multiline: true, readonly: true});
    logText.preferredSize = [580, 260];

    if (isAE2025OrLater) {
        var warning = bridgePanel.add("statictext", undefined, "AE 2025+: Dockable panels are not supported. Floating window only.");
        warning.graphics.foregroundColor = warning.graphics.newPen(warning.graphics.PenType.SOLID_COLOR, [1, 0.3, 0, 1], 1);
    } else if (useDockablePanel) {
        bridgePanel.add("statictext", undefined, "Dockable panel mode enabled.");
    }

    autoRunCheckbox = bridgePanel.add("checkbox", undefined, "Auto-run commands");
    autoRunCheckbox.value = true;
    autoRunCheckbox.onClick = function() {
        setStatusText("Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF"));
        logToPanel("Auto-run " + (autoRunCheckbox.value ? "enabled" : "disabled"));
    };

    var checkButton = bridgePanel.add("button", undefined, "Check for Commands Now");
    checkButton.onClick = function() {
        logToPanel("Manually checking for commands");
        checkForCommands();
    };

    bridgePanel.onResizing = bridgePanel.onResize = function() {
        this.layout.resize();
    };

    bridgePanel.layout.layout(true);
    return bridgePanel;
}

var panel = null;
var statusText = null;
var logText = null;
var autoRunCheckbox = null;
var maxPanelLogLines = 120;
var panelLogLines = [];
var currentCommandContext = {
    command: null,
    commandId: null
};

function appendBridgeLogEntry(phase, status, message, extra) {
    try {
        var file = new File(getBridgeLogFilePath());
        file.encoding = "UTF-8";
        var opened = file.exists ? file.open("e") : file.open("w");
        if (!opened) {
            return;
        }
        file.seek(0, 2);
        var entry = {
            timestamp: getIsoTimestamp(),
            phase: phase,
            status: status,
            message: message,
            command: currentCommandContext.command,
            commandId: currentCommandContext.commandId
        };
        if (extra) {
            entry.meta = extra;
        }
        file.write(JSON.stringify(entry) + "\n");
        file.close();
    } catch (e) {}
}

function setStatusText(message) {
    if (statusText && statusText.text !== message) {
        statusText.text = message;
    }
}

function installNonBlockingDialogOverrides() {
    var defaultConfirmValue = true;

    alert = function(message) {
        var text = message === undefined || message === null ? "" : String(message);
        appendBridgeLogEntry("dialog", "info", "Suppressed native alert dialog.", { message: text });
        logToPanel("Suppressed alert dialog: " + text);
    };

    confirm = function(message) {
        var text = message === undefined || message === null ? "" : String(message);
        appendBridgeLogEntry("dialog", "info", "Suppressed native confirm dialog.", {
            message: text,
            defaultValue: defaultConfirmValue
        });
        logToPanel("Suppressed confirm dialog: " + text + " -> returning " + defaultConfirmValue);
        return defaultConfirmValue;
    };
}

panel = createBridgeUI(this);
installNonBlockingDialogOverrides();

// Check interval (ms)
var checkInterval = 2000;
var isChecking = false;

// Command file path - use Documents folder for reliable access
function getCommandFilePath() {
    return getBridgeFolderPath() + "/ae_command.json";
}

// Result file path - use Documents folder for reliable access
function getResultFilePath() {
    return getBridgeFolderPath() + "/ae_mcp_result.json";
}

function getProjectItems(args) {
    try {
        args = args || {};
        var itemType = args.itemType || null;
        var nameContains = hasValue(args.nameContains) ? String(args.nameContains) : null;
        var includeCompDetails = args.includeCompDetails !== false;
        var items = [];

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            var summary = buildProjectItemSummary(item);
            if (itemType && summary.type !== itemType) {
                continue;
            }
            if (nameContains && summary.name.toLowerCase().indexOf(nameContains.toLowerCase()) === -1) {
                continue;
            }
            if (!includeCompDetails && summary.type === "Composition") {
                delete summary.width;
                delete summary.height;
                delete summary.duration;
                delete summary.frameRate;
                delete summary.numLayers;
            }
            items.push(summary);
        }

        return JSON.stringify({
            status: "success",
            message: "Project items retrieved successfully",
            itemType: itemType,
            nameContains: nameContains,
            count: items.length,
            items: items
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function findProjectItem(args) {
    try {
        args = args || {};
        var itemId = hasValue(args.itemId) ? parseInt(args.itemId, 10) : null;
        var exactName = hasValue(args.exactName) ? String(args.exactName) : null;
        var itemType = args.itemType || null;
        var matches = [];

        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            var summary = buildProjectItemSummary(item);
            if (itemType && summary.type !== itemType) {
                continue;
            }
            if (itemId !== null && summary.id !== itemId) {
                continue;
            }
            if (exactName && summary.name !== exactName) {
                continue;
            }
            matches.push(summary);
        }

        if (itemId !== null && !matches.length) {
            throw new Error("Project item not found for id " + itemId);
        }
        if (exactName && !matches.length) {
            throw new Error("Project item not found for name '" + exactName + "'");
        }
        if (itemId === null && !exactName) {
            throw new Error("Provide itemId or exactName");
        }

        return JSON.stringify({
            status: "success",
            message: "Project item lookup completed",
            itemId: itemId,
            exactName: exactName,
            itemType: itemType,
            matchCount: matches.length,
            resolved: matches.length === 1 ? matches[0] : null,
            matches: matches
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setActiveComp(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        activateComposition(comp);
        return JSON.stringify({
            status: "success",
            message: "Composition activated successfully",
            composition: buildCompSummary(comp)
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function clearLayerSelection(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        activateComposition(comp);
        var cleared = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.selected) {
                cleared.push(buildLayerSummary(layer));
            }
            layer.selected = false;
        }
        return JSON.stringify({
            status: "success",
            message: "Layer selection cleared successfully",
            composition: buildCompSummary(comp),
            clearedCount: cleared.length,
            clearedLayers: cleared
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function selectLayers(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        activateComposition(comp);
        var replaceSelection = args.replaceSelection !== false;
        var resolved = [];
        var seen = {};

        if (replaceSelection) {
            for (var i = 1; i <= comp.numLayers; i++) {
                comp.layer(i).selected = false;
            }
        }

        var indexedLayers = resolveLayersByIndexes(comp, args.layerIndexes || []);
        for (var ix = 0; ix < indexedLayers.length; ix++) {
            var indexedLayer = indexedLayers[ix];
            if (!seen[indexedLayer.index]) {
                resolved.push(indexedLayer);
                seen[indexedLayer.index] = true;
            }
        }

        var namedLayers = args.layerNames && args.layerNames.length
            ? resolveMultipleLayersInComp(comp, { layerNames: args.layerNames })
            : [];
        for (var nx = 0; nx < namedLayers.length; nx++) {
            var namedLayer = namedLayers[nx];
            if (!seen[namedLayer.index]) {
                resolved.push(namedLayer);
                seen[namedLayer.index] = true;
            }
        }

        if (!resolved.length) {
            throw new Error("No layers resolved for selection");
        }

        for (var s = 0; s < resolved.length; s++) {
            resolved[s].selected = true;
        }

        return JSON.stringify({
            status: "success",
            message: "Layers selected successfully",
            composition: buildCompSummary(comp),
            replaceSelection: replaceSelection,
            selectedCount: resolved.length,
            selectedLayers: buildLayerListSummary(resolved)
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function getLayerDetails(args) {
    try {
        args = args || {};
        var comp = resolveComposition(args);
        var layer = resolveSingleLayerInComp(comp, args);
        return JSON.stringify({
            status: "success",
            message: "Layer details retrieved successfully",
            composition: buildCompSummary(comp),
            layer: buildLayerDetails(layer)
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function getSelectedPropertiesForComp(comp) {
    var activeComp = getActiveComp();
    if (!activeComp || !comp || activeComp.id !== comp.id) {
        return [];
    }
    return activeComp.selectedProperties || [];
}

function getPropertyPath(prop) {
    if (!prop) {
        return "";
    }
    var parts = [];
    var current = prop;
    var guard = 0;
    while (current && guard < 64) {
        try {
            parts.push(current.name || current.matchName || "Property");
        } catch (e) {
            parts.push("Property");
        }
        try {
            current = current.parentProperty;
        } catch (parentError) {
            current = null;
        }
        guard++;
    }
    parts.reverse();
    return parts.join(" > ");
}

function getPropertyValueTypeLabel(prop) {
    if (!prop) {
        return null;
    }
    try {
        return String(prop.propertyValueType);
    } catch (e) {
        return null;
    }
}

function extractPathProperty(prop) {
    if (!prop) {
        return null;
    }
    try {
        if (prop.matchName === "ADBE Vector Shape" || prop.matchName === "ADBE Mask Shape") {
            return prop;
        }
    } catch (directError) {}

    try {
        var pathProp = prop.property("Path");
        if (pathProp && pathProp.matchName === "ADBE Vector Shape") {
            return pathProp;
        }
    } catch (pathError) {}

    return null;
}

function buildPropertySummary(prop) {
    if (!prop) {
        return null;
    }

    var summary = {
        name: null,
        matchName: null,
        path: getPropertyPath(prop),
        canVaryOverTime: false,
        canSetExpression: false,
        numKeys: 0,
        valueType: null,
        isPath: false
    };

    try { summary.name = prop.name || null; } catch (nameError) {}
    try { summary.matchName = prop.matchName || null; } catch (matchError) {}
    try { summary.canVaryOverTime = prop.canVaryOverTime === true; } catch (varyError) {}
    try { summary.canSetExpression = prop.canSetExpression === true; } catch (exprError) {}
    try { summary.numKeys = prop.numKeys || 0; } catch (keyError) {}
    summary.valueType = getPropertyValueTypeLabel(prop);
    summary.isPath = extractPathProperty(prop) !== null;

    var owner = getPropertyOwningLayer(prop);
    if (owner) {
        summary.layer = buildLayerSummary(owner);
    }

    return summary;
}

function buildSelectedPropertySummaries(comp) {
    var selectedProps = getSelectedPropertiesForComp(comp);
    var summaries = [];
    var seen = {};

    for (var i = 0; i < selectedProps.length; i++) {
        var summary = buildPropertySummary(selectedProps[i]);
        if (!summary) {
            continue;
        }
        var key = summary.path || (summary.name + "::" + i);
        if (!seen[key]) {
            summaries.push(summary);
            seen[key] = true;
        }
    }

    return summaries;
}

function buildSelectedPathSummaries(comp) {
    var selectedProps = getSelectedPropertiesForComp(comp);
    var summaries = [];
    var seen = {};

    for (var i = 0; i < selectedProps.length; i++) {
        var pathProp = extractPathProperty(selectedProps[i]);
        if (!pathProp) {
            continue;
        }
        var summary = buildPropertySummary(pathProp);
        if (!summary) {
            continue;
        }
        var key = summary.path || (summary.name + "::" + i);
        if (!seen[key]) {
            summaries.push(summary);
            seen[key] = true;
        }
    }

    return summaries;
}

function buildLayerContextSummary(layer) {
    if (!layer) {
        return null;
    }

    return {
        index: layer.index,
        name: layer.name,
        type: getLayerType(layer),
        selected: layer.selected === true,
        enabled: layer.enabled,
        locked: layer.locked,
        shy: layer.shy,
        solo: layer.solo,
        parent: layer.parent ? buildLayerSummary(layer.parent) : null,
        inPoint: layer.inPoint,
        outPoint: layer.outPoint,
        startTime: layer.startTime
    };
}

function buildLayerMapForComp(comp, maxLayers) {
    if (!comp) {
        return null;
    }

    var limit = hasValue(maxLayers) ? parseInt(maxLayers, 10) : 25;
    if (isNaN(limit) || limit < 1) {
        limit = 25;
    }

    var layers = [];
    var count = Math.min(comp.numLayers, limit);
    for (var i = 1; i <= count; i++) {
        layers.push(buildLayerContextSummary(comp.layer(i)));
    }

    return {
        composition: buildCompSummary(comp),
        totalLayers: comp.numLayers,
        includedLayers: layers.length,
        truncated: comp.numLayers > layers.length,
        layers: layers
    };
}

function buildNamedLayerBuckets(comp, maxNamedItems) {
    var buckets = {
        nulls: [],
        textLayers: [],
        controllers: [],
        adjustmentLayers: [],
        shapeLayers: []
    };

    if (!comp) {
        return buckets;
    }

    var limit = hasValue(maxNamedItems) ? parseInt(maxNamedItems, 10) : 12;
    if (isNaN(limit) || limit < 1) {
        limit = 12;
    }

    function pushLimited(bucketName, layer) {
        if (buckets[bucketName].length >= limit) {
            return;
        }
        buckets[bucketName].push(buildLayerContextSummary(layer));
    }

    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        var upperName = String(layer.name || "").toUpperCase();
        var layerType = getLayerType(layer);

        if (layer.nullLayer === true || layerType === "null") {
            pushLimited("nulls", layer);
        }
        if (layerType === "text") {
            pushLimited("textLayers", layer);
        }
        if (layer.adjustmentLayer === true || layerType === "adjustment") {
            pushLimited("adjustmentLayers", layer);
        }
        if (layerType === "shape") {
            pushLimited("shapeLayers", layer);
        }
        if (
            upperName.indexOf("CTRL") !== -1 ||
            upperName.indexOf("CONTROL") !== -1 ||
            upperName.indexOf("CONTROLLER") !== -1
        ) {
            pushLimited("controllers", layer);
        }
    }

    return buckets;
}

function listCompositionSummaries(limit) {
    var summaries = [];
    var maxCount = hasValue(limit) ? parseInt(limit, 10) : 100;
    if (isNaN(maxCount) || maxCount < 1) {
        maxCount = 100;
    }

    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem) {
            summaries.push(buildCompSummary(item));
            if (summaries.length >= maxCount) {
                break;
            }
        }
    }

    return summaries;
}

function classifyResolutionMessage(message) {
    var text = String(message || "");
    return {
        message: text,
        isAmbiguous: text.toLowerCase().indexOf("ambiguous") !== -1,
        requiresDisambiguation: text.toLowerCase().indexOf("ambiguous") !== -1,
        isMissingContext: text.toLowerCase().indexOf("no active composition") !== -1 ||
            text.toLowerCase().indexOf("no selected") !== -1 ||
            text.toLowerCase().indexOf("no target") !== -1
    };
}

function resolveLayerCollectionForContext(comp, args) {
    var resolved = [];
    var seen = {};
    var indexedLayers = resolveLayersByIndexes(comp, args.layerIndexes || []);
    var namedLayers = [];

    if (args.layerNames && args.layerNames.length) {
        namedLayers = resolveMultipleLayersInComp(comp, { layerNames: args.layerNames });
    } else if (args.useSelectedLayers === true) {
        namedLayers = resolveMultipleLayersInComp(comp, { useSelectedLayers: true });
    } else if (args.targetLayers && args.targetLayers.mode === "selected") {
        namedLayers = resolveMultipleLayersInComp(comp, { targetLayers: { mode: "selected" } });
    } else if (args.targetLayers && args.targetLayers.mode === "names") {
        namedLayers = resolveMultipleLayersInComp(comp, { targetLayers: args.targetLayers });
    }

    for (var i = 0; i < indexedLayers.length; i++) {
        if (!seen[indexedLayers[i].index]) {
            resolved.push(indexedLayers[i]);
            seen[indexedLayers[i].index] = true;
        }
    }

    for (var j = 0; j < namedLayers.length; j++) {
        if (!seen[namedLayers[j].index]) {
            resolved.push(namedLayers[j]);
            seen[namedLayers[j].index] = true;
        }
    }

    return resolved;
}

function resolveTargetsCore(args) {
    args = args || {};
    var assumptions = [];
    var ambiguities = [];
    var warnings = [];
    var resolvedTargets = {};
    var needsUserDisambiguation = false;
    var comp = null;

    try {
        comp = resolveComposition(args);
        resolvedTargets.composition = buildCompSummary(comp);

        if (!hasValue(args.compName) && !hasValue(args.compIndex) && !(args.targetComp && args.targetComp.mode)) {
            assumptions.push("Used active composition as the target composition");
        }
    } catch (compError) {
        var compIssue = classifyResolutionMessage(compError.toString());
        ambiguities.push({
            kind: "composition",
            message: compIssue.message,
            requiresDisambiguation: compIssue.requiresDisambiguation
        });
        needsUserDisambiguation = needsUserDisambiguation || compIssue.requiresDisambiguation;
    }

    if (comp) {
        var wantsSingleLayer = hasValue(args.layerIndex) || hasValue(args.layerName) ||
            args.useSelectedLayer === true || (args.targetLayer && args.targetLayer.mode) ||
            (args.targetLayers && args.targetLayers.mode === "selected") ||
            (args.targetLayers && args.targetLayers.mode === "names" && args.targetLayers.names && args.targetLayers.names.length === 1);

        if (wantsSingleLayer) {
            try {
                resolvedTargets.layer = buildLayerSummary(resolveSingleLayerInComp(comp, args));
            } catch (layerError) {
                var layerIssue = classifyResolutionMessage(layerError.toString());
                ambiguities.push({
                    kind: "layer",
                    message: layerIssue.message,
                    requiresDisambiguation: layerIssue.requiresDisambiguation
                });
                needsUserDisambiguation = needsUserDisambiguation || layerIssue.requiresDisambiguation;
            }
        }

        var wantsLayerCollection = (args.layerIndexes && args.layerIndexes.length) ||
            (args.layerNames && args.layerNames.length) ||
            args.useSelectedLayers === true ||
            (args.targetLayers && args.targetLayers.mode);

        if (wantsLayerCollection) {
            try {
                resolvedTargets.layers = buildLayerListSummary(resolveLayerCollectionForContext(comp, args));
            } catch (layersError) {
                var layersIssue = classifyResolutionMessage(layersError.toString());
                ambiguities.push({
                    kind: "layers",
                    message: layersIssue.message,
                    requiresDisambiguation: layersIssue.requiresDisambiguation
                });
                needsUserDisambiguation = needsUserDisambiguation || layersIssue.requiresDisambiguation;
            }
        }

        var selectedProperties = buildSelectedPropertySummaries(comp);
        if (selectedProperties.length) {
            resolvedTargets.selectedProperties = selectedProperties;
        }

        var selectedPaths = buildSelectedPathSummaries(comp);
        if (selectedPaths.length) {
            resolvedTargets.selectedPaths = selectedPaths;
        }
    } else {
        warnings.push("Skipping layer and property resolution because composition resolution failed");
    }

    return {
        resolvedTargets: resolvedTargets,
        assumptions: assumptions,
        ambiguities: ambiguities,
        warnings: warnings,
        needsUserDisambiguation: needsUserDisambiguation
    };
}

function resolveTargetsCommand(args) {
    try {
        var resolution = resolveTargetsCore(args);
        return JSON.stringify({
            status: "success",
            message: resolution.needsUserDisambiguation ? "Target resolution needs disambiguation" : "Targets resolved successfully",
            resolvedTargets: resolution.resolvedTargets,
            assumptions: resolution.assumptions,
            ambiguities: resolution.ambiguities,
            warnings: resolution.warnings,
            needsUserDisambiguation: resolution.needsUserDisambiguation
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function getContextPack(args) {
    try {
        args = args || {};
        var activeComp = getActiveComp();
        var activeCompSummary = buildCompSummary(activeComp);
        var resolution = resolveTargetsCore(args);
        var targetComp = resolution.resolvedTargets.composition ? resolveComposition(args) : activeComp;
        var includeLayerMap = args.includeLayerMap !== false;
        var includeNamedItems = args.includeNamedItems !== false;
        var layerMap = includeLayerMap && targetComp ? buildLayerMapForComp(targetComp, args.maxLayers) : null;
        var namedItems = includeNamedItems && targetComp ? buildNamedLayerBuckets(targetComp, args.maxNamedItems) : null;

        return JSON.stringify({
            status: "success",
            message: "Context pack generated successfully",
            contextId: "ctx-" + new Date().getTime(),
            activeComp: activeCompSummary,
            compositionSummaries: listCompositionSummaries(args.maxComps),
            selectedLayers: activeComp ? buildLayerListSummary(getSelectedLayersForComp(activeComp)) : [],
            selectedProperties: activeComp ? buildSelectedPropertySummaries(activeComp) : [],
            selectedPaths: activeComp ? buildSelectedPathSummaries(activeComp) : [],
            resolvedTargets: resolution.resolvedTargets,
            assumptions: resolution.assumptions,
            ambiguities: resolution.ambiguities,
            warnings: resolution.warnings,
            needsUserDisambiguation: resolution.needsUserDisambiguation,
            layerMap: layerMap,
            namedItems: namedItems
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function getCapabilityCatalogFolder() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    var catalogFolder = new Folder(bridgeFolder.fsName + "/catalogs");
    if (!catalogFolder.exists) {
        catalogFolder.create();
    }
    return catalogFolder;
}

function getCapabilityCatalogFile(versionLabel, aeVersion) {
    var safeAeVersion = String(aeVersion || "unknown").replace(/[^\w.-]+/g, "_");
    return new File(getCapabilityCatalogFolder().fsName + "/ae-capability-catalog-v" + versionLabel + "-" + safeAeVersion + ".json");
}

function readJsonFileSafe(file) {
    if (!file || !file.exists) {
        return null;
    }
    try {
        if (!file.open("r")) {
            return null;
        }
        var content = file.read();
        file.close();
        if (!content) {
            return null;
        }
        return JSON.parse(content);
    } catch (e) {
        try { file.close(); } catch (closeError) {}
        return null;
    }
}

function writeJsonFileSafe(file, value) {
    if (!file) {
        throw new Error("Capability catalog file is required");
    }
    var json = JSON.stringify(value, null, 2);
    if (!file.open("w")) {
        throw new Error("Failed to open capability catalog file for writing");
    }
    file.write(json);
    file.close();
}

function createCatalogNode(kind, name, matchName, path) {
    return {
        kind: kind,
        name: name || null,
        matchName: matchName || null,
        path: path || "",
        children: []
    };
}

function safePropertyValueType(prop) {
    try {
        return String(prop.propertyValueType);
    } catch (e) {
        return null;
    }
}

function walkPropertyTree(prop, pathPrefix, depth, maxDepth, maxChildren, compatibilityWarnings) {
    if (!prop) {
        return null;
    }

    var name = null;
    var matchName = null;
    var path = "";
    try { name = prop.name || null; } catch (nameError) {}
    try { matchName = prop.matchName || null; } catch (matchError) {}
    path = pathPrefix ? (pathPrefix + " > " + (name || matchName || "Property")) : (name || matchName || "Property");

    var childCount = 0;
    try {
        childCount = prop.numProperties || 0;
    } catch (childCountError) {
        childCount = 0;
    }

    var node = createCatalogNode(childCount > 0 ? "group" : "property", name, matchName, path);
    node.depth = depth;
    node.propertyValueType = safePropertyValueType(prop);

    try { node.canVaryOverTime = prop.canVaryOverTime === true; } catch (varyError) {}
    try { node.canSetExpression = prop.canSetExpression === true; } catch (exprError) {}
    try { node.propertyType = String(prop.propertyType); } catch (propTypeError) {}

    if (depth >= maxDepth) {
        if (childCount > 0) {
            node.truncated = true;
            compatibilityWarnings.push("Property traversal reached max depth at: " + path);
        }
        return node;
    }

    if (childCount > maxChildren) {
        node.truncated = true;
        node.childCount = childCount;
        compatibilityWarnings.push("Property traversal exceeded max child count at: " + path);
        childCount = maxChildren;
    }

    for (var i = 1; i <= childCount; i++) {
        var child = null;
        try {
            child = prop.property(i);
        } catch (childError) {
            child = null;
        }
        if (!child) {
            continue;
        }
        var childNode = walkPropertyTree(child, path, depth + 1, maxDepth, maxChildren, compatibilityWarnings);
        if (childNode) {
            node.children.push(childNode);
        }
    }

    return node;
}

function collectTopLevelPropertyGroups(layer) {
    var groups = [];
    if (!layer) {
        return groups;
    }
    var count = 0;
    try {
        count = layer.numProperties || 0;
    } catch (e) {
        count = 0;
    }
    for (var i = 1; i <= count; i++) {
        try {
            var prop = layer.property(i);
            groups.push({
                name: prop.name || null,
                matchName: prop.matchName || null,
                propertyType: String(prop.propertyType)
            });
        } catch (propError) {}
    }
    return groups;
}

function createCapabilityDiscoveryComp() {
    return app.project.items.addComp("__ae_mcp_capability_catalog__", 1920, 1080, 1, 5, 30);
}

function createDiscoveryLayers(comp, compatibilityWarnings) {
    var layers = [];

    function addLayer(label, fn) {
        try {
            var layer = fn();
            if (layer) {
                layers.push({
                    kind: label,
                    layer: layer
                });
            }
        } catch (e) {
            compatibilityWarnings.push("Layer discovery failed for " + label + ": " + e.toString());
        }
    }

    addLayer("solid", function() {
        return comp.layers.addSolid([1, 1, 1], "__ae_mcp_solid__", comp.width, comp.height, 1);
    });

    addLayer("text", function() {
        var textLayer = comp.layers.addText("AE MCP");
        return textLayer;
    });

    addLayer("shape", function() {
        var shapeLayer = comp.layers.addShape();
        var root = shapeLayer.property("ADBE Root Vectors Group");
        if (root) {
            root.addProperty("ADBE Vector Group");
        }
        return shapeLayer;
    });

    addLayer("null", function() {
        return comp.layers.addNull();
    });

    addLayer("camera", function() {
        return comp.layers.addCamera("__ae_mcp_camera__", [comp.width / 2, comp.height / 2]);
    });

    addLayer("light", function() {
        return comp.layers.addLight("__ae_mcp_light__", [comp.width / 2, comp.height / 2]);
    });

    addLayer("adjustment", function() {
        var adjustment = comp.layers.addSolid([0, 0, 0], "__ae_mcp_adjustment__", comp.width, comp.height, 1);
        adjustment.adjustmentLayer = true;
        return adjustment;
    });

    return layers;
}

function buildLayerTypeCatalog(layerKind, layer, args, compatibilityWarnings) {
    var maxDepth = hasValue(args.maxDepth) ? parseInt(args.maxDepth, 10) : 6;
    var maxChildren = hasValue(args.maxChildren) ? parseInt(args.maxChildren, 10) : 80;
    if (isNaN(maxDepth) || maxDepth < 1) {
        maxDepth = 6;
    }
    if (isNaN(maxChildren) || maxChildren < 1) {
        maxChildren = 80;
    }

    return {
        kind: layerKind,
        topLevelGroups: collectTopLevelPropertyGroups(layer),
        propertyTree: walkPropertyTree(layer, "", 0, maxDepth, maxChildren, compatibilityWarnings)
    };
}

function buildEffectCatalog(args, compatibilityWarnings) {
    var effects = [];
    var appEffects = null;

    try {
        appEffects = app.effects;
    } catch (effectsError) {
        compatibilityWarnings.push("app.effects is not available: " + effectsError.toString());
        return effects;
    }

    if (!appEffects || typeof appEffects.length !== "number") {
        compatibilityWarnings.push("app.effects is unavailable or not array-like in this AE host");
        return effects;
    }

    var maxEffects = hasValue(args.maxEffects) ? parseInt(args.maxEffects, 10) : 250;
    if (isNaN(maxEffects) || maxEffects < 1) {
        maxEffects = 250;
    }

    var count = Math.min(appEffects.length, maxEffects);
    for (var i = 0; i < count; i++) {
        try {
            var effect = appEffects[i];
            if (!effect) {
                continue;
            }
            effects.push({
                name: effect.displayName || effect.name || null,
                matchName: effect.matchName || null,
                category: effect.category || null
            });
        } catch (effectItemError) {
            compatibilityWarnings.push("Effect enumeration item failed at index " + i + ": " + effectItemError.toString());
        }
    }

    if (appEffects.length > maxEffects) {
        compatibilityWarnings.push("Effect catalog truncated at " + maxEffects + " items");
    }

    return effects;
}

function buildFontSources(compatibilityWarnings) {
    var result = {
        source: "none",
        fonts: []
    };

    if ($.os.toLowerCase().indexOf("windows") === -1) {
        compatibilityWarnings.push("OS font fallback currently only implemented for Windows hosts");
        return result;
    }

    var command = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Reflection.Assembly]::LoadWithPartialName(' +
        "''System.Drawing'')" +
        ' | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"';

    try {
        var output = system.callSystem(command);
        if (!output) {
            compatibilityWarnings.push("Windows font enumeration returned no output");
            return result;
        }
        var lines = output.split(/\r?\n/);
        var seen = {};
        for (var i = 0; i < lines.length; i++) {
            var name = lines[i];
            if (!name) {
                continue;
            }
            name = String(name).replace(/^\s+|\s+$/g, "");
            if (!name || seen[name]) {
                continue;
            }
            seen[name] = true;
            result.fonts.push({ familyName: name });
        }
        result.source = "windows-system-callsystem";
    } catch (fontError) {
        compatibilityWarnings.push("Windows font enumeration failed: " + fontError.toString());
    }

    return result;
}

function buildCapabilityCatalog(args) {
    var compatibilityWarnings = [];
    var layerTypes = [];
    var effectCatalog = [];
    var fontSources = { source: "none", fonts: [] };
    var propertyGroups = [];
    var versionLabel = "1";
    var discoveryComp = null;
    var generatedAt = getIsoTimestamp();
    var aeVersion = app.version || "unknown";

    try {
        app.beginUndoGroup("AE MCP Capability Catalog");
        discoveryComp = createCapabilityDiscoveryComp();
        var discoveredLayers = createDiscoveryLayers(discoveryComp, compatibilityWarnings);

        for (var i = 0; i < discoveredLayers.length; i++) {
            var entry = buildLayerTypeCatalog(discoveredLayers[i].kind, discoveredLayers[i].layer, args, compatibilityWarnings);
            layerTypes.push(entry);

            for (var g = 0; g < entry.topLevelGroups.length; g++) {
                var group = entry.topLevelGroups[g];
                var exists = false;
                for (var pg = 0; pg < propertyGroups.length; pg++) {
                    if (propertyGroups[pg].matchName === group.matchName && propertyGroups[pg].name === group.name) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    propertyGroups.push(group);
                }
            }
        }

        effectCatalog = buildEffectCatalog(args, compatibilityWarnings);
        fontSources = buildFontSources(compatibilityWarnings);
    } finally {
        try {
            if (discoveryComp) {
                discoveryComp.remove();
            }
        } catch (cleanupError) {
            compatibilityWarnings.push("Discovery comp cleanup failed: " + cleanupError.toString());
        }
        try {
            app.endUndoGroup();
        } catch (undoError) {}
    }

    return {
        catalogVersion: versionLabel,
        aeVersion: aeVersion,
        generatedAt: generatedAt,
        generationMode: "on-demand",
        layerTypes: layerTypes,
        propertyGroups: propertyGroups,
        effectCatalog: effectCatalog,
        fontSources: fontSources,
        compatibilityWarnings: compatibilityWarnings
    };
}

function getCapabilityCatalog(args) {
    try {
        args = args || {};
        var versionLabel = "1";
        var aeVersion = app.version || "unknown";
        var cacheFile = getCapabilityCatalogFile(versionLabel, aeVersion);
        var forceRefresh = args.forceRefresh === true;
        var cachedCatalog = forceRefresh ? null : readJsonFileSafe(cacheFile);

        if (cachedCatalog && cachedCatalog.catalogVersion === versionLabel && cachedCatalog.aeVersion === aeVersion) {
            return JSON.stringify({
                status: "success",
                message: "Capability catalog loaded from cache",
                cached: true,
                cachePath: cacheFile.fsName,
                catalog: cachedCatalog
            }, null, 2);
        }

        var catalog = buildCapabilityCatalog(args);
        writeJsonFileSafe(cacheFile, catalog);

        return JSON.stringify({
            status: "success",
            message: "Capability catalog generated successfully",
            cached: false,
            cachePath: cacheFile.fsName,
            catalog: catalog
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// --- setCompositionProperties: set duration, frameRate, etc. on active or named comp ---
function setCompositionProperties(args) {
    try {
        var comp = resolveComposition(args);
        var changed = [];
        if (args.duration !== undefined && args.duration !== null) { comp.duration = args.duration; changed.push("duration"); }
        if (args.frameRate !== undefined && args.frameRate !== null) { comp.frameRate = args.frameRate; changed.push("frameRate"); }
        if (args.width !== undefined && args.width !== null && args.height !== undefined && args.height !== null) {
            comp.width = args.width; comp.height = args.height; changed.push("dimensions");
        }
        return JSON.stringify({
            status: "success",
            composition: buildCompSummary(comp),
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
        isSaved: !!project.file,
        revision: project.revision,
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
function executeCommand(command, args, commandData) {
    var result = "";
    currentCommandContext.command = command;
    currentCommandContext.commandId = commandData && commandData.commandId ? commandData.commandId : (args && args.commandId ? args.commandId : null);

    logToPanel("Executing command: " + command);
    appendBridgeLogEntry("execute", "info", "Executing bridge command.", {
        args: args || {}
    });
    setStatusText("Running: " + command);

    try {
        logToPanel("Attempting to execute: " + command); // Log before switch
        // Use a switch statement for clarity
        switch (command) {
            case "getProjectItems":
                result = getProjectItems(args);
                break;
            case "findProjectItem":
                result = findProjectItem(args);
                break;
            case "setActiveComp":
                result = setActiveComp(args);
                break;
            case "clearLayerSelection":
                result = clearLayerSelection(args);
                break;
            case "selectLayers":
                result = selectLayers(args);
                break;
            case "getLayerDetails":
                result = getLayerDetails(args);
                break;
            case "getContextPack":
                result = getContextPack(args);
                break;
            case "resolveTargets":
                result = resolveTargetsCommand(args);
                break;
            case "getCapabilityCatalog":
                result = getCapabilityCatalog(args);
                break;
            case "preflightMutation":
                result = preflightMutation(args);
                break;
            case "prepareProjectCheckpoint":
                result = prepareProjectCheckpoint(args);
                break;
            case "restoreCheckpoint":
                result = restoreCheckpoint(args);
                break;
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
            case "createBackgroundSolid":
                logToPanel("Calling createBackgroundSolid function...");
                result = createBackgroundSolid(args);
                logToPanel("Returned from createBackgroundSolid.");
                break;
            case "animateTextEntry":
                logToPanel("Calling animateTextEntry function...");
                result = animateTextEntry(args);
                logToPanel("Returned from animateTextEntry.");
                break;
            case "setLayerProperties":
                logToPanel("Calling setLayerProperties function...");
                result = setLayerProperties(args);
                logToPanel("Returned from setLayerProperties.");
                break;
            case "setLayerKeyframe":
                logToPanel("Calling setLayerKeyframe function...");
                result = setLayerKeyframe(args);
                logToPanel("Returned from setLayerKeyframe.");
                break;
            case "setLayerExpression":
                logToPanel("Calling setLayerExpression function...");
                result = setLayerExpression(args);
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
            case "enableMotionBlur":
                logToPanel("Calling enableMotionBlur function...");
                result = enableMotionBlur(args);
                logToPanel("Returned from enableMotionBlur.");
                break;
            case "sequenceLayerPosition":
                logToPanel("Calling sequenceLayerPosition function...");
                result = sequenceLayerPosition(args);
                logToPanel("Returned from sequenceLayerPosition.");
                break;
            case "copyPathsToMasks":
                logToPanel("Calling copyPathsToMasks function...");
                result = copyPathsToMasks(args);
                logToPanel("Returned from copyPathsToMasks.");
                break;
            case "setupTypewriterText":
                logToPanel("Calling setupTypewriterText function...");
                result = setupTypewriterText(args);
                logToPanel("Returned from setupTypewriterText.");
                break;
            case "createTimerRig":
                logToPanel("Calling createTimerRig function...");
                result = createTimerRig(args);
                logToPanel("Returned from createTimerRig.");
                break;
            case "applyBwTint":
                logToPanel("Calling applyBwTint function...");
                result = applyBwTint(args);
                logToPanel("Returned from applyBwTint.");
                break;
            case "cleanupKeyframes":
                logToPanel("Calling cleanupKeyframes function...");
                result = cleanupKeyframes(args);
                logToPanel("Returned from cleanupKeyframes.");
                break;
            case "setupRetimingMode":
                logToPanel("Calling setupRetimingMode function...");
                result = setupRetimingMode(args);
                logToPanel("Returned from setupRetimingMode.");
                break;
            case "createDropdownController":
                logToPanel("Calling createDropdownController function...");
                result = createDropdownController(args);
                logToPanel("Returned from createDropdownController.");
                break;
            case "linkOpacityToDropdown":
                logToPanel("Calling linkOpacityToDropdown function...");
                result = linkOpacityToDropdown(args);
                logToPanel("Returned from linkOpacityToDropdown.");
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
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        logToPanel("Execution finished for: " + command); // Log after switch
        
        // Save the result (ensure result is always a string)
        logToPanel("Preparing to write result file...");
        var resultString = normalizeCommandResult(command, args, commandData, result);
        logToPanel("Normalized result JSON for tracking freshness and command identity.");
        
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
        appendBridgeLogEntry("result", "success", "Bridge command completed successfully.", {
            command: command
        });
        
        logToPanel("Command completed successfully: " + command); // Changed log message
        setStatusText("Command completed: " + command);
        
        // Update command file status
        logToPanel("Updating command status to completed...");
        updateCommandStatus("completed");
        logToPanel("Command status updated.");
        
    } catch (error) {
        var errorMsg = "ERROR in executeCommand for '" + command + "': " + error.toString() + (error.line ? " (line: " + error.line + ")" : "");
        logToPanel(errorMsg); // Log detailed error
        appendBridgeLogEntry("result", "error", errorMsg, {
            line: error.line,
            fileName: error.fileName
        });
        setStatusText("Error: " + error.toString());
        
        // Write detailed error to result file
        try {
            logToPanel("Attempting to write ERROR to result file...");
            var errorResult = normalizeCommandResult(command, args, commandData, { 
                status: "error", 
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
    } finally {
        currentCommandContext.command = null;
        currentCommandContext.commandId = null;
    }
}

// Update command file status
function updateCommandStatus(status) {
    try {
        var commandFilePath = getCommandFilePath();
        var commandFile = new File(commandFilePath);
        if (commandFile.exists) {
            if (!commandFile.open("r")) {
                return false;
            }
            var content = commandFile.read();
            commandFile.close();
            
            if (content) {
                var commandData = JSON.parse(content);
                if (commandData.status === status) {
                    return false;
                }
                commandData.status = status;
                
                var writeFile = new File(commandFilePath);
                writeFile.encoding = "UTF-8";
                if (!writeFile.open("w")) {
                    throw new Error("Failed to open command file for writing.");
                }
                writeFile.write(JSON.stringify(commandData, null, 2));
                writeFile.close();
                return true;
            }
        }
    } catch (e) {
        logToPanel("Error updating command status: " + e.toString());
    }
    return false;
}

// Log message to panel
function logToPanel(message) {
    var timestamp = new Date().toLocaleTimeString();
    panelLogLines.unshift(timestamp + ": " + message);
    if (panelLogLines.length > maxPanelLogLines) {
        panelLogLines.length = maxPanelLogLines;
    }
    if (logText) {
        logText.text = panelLogLines.join("\n");
    }
    appendBridgeLogEntry("panel-log", "info", message, null);
}

function refreshPanelUI() {
    try {
        if (panel && panel.layout) {
            panel.layout.layout(true);
            panel.layout.resize();
        }
    } catch (e) {}
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
                    executeCommand(commandData.command, commandData.args || {}, commandData);
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

// Log startup
logToPanel("MCP Bridge Auto started");
logToPanel("After Effects version: " + app.version);
logToPanel("UI mode: " + ((panel instanceof Panel) ? "dockable panel" : "floating palette"));
logToPanel("Command file: " + getCommandFilePath());
setStatusText("Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF"));

// Start the command checker
startCommandChecker();

// Show the panel
if (panel instanceof Window) {
    panel.center();
    panel.show();
} else {
    panel.layout.layout(true);
    panel.layout.resize();
}

