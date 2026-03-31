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
        return JSON.stringify({
            status: "success", message: "Footage replaced with: " + newFilePath,
            footage: { name: item.name, id: item.id }
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
