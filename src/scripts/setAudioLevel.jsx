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
