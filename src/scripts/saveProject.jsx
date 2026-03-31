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
