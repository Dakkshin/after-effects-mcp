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
        return JSON.stringify({
            status: "success", message: "Footage imported: " + footageItem.name,
            footage: { name: footageItem.name, id: footageItem.id }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
