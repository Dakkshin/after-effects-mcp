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
            // Remove all queued items
            var removed = 0;
            for (var i = rq.numItems; i >= 1; i--) {
                try { rq.item(i).remove(); removed++; } catch (e) { /* some items may not be removable */ }
            }
            return JSON.stringify({ status: "success", message: "Cleared " + removed + " items from render queue", action: "clear" }, null, 2);
        } else {
            // status
            var items = [];
            for (var j = 1; j <= rq.numItems; j++) {
                var item = rq.item(j);
                items.push({ index: j, comp: item.comp ? item.comp.name : "Unknown", status: item.status.toString() });
            }
            return JSON.stringify({ status: "success", action: "status", numItems: rq.numItems, items: items }, null, 2);
        }
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
