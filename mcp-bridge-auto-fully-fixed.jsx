// mcp-bridge-auto-fully-fixed.jsx
// Auto-running MCP Bridge panel for After Effects - FULLY COMPATIBLE WITH EXTENDSCRIPT

// =====================================================
// POLYFILLS FOR EXTENDSCRIPT COMPATIBILITY
// =====================================================

// JSON Polyfill
if (typeof JSON === 'undefined') {
    JSON = {};
}

if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function(obj, replacer, space) {
        function stringify(obj, replacer, space, depth) {
            depth = depth || 0;
            var indent = '';
            if (typeof space === 'number') {
                for (var i = 0; i < depth * space; i++) {
                    indent += ' ';
                }
            }
            
            if (obj === null) return 'null';
            if (obj === undefined) return undefined;
            if (typeof obj === 'string') return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
            if (typeof obj === 'number') return isFinite(obj) ? String(obj) : 'null';
            if (typeof obj === 'boolean') return String(obj);
            
            if (obj instanceof Array) {
                var result = '[';
                for (var i = 0; i < obj.length; i++) {
                    if (i > 0) result += ',';
                    if (space) result += '\n' + indent + (typeof space === 'number' ? '  ' : space);
                    var val = stringify(obj[i], replacer, space, depth + 1);
                    result += val === undefined ? 'null' : val;
                }
                if (space && obj.length > 0) result += '\n' + indent;
                result += ']';
                return result;
            }
            
            if (typeof obj === 'object') {
                var result = '{';
                var first = true;
                for (var key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        if (!first) result += ',';
                        if (space) result += '\n' + indent + (typeof space === 'number' ? '  ' : space);
                        result += '"' + key + '":';
                        if (space) result += ' ';
                        var val = stringify(obj[key], replacer, space, depth + 1);
                        if (val !== undefined) {
                            result += val;
                            first = false;
                        }
                    }
                }
                if (space && !first) result += '\n' + indent;
                result += '}';
                return result;
            }
            
            return undefined;
        }
        
        return stringify(obj, replacer, space);
    };
}

if (typeof JSON.parse !== 'function') {
    JSON.parse = function(text) {
        // Enhanced JSON parser for ExtendScript
        text = text.replace(/^\s+|\s+$/g, ''); // trim whitespace
        
        // Basic validation
        if (text === '') throw new Error('JSON Parse Error: Empty string');
        if (text === 'null') return null;
        if (text === 'true') return true;
        if (text === 'false') return false;
        if (text === 'undefined') return undefined;
        
        // Check for basic JSON structure
        if ((text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') ||
            (text.charAt(0) === '[' && text.charAt(text.length - 1) === ']') ||
            (text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') ||
            !isNaN(parseFloat(text))) {
            
            try {
                // Clean up any trailing commas that might cause issues
                text = text.replace(/,(\s*[}\]])/g, '$1');
                return eval('(' + text + ')');
            } catch (e) {
                throw new Error('JSON Parse Error: ' + e.toString());
            }
        } else {
            throw new Error('JSON Parse Error: Invalid JSON format');
        }
    };
}

// Date.toISOString() polyfill
if (!Date.prototype.toISOString) {
    Date.prototype.toISOString = function() {
        function pad(n) {
            return n < 10 ? '0' + n : n;
        }
        return this.getUTCFullYear() + '-' +
               pad(this.getUTCMonth() + 1) + '-' +
               pad(this.getUTCDate()) + 'T' +
               pad(this.getUTCHours()) + ':' +
               pad(this.getUTCMinutes()) + ':' +
               pad(this.getUTCSeconds()) + '.' +
               (this.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) + 'Z';
    };
}

// =====================================================
// END POLYFILLS
// =====================================================

