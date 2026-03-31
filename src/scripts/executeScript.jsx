function executeScript(args) {
    try {
        var script = args.script;
        if (!script) throw new Error("script is required");
        var result;
        try {
            result = eval(script);
        } catch (evalErr) {
            return JSON.stringify({ status: "error", message: "Script execution error: " + evalErr.toString(), script: script }, null, 2);
        }
        var resultStr;
        if (result === undefined || result === null) {
            resultStr = String(result);
        } else if (typeof result === "object") {
            try { resultStr = JSON.stringify(result); } catch (e) { resultStr = result.toString(); }
        } else {
            resultStr = String(result);
        }
        return JSON.stringify({ status: "success", message: "Script executed successfully", result: resultStr }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
