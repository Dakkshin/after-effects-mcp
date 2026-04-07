(function () {
    var resultPath = "C:/Users/orely/OneDrive/Documents/2. PRACTICE/VScode/AFTER EFFECT/AE MCP/after-effects-mcp/codex-add-star-to-testcomp-result.json";

    function writeResult(payload) {
        var file = new File(resultPath);
        file.encoding = "UTF-8";
        if (file.open("w")) {
            file.write(JSON.stringify(payload, null, 2));
            file.close();
        }
    }

    function findCompByName(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === name) {
                return item;
            }
        }
        return null;
    }

    app.beginUndoGroup("Add Star To TestComp");

    try {
        if (!app.project) {
            throw new Error("No After Effects project is open.");
        }

        var comp = findCompByName("TestComp");
        if (!comp) {
            throw new Error("Composition 'TestComp' was not found.");
        }

        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = "Star Shape";
        shapeLayer.property("Position").setValue([comp.width / 2, comp.height / 2]);
        shapeLayer.startTime = 0;
        shapeLayer.outPoint = comp.duration;

        var contents = shapeLayer.property("Contents");
        var group = contents.addProperty("ADBE Vector Group");
        var groupContents = group.property("Contents");

        var star = groupContents.addProperty("ADBE Vector Shape - Star");
        star.property("Type").setValue(1);
        star.property("Points").setValue(5);
        star.property("Outer Radius").setValue(100);
        star.property("Inner Radius").setValue(66);

        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue([1, 0, 0]);
        fill.property("Opacity").setValue(100);

        writeResult({
            status: "success",
            composition: comp.name,
            layer: {
                name: shapeLayer.name,
                index: shapeLayer.index,
                shapeType: "star",
                position: [comp.width / 2, comp.height / 2]
            }
        });
    } catch (error) {
        writeResult({
            status: "error",
            message: error.toString(),
            line: error.line
        });
    } finally {
        app.endUndoGroup();
    }
})();