// --- Function Definitions ---

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
            status: "success", 
            message: "Composition created successfully",
            composition: { 
                name: newComp.name, 
                id: newComp.id, 
                width: newComp.width, 
                height: newComp.height, 
                pixelAspect: newComp.pixelAspect, 
                duration: newComp.duration, 
                frameRate: newComp.frameRate, 
                bgColor: newComp.bgColor 
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

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
        
        var textLayer = comp.layers.addText(text);
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        
        if (alignment === "left") { 
            textDocument.justification = ParagraphJustification.LEFT_JUSTIFY; 
        } else if (alignment === "center") { 
            textDocument.justification = ParagraphJustification.CENTER_JUSTIFY; 
        } else if (alignment === "right") { 
            textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY; 
        }
        
        textProp.setValue(textDocument);
        textLayer.property("Position").setValue(position);
        textLayer.startTime = startTime;
        if (duration > 0) { 
            textLayer.outPoint = startTime + duration; 
        }
        
        return JSON.stringify({
            status: "success", 
            message: "Text layer created successfully",
            layer: { 
                name: textLayer.name, 
                index: textLayer.index, 
                type: "text", 
                inPoint: textLayer.inPoint, 
                outPoint: textLayer.outPoint, 
                position: textLayer.property("Position").value 
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function getProjectInfo() {
    try {
        var project = app.project;
        var result = {
            projectName: project.file ? project.file.name : "Untitled Project",
            path: project.file ? project.file.fsName : "",
            numItems: project.numItems,
            bitsPerChannel: project.bitsPerChannel,
            frameRate: project.frameRate,
            duration: project.duration,
            items: []
        };

        // Get item information (limited for performance)
        for (var i = 1; i <= Math.min(project.numItems, 20); i++) {
            var item = project.item(i);
            var itemType = "";
            
            if (item instanceof CompItem) {
                itemType = "Composition";
            } else if (item instanceof FolderItem) {
                itemType = "Folder";
            } else if (item instanceof FootageItem) {
                if (item.mainSource instanceof SolidSource) {
                    itemType = "Solid";
                } else {
                    itemType = "Footage";
                }
            }
            
            result.items.push({
                id: item.id,
                name: item.name,
                type: itemType
            });
        }
        
        return JSON.stringify(result, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function listCompositions() {
    try {
        var project = app.project;
        var result = {
            compositions: []
        };
        
        for (var i = 1; i <= project.numItems; i++) {
            var item = project.item(i);
            
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
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

// =====================================================
// MAIN PANEL CODE
// =====================================================

var panel = new Window("palette", "MCP Bridge Auto FULLY FIXED", undefined);
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
logText.preferredSize.height = 150;

// Auto-run checkbox
var autoRunCheckbox = panel.add("checkbox", undefined, "Auto-run commands");
autoRunCheckbox.value = true;

// Check interval and state
var checkInterval = 2000;
var isChecking = false;

function getCommandFilePath() {
    return "/tmp/ae_command.json";
}

function getResultFilePath() {
    return "/tmp/ae_mcp_result.json";
}

function executeCommand(command, args) {
    var result = "";
    
    logToPanel("Executing command: " + command);
    statusText.text = "Running: " + command;
    panel.update();
    
    try {
        switch (command) {
            case "getProjectInfo":
                result = getProjectInfo();
                break;
            case "listCompositions":
                result = listCompositions();
                break;
            case "createComposition":
                result = createComposition(args);
                break;
            case "createTextLayer":
                result = createTextLayer(args);
                break;
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        
        // Save the result with timestamp
        var resultObj = JSON.parse(result);
        resultObj._responseTimestamp = new Date().toISOString();
        resultObj._commandExecuted = command;
        var resultString = JSON.stringify(resultObj, null, 2);
        
        var resultFile = new File(getResultFilePath());
        resultFile.encoding = "UTF-8";
        if (resultFile.open("w")) {
            resultFile.write(resultString);
            resultFile.close();
        }
        
        logToPanel("Command completed successfully: " + command);
        statusText.text = "Command completed: " + command;
        updateCommandStatus("completed");
        
    } catch (error) {
        var errorMsg = "ERROR: " + error.toString();
        logToPanel(errorMsg);
        statusText.text = "Error: " + error.toString();
        
        try {
            var errorResult = JSON.stringify({ 
                status: "error", 
                command: command,
                message: error.toString()
            });
            var errorFile = new File(getResultFilePath());
            errorFile.encoding = "UTF-8";
            if (errorFile.open("w")) {
                errorFile.write(errorResult);
                errorFile.close();
            }
        } catch (writeError) {
            logToPanel("Failed to write error to result file: " + writeError.toString());
        }
        
        updateCommandStatus("error");
    }
}

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

function logToPanel(message) {
    var timestamp = new Date().toLocaleTimeString();
    logText.text = timestamp + ": " + message + "\n" + logText.text;
}

function checkForCommands() {
    if (!autoRunCheckbox.value || isChecking) {
        return;
    }
    
    isChecking = true;
    
    try {
        var commandFile = new File(getCommandFilePath());
        
        if (commandFile.exists) {
            var opened = commandFile.open("r");
            if (!opened) {
                logToPanel("ERROR: Failed to open command file for reading");
                isChecking = false;
                return;
            }
            
            var content = commandFile.read();
            commandFile.close();
            
            if (content && content.length > 0) {
                try {
                    var commandData = JSON.parse(content);
                    
                    if (commandData.status === "pending") {
                        logToPanel("Processing command: " + commandData.command);
                        updateCommandStatus("running");
                        executeCommand(commandData.command, commandData.args || {});
                    }
                } catch (parseError) {
                    logToPanel("ERROR parsing JSON: " + parseError.toString());
                }
            }
        }
    } catch (e) {
        logToPanel("ERROR in checkForCommands: " + e.toString());
    }
    
    isChecking = false;
}

function startCommandChecker() {
    app.scheduleTask("checkForCommands()", checkInterval, true);
}

// Manual check button
var checkButton = panel.add("button", undefined, "Check for Commands Now");
checkButton.onClick = function() {
    logToPanel("Manually checking for commands");
    checkForCommands();
};

// Log startup
logToPanel("MCP Bridge Auto FULLY FIXED started with complete polyfills");
logToPanel("JSON.stringify available: " + (typeof JSON.stringify === 'function'));
logToPanel("JSON.parse available: " + (typeof JSON.parse === 'function'));
logToPanel("Date.toISOString available: " + (typeof Date.prototype.toISOString === 'function'));
statusText.text = "Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF");

startCommandChecker();
panel.center();
panel.show();
