function getAudioWaveform(args) {
    try {
        var compIndex = args.compIndex || 1;
        var layerIndex = args.layerIndex || 1;
        var startTime = args.startTime !== undefined ? args.startTime : 0;
        var endTime = args.endTime !== undefined ? args.endTime : 1;
        var samples = args.samples || 10;
        var comp = app.project.item(compIndex);
        if (!(comp instanceof CompItem)) throw new Error("Item " + compIndex + " is not a composition");
        var layer = comp.layer(layerIndex);
        if (!layer) throw new Error("Layer not found at index " + layerIndex);
        // ExtendScript does not provide direct audio sample data.
        // We can approximate by sampling the Audio Levels property over time.
        var audio = layer.property("Audio");
        var levelData = [];
        var duration = endTime - startTime;
        var step = duration / samples;
        if (audio) {
            var audioLevels = audio.property("Audio Levels");
            if (audioLevels) {
                for (var i = 0; i < samples; i++) {
                    var t = startTime + (i * step);
                    try {
                        var levelValue = audioLevels.valueAtTime(t, true);
                        levelData.push({ time: t, left: levelValue[0], right: levelValue[1] });
                    } catch (e) {
                        levelData.push({ time: t, left: 0, right: 0 });
                    }
                }
            }
        }
        // Also get any markers
        var markers = [];
        try {
            var markerProp = layer.property("Marker");
            if (markerProp && markerProp.numKeys > 0) {
                for (var k = 1; k <= markerProp.numKeys; k++) {
                    var mt = markerProp.keyTime(k);
                    if (mt >= startTime && mt <= endTime) {
                        markers.push({ time: mt, comment: markerProp.keyValue(k).comment });
                    }
                }
            }
        } catch (e) { /* ignore marker errors */ }
        return JSON.stringify({
            status: "success",
            message: "Audio waveform data approximated via Audio Levels property",
            note: "Full PCM waveform data is not accessible via ExtendScript. This returns audio level keyframe values.",
            layer: { name: layer.name, index: layer.index },
            startTime: startTime, endTime: endTime, samples: samples,
            levelData: levelData, markers: markers
        }, null, 2);
    } catch (e) { return JSON.stringify({ status: "error", message: e.toString() }, null, 2); }
}
