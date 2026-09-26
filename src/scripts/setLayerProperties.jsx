// setLayerProperties.jsx
// Sets properties of a specified layer in a composition

function setLayerProperties(args) {
  try {
    // Extract parameters from args
    var compName = args.compName || "";
    var layerName = args.layerName || "";
    var layerIndex = args.layerIndex; // If provided, used instead of layerName
    var newName = args.newName; // NEW: name to rename the layer to
    var position = args.position; // [x, y] or [x, y, z]
    var scale = args.scale; // [x, y] or [x, y, z] in percent (100 = 100%)
    var rotation = args.rotation; // Rotation in degrees
    var opacity = args.opacity; // 0-100
    var startTime = args.startTime; // New in-point time
    var duration = args.duration; // New duration

    // Find the composition by name
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
      var item = app.project.item(i);
      if (item instanceof CompItem && item.name === compName) {
        comp = item;
        break;
      }
    }

    // If no composition was found by name, use the active composition
    if (!comp) {
      if (app.project.activeItem instanceof CompItem) {
        comp = app.project.activeItem;
      } else {
        throw new Error(
          "No composition found with name '" +
            compName +
            "' and no active composition",
        );
      }
    }

    // Find the layer
    var layer = null;
    if (layerIndex !== undefined && layerIndex !== null) {
      // Try to get layer by index
      if (layerIndex > 0 && layerIndex <= comp.numLayers) {
        layer = comp.layer(layerIndex);
      } else {
        throw new Error("Layer index out of bounds: " + layerIndex);
      }
    } else if (layerName) {
      // Try to get layer by name
      for (var j = 1; j <= comp.numLayers; j++) {
        if (comp.layer(j).name === layerName) {
          layer = comp.layer(j);
          break;
        }
      }
    }

    if (!layer) {
      throw new Error(
        "Layer not found: " + (layerName || "index " + layerIndex),
      );
    }

    // Set properties if provided
    var changedProperties = [];

    // Name (NEW)
    if (newName !== undefined && newName !== null && newName !== "") {
      layer.name = newName;
      changedProperties.push("name");
    }

    // Position
    if (position !== undefined && position !== null) {
      layer.property("Position").setValue(position);
      changedProperties.push("position");
    }

    // Scale
    if (scale !== undefined && scale !== null) {
      layer.property("Scale").setValue(scale);
      changedProperties.push("scale");
    }

    // Rotation
    if (rotation !== undefined && rotation !== null) {
      // Check if we're dealing with a 3D layer
      if (layer.threeDLayer) {
        // For 3D layers, we need to set rotations individually
        layer.property("Rotation").setValue([0, 0, rotation]);
      } else {
        // For 2D layers, simple rotation
        layer.property("Rotation").setValue(rotation);
      }
      changedProperties.push("rotation");
    }

    // Opacity
    if (opacity !== undefined && opacity !== null) {
      layer.property("Opacity").setValue(opacity);
      changedProperties.push("opacity");
    }

    // Timing
    var timingChanged = false;
    if (startTime !== undefined && startTime !== null) {
      layer.startTime = startTime;
      timingChanged = true;
      changedProperties.push("startTime");
    }

    if (duration !== undefined && duration !== null && duration > 0) {
      // Set outPoint based on startTime and duration
      var actualStartTime =
        startTime !== undefined && startTime !== null
          ? startTime
          : layer.startTime;
      layer.outPoint = actualStartTime + duration;
      timingChanged = true;
      changedProperties.push("duration");
    }

    // Return success with updated layer details
    return JSON.stringify(
      {
        status: "success",
        message: "Layer properties updated successfully",
        layer: {
          name: layer.name,
          index: layer.index,
          position: layer.property("Position").value,
          scale: layer.property("Scale").value,
          rotation: layer.threeDLayer
            ? layer.property("Rotation").value
            : layer.property("Rotation").value,
          opacity: layer.property("Opacity").value,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          changedProperties: changedProperties,
        },
      },
      null,
      2,
    );
  } catch (error) {
    // Return error message
    return JSON.stringify(
      {
        status: "error",
        message: error.toString(),
      },
      null,
      2,
    );
  }
}

// Read arguments from the file (passed by the Node.js script)
var argsFile = new File(
  $.fileName.replace(/[^\\\/]*$/, "") + "../temp/args.json",
);
var args = {};
if (argsFile.exists) {
  argsFile.open("r");
  var content = argsFile.read();
  argsFile.close();
  if (content) {
    try {
      args = JSON.parse(content);
    } catch (e) {
      // Handle parsing error
      $.write(
        JSON.stringify(
          {
            status: "error",
            message: "Failed to parse arguments: " + e.toString(),
          },
          null,
          2,
        ),
      );
    }
  }
}

// Run the function and write the result
var result = setLayerProperties(args);

// Write the result so it can be captured by the Node.js process
$.write(result);
