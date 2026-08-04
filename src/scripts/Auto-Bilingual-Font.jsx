#target aftereffects
#targetengine "AutoBilingualFont"

(function autoBilingualFontPanel(thisObj) {
    var SCRIPT_NAME = "中英日韓自動分字型";
    var VERSION = "2.0.0";
    var SETTINGS = "AutoBilingualFontV2";
    var BACKUP_START = "[[ABF_BACKUP_V2:";
    var BACKUP_END = "]]";
    var EXPRESSION_TAG = "// AutoBilingualFont v2";
    var fonts = [];
    var pickers = [];
    var ui = {};

    function majorVersion() { return parseInt(app.version.split(".")[0], 10); }
    function lower(v) { return String(v || "").toLowerCase(); }
    function trim(v) { return String(v || "").replace(/^\s+|\s+$/g, ""); }
    function uniquePush(a, v) { var i; for (i = 0; i < a.length; i++) if (a[i] === v) return; a.push(v); }
    function getSetting(k, fallback) { try { return app.settings.haveSetting(SETTINGS, k) ? app.settings.getSetting(SETTINGS, k) : fallback; } catch (e) { return fallback; } }
    function setSetting(k, v) { try { app.settings.saveSetting(SETTINGS, k, String(v)); } catch (e) {} }
    function parseJSON(s, fallback) { try { return JSON.parse(s); } catch (e) { return fallback; } }
    function escapeJS(s) { return String(s).replace(/\\/g, "\\\\").replace(/\"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n"); }

    function fontLabel(f) {
        var family = f.nativeFamilyName || f.familyName || f.fullName;
        var style = f.nativeStyleName || f.styleName || "";
        return family + (style ? " — " + style : "") + " [" + f.postScriptName + "]";
    }

    function loadFonts() {
        fonts = [];
        var groups = app.fonts.allFonts, i, j, f, label;
        for (i = 0; i < groups.length; i++) {
            for (j = 0; j < groups[i].length; j++) {
                f = groups[i][j];
                if (!f.isSubstitute && f.postScriptName) {
                    label = fontLabel(f);
                    fonts.push({ label: label, search: lower(label + " " + f.familyName + " " + f.styleName), ps: f.postScriptName, family: f.familyName, style: f.styleName, object: f });
                }
            }
        }
        fonts.sort(function (a, b) { var aa = lower(a.label), bb = lower(b.label); return aa < bb ? -1 : (aa > bb ? 1 : 0); });
    }

    function fontByPS(ps) { var i; for (i = 0; i < fonts.length; i++) if (fonts[i].ps === ps) return fonts[i]; return null; }
    function firstFont() { return fonts.length ? fonts[0] : null; }
    function defaultFontPS(scriptValue, fallbackPS) {
        try {
            var f = app.fonts.getDefaultFontForCTScript(scriptValue);
            if (f && fontByPS(f.postScriptName)) return f.postScriptName;
        } catch (e) {}
        return fallbackPS;
    }
    function currentTextLayer() {
        var c = app.project && app.project.activeItem;
        if (!(c instanceof CompItem) || c.selectedLayers.length !== 1) return null;
        return c.selectedLayers[0].property("ADBE Text Properties") ? c.selectedLayers[0] : null;
    }
    function fontPSFromLayer(layer, role) {
        var doc = getSource(layer).value, text = String(doc.text), tests = {
            zh: /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/,
            en: /[A-Za-z0-9]/,
            ja: /[\u3040-\u30FF\u31F0-\u31FF]/,
            ko: /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/
        }, i, f;
        for (i = 0; i < text.length; i++) if (tests[role].test(text.charAt(i))) {
            try { f = doc.characterRange(i, i + 1).font; if (fontByPS(f)) return f; } catch (e) {}
        }
        return doc.fontObject ? doc.fontObject.postScriptName : doc.font;
    }

    function favoriteFamilies() { try { return app.fonts.favoriteFontFamilyList || []; } catch (e) { return []; } }
    function recentFamilies() { try { return app.fonts.mruFontFamilyList || []; } catch (e) { return []; } }
    function familyIn(list, family) { var i; for (i = 0; i < list.length; i++) if (list[i] === family) return true; return false; }
    function touchRecent(records) {
        try {
            var list = recentFamilies().slice(0), i, j;
            for (i = records.length - 1; i >= 0; i--) {
                for (j = list.length - 1; j >= 0; j--) if (list[j] === records[i].family) list.splice(j, 1);
                list.unshift(records[i].family);
            }
            if (list.length > 25) list.length = 25;
            app.fonts.mruFontFamilyList = list;
        } catch (e) {}
    }

    function toggleFavorite(record) {
        try {
            var list = favoriteFamilies().slice(0), i, found = -1;
            for (i = 0; i < list.length; i++) if (list[i] === record.family) found = i;
            if (found >= 0) list.splice(found, 1); else list.push(record.family);
            app.fonts.favoriteFontFamilyList = list;
            refreshAllPickers();
        } catch (e) { alert("無法更新 AE 字型收藏：" + e.toString(), SCRIPT_NAME); }
    }

    function createPicker(parent, role, title, initialPS) {
        var row = parent.add("group"), visible = [], selectedPS = initialPS;
        row.orientation = "row"; row.alignChildren = ["left", "center"];
        var titleText = row.add("statictext", undefined, title); titleText.preferredSize.width = 78;
        var search = row.add("edittext", undefined, ""); search.preferredSize.width = 105; search.helpTip = "搜尋家族、樣式或 PostScript 名稱";
        var list = row.add("dropdownlist", undefined, []); list.preferredSize = [315, 25];
        var star = row.add("button", undefined, "☆"); star.preferredSize = [32, 24]; star.helpTip = "加入／移除 AE 字型收藏";
        var take = row.add("button", undefined, "取目前"); take.preferredSize = [58, 24]; take.helpTip = "使用目前選取文字層第一個字元的字型";

        function allowed(r) {
            var mode = ui.fontFilter ? ui.fontFilter.selection.index : 0;
            if (mode === 1 && !familyIn(favoriteFamilies(), r.family)) return false;
            if (mode === 2 && !familyIn(recentFamilies(), r.family)) return false;
            return !search.text || r.search.indexOf(lower(search.text)) >= 0;
        }
        function refill() {
            var i, item, sel = -1; list.removeAll(); visible = [];
            for (i = 0; i < fonts.length; i++) if (allowed(fonts[i])) {
                visible.push(fonts[i]); item = list.add("item", fonts[i].label);
                if (fonts[i].ps === selectedPS) sel = item.index;
            }
            if (list.items.length) { list.selection = sel >= 0 ? sel : 0; selectedPS = visible[list.selection.index].ps; }
            updateStar(); updatePreview();
        }
        function updateStar() { var r = getRecord(); star.text = r && familyIn(favoriteFamilies(), r.family) ? "★" : "☆"; }
        function getRecord() { return list.selection ? visible[list.selection.index] : fontByPS(selectedPS); }
        function selectPS(ps) { if (fontByPS(ps)) selectedPS = ps; search.text = ""; refill(); }

        search.onChanging = refill;
        list.onChange = function () { if (list.selection) selectedPS = visible[list.selection.index].ps; updateStar(); updatePreview(); };
        star.onClick = function () { var r = getRecord(); if (r) toggleFavorite(r); };
        take.onClick = function () {
            var layer = currentTextLayer();
            if (!layer) { alert("請只選取一個文字圖層。", SCRIPT_NAME); return; }
            selectPS(fontPSFromLayer(layer, role));
        };
        var picker = { role: role, refill: refill, getRecord: getRecord, selectPS: selectPS };
        pickers.push(picker); refill(); return picker;
    }

    function refreshAllPickers() { var i; for (i = 0; i < pickers.length; i++) pickers[i].refill(); }
    function applyPreviewFont(control, record) { if (!control || !record) return; try { control.graphics.font = ScriptUI.newFont(record.family, record.style, 18); } catch (e) {} }
    function updatePreview() {
        if (!ui.previewZh || pickers.length < 4) return;
        applyPreviewFont(ui.previewZh, pickers[0].getRecord()); applyPreviewFont(ui.previewEn, pickers[1].getRecord());
        applyPreviewFont(ui.previewJa, pickers[2].getRecord()); applyPreviewFont(ui.previewKo, pickers[3].getRecord());
    }

    function addChoice(parent, label, choices, selected) {
        var g = parent.add("group"); g.add("statictext", undefined, label).preferredSize.width = 175;
        var d = g.add("dropdownlist", undefined, choices); d.preferredSize.width = 190; d.selection = selected || 0; return d;
    }

    function selectedTextLayers() {
        var c = app.project && app.project.activeItem, out = [], i;
        if (!(c instanceof CompItem)) return out;
        for (i = 0; i < c.selectedLayers.length; i++) if (c.selectedLayers[i].property("ADBE Text Properties")) out.push(c.selectedLayers[i]);
        return out;
    }
    function allTextLayers(comp) { var out = [], i; for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).property("ADBE Text Properties")) out.push(comp.layer(i)); return out; }
    function allProjectTextLayers(taggedOnly) {
        var out = [], i, j, item, layers;
        for (i = 1; i <= app.project.numItems; i++) { item = app.project.item(i); if (item instanceof CompItem) { layers = allTextLayers(item); for (j = 0; j < layers.length; j++) if (!taggedOnly || isApplied(layers[j])) out.push(layers[j]); } }
        return out;
    }
    function targetLayers(scopeIndex) {
        var c, out = [], sel, i, j, layers;
        if (scopeIndex === 0) return selectedTextLayers();
        if (scopeIndex === 1) { c = app.project.activeItem; return c instanceof CompItem ? allTextLayers(c) : out; }
        if (scopeIndex === 2) { sel = app.project.selection; for (i = 0; i < sel.length; i++) if (sel[i] instanceof CompItem) { layers = allTextLayers(sel[i]); for (j = 0; j < layers.length; j++) out.push(layers[j]); } return out; }
        if (scopeIndex === 3) return allProjectTextLayers(false);
        return allProjectTextLayers(true);
    }

    function getSource(layer) { return layer.property("ADBE Text Properties").property("ADBE Text Document"); }
    function isApplied(layer) { try { return getSource(layer).expression.indexOf(EXPRESSION_TAG) >= 0; } catch (e) { return false; } }

    function getBackupPayload(layer) {
        var comment = String(layer.comment || ""), start = comment.indexOf(BACKUP_START), end;
        if (start < 0) return null;
        end = comment.indexOf(BACKUP_END, start + BACKUP_START.length); if (end < 0) return null;
        try { return JSON.parse(decodeURIComponent(comment.substring(start + BACKUP_START.length, end))); } catch (e) { return null; }
    }
    function removeBackupPayload(layer) {
        var comment = String(layer.comment || ""), start = comment.indexOf(BACKUP_START), end;
        if (start < 0) return;
        end = comment.indexOf(BACKUP_END, start + BACKUP_START.length); if (end < 0) return;
        layer.comment = comment.substring(0, start).replace(/\n$/, "") + comment.substring(end + BACKUP_END.length);
    }
    function fontRuns(doc) {
        var text = String(doc.text), runs = [], last = null, start = 0, i, f;
        for (i = 0; i < text.length; i++) {
            try { f = doc.characterRange(i, i + 1).font; } catch (e) { f = doc.font; }
            if (last === null) { last = f; start = i; }
            else if (f !== last) { runs.push({ s: start, l: i - start, f: last }); last = f; start = i; }
        }
        if (text.length) runs.push({ s: start, l: text.length - start, f: last });
        return { n: text.length, r: runs };
    }
    function backupLayer(layer) {
        if (getBackupPayload(layer)) return;
        var p = getSource(layer), data = { expression: p.expression, enabled: p.expressionEnabled, values: [] }, i;
        if (p.numKeys) for (i = 1; i <= p.numKeys; i++) data.values.push({ k: i, d: fontRuns(p.keyValue(i)) });
        else data.values.push({ k: 0, d: fontRuns(p.valueAtTime(0, true)) });
        layer.comment = String(layer.comment || "") + (layer.comment ? "\n" : "") + BACKUP_START + encodeURIComponent(JSON.stringify(data)) + BACKUP_END;
    }
    function restoreDocumentFonts(doc, saved) {
        var i, run, end, length = String(doc.text).length;
        for (i = 0; i < saved.r.length; i++) { run = saved.r[i]; end = Math.min(run.s + run.l, length); if (run.s < end) try { doc.characterRange(run.s, end).font = run.f; } catch (e) {} }
        return doc;
    }
    function restoreLayer(layer) {
        var data = getBackupPayload(layer), p, i, entry, doc;
        if (!data) return false;
        p = getSource(layer); p.expression = "";
        for (i = 0; i < data.values.length; i++) {
            entry = data.values[i];
            if (entry.k > 0 && entry.k <= p.numKeys) { doc = p.keyValue(entry.k); p.setValueAtKey(entry.k, restoreDocumentFonts(doc, entry.d)); }
            else if (entry.k === 0 && p.numKeys === 0) { doc = p.value; p.setValue(restoreDocumentFonts(doc, entry.d)); }
        }
        p.expression = data.expression || ""; p.expressionEnabled = data.enabled && p.expression !== "";
        removeBackupPayload(layer); return true;
    }

    function configFromUI() {
        return {
            zh: pickers[0].getRecord().ps, en: pickers[1].getRecord().ps, ja: pickers[2].getRecord().ps, ko: pickers[3].getRecord().ps,
            autoJa: ui.autoJa.value, autoKo: ui.autoKo.value,
            digits: ui.digits.selection.index, asciiPunct: ui.asciiPunct.selection.index, fullwidth: ui.fullwidth.selection.index, cjkPunct: ui.cjkPunct.selection.index, symbols: ui.symbols.selection.index, whitespace: ui.whitespace.selection.index,
            custom: ui.customRules.text, glyphCheck: ui.glyphCheck.value
        };
    }
    function applyConfig(c) {
        pickers[0].selectPS(c.zh); pickers[1].selectPS(c.en); pickers[2].selectPS(c.ja); pickers[3].selectPS(c.ko);
        ui.autoJa.value = c.autoJa !== false; ui.autoKo.value = c.autoKo !== false;
        ui.digits.selection = c.digits || 0; ui.asciiPunct.selection = c.asciiPunct || 0; ui.fullwidth.selection = c.fullwidth || 0; ui.cjkPunct.selection = c.cjkPunct === undefined ? 1 : c.cjkPunct; ui.symbols.selection = c.symbols || 0; ui.whitespace.selection = c.whitespace === undefined ? 1 : c.whitespace;
        ui.customRules.text = c.custom || ""; ui.glyphCheck.value = c.glyphCheck !== false; updatePreview();
    }
    function fontForTarget(c, target) { return target === "en" ? c.en : target === "ja" ? c.ja : target === "ko" ? c.ko : c.zh; }
    function choiceTarget(index) { return ["en", "zh", "ja", "ko"][index] || "en"; }

    function parseCustomRules(text, showError) {
        var lines = String(text || "").split(/\r?\n/), out = [], i, line, pipe, target, pattern;
        for (i = 0; i < lines.length; i++) {
            line = trim(lines[i]); if (!line || line.indexOf("//") === 0) continue;
            pipe = line.indexOf("|");
            if (pipe < 1) { if (showError) alert("自訂規則第 " + (i + 1) + " 行缺少 |。", SCRIPT_NAME); return null; }
            target = lower(trim(line.substring(0, pipe))); pattern = trim(line.substring(pipe + 1));
            if (!/^(zh|en|ja|ko)$/.test(target)) { if (showError) alert("自訂規則第 " + (i + 1) + " 行目標必須是 zh、en、ja 或 ko。", SCRIPT_NAME); return null; }
            try { new RegExp(pattern); } catch (e) { if (showError) alert("自訂規則第 " + (i + 1) + " 行正則無效：\n" + e.toString(), SCRIPT_NAME); return null; }
            out.push({ target: target, pattern: pattern });
        }
        return out;
    }

    function makeExpression(c) {
        var rules = parseCustomRules(c.custom, false) || [], asciiPattern = "[@#&%+\\-_\\/\\\\.:,!?\\x22'()\\[\\]{}]+", lines = [EXPRESSION_TAG, "var sty = text.sourceText.style.setFont(\"" + escapeJS(c.zh) + "\");", "function put(font, pattern) {", "  var re = new RegExp(pattern, \"g\"), m;", "  while ((m = re.exec(value.toString())) !== null) {", "    if (m[0].length === 0) { re.lastIndex++; continue; }", "    sty = sty.setFont(font, m.index, m[0].length);", "  }", "}", "put(\"" + escapeJS(c.en) + "\", \"[A-Za-z]+\");"], i;
        lines.push("put(\"" + escapeJS(fontForTarget(c, choiceTarget(c.digits))) + "\", \"[0-9]+\");");
        lines.push("put(\"" + escapeJS(fontForTarget(c, choiceTarget(c.asciiPunct))) + "\", \"" + escapeJS(asciiPattern) + "\");");
        lines.push("put(\"" + escapeJS(fontForTarget(c, choiceTarget(c.fullwidth))) + "\", \"[\\\\uFF10-\\\\uFF19\\\\uFF21-\\\\uFF3A\\\\uFF41-\\\\uFF5A]+\");");
        lines.push("put(\"" + escapeJS(fontForTarget(c, choiceTarget(c.cjkPunct))) + "\", \"[\\\\u3000-\\\\u303F\\\\uFF01-\\\\uFF0F\\\\uFF1A-\\\\uFF20\\\\uFF3B-\\\\uFF40\\\\uFF5B-\\\\uFF65]+\");");
        lines.push("put(\"" + escapeJS(fontForTarget(c, choiceTarget(c.symbols))) + "\", \"[$€£¥¢₹₩°℃℉=<>~^*|]+\");");
        lines.push("put(\"" + escapeJS(fontForTarget(c, choiceTarget(c.whitespace))) + "\", \"[ \\\\t]+\");");
        if (c.autoJa) lines.push("put(\"" + escapeJS(c.ja) + "\", \"[\\\\u3040-\\\\u30FF\\\\u31F0-\\\\u31FF]+\");");
        if (c.autoKo) lines.push("put(\"" + escapeJS(c.ko) + "\", \"[\\\\u1100-\\\\u11FF\\\\u3130-\\\\u318F\\\\uAC00-\\\\uD7AF]+\");");
        for (i = 0; i < rules.length; i++) lines.push("put(\"" + escapeJS(fontForTarget(c, rules[i].target)) + "\", \"" + escapeJS(rules[i].pattern) + "\");");
        lines.push("sty;"); return lines.join("\n");
    }

    function setChineseBase(p, record) {
        var i, doc;
        function setDoc(d) { if (String(d.text).length) try { d.characterRange(0, -1).fontObject = record.object; } catch (e) { d.fontObject = record.object; } else d.fontObject = record.object; return d; }
        if (p.numKeys) for (i = 1; i <= p.numKeys; i++) { doc = p.keyValue(i); p.setValueAtKey(i, setDoc(doc)); }
        else { doc = p.valueAtTime(0, true); p.setValue(setDoc(doc)); }
    }

    function customTargetForChar(ch, rules) { var i; for (i = rules.length - 1; i >= 0; i--) try { if (new RegExp(rules[i].pattern).test(ch)) return rules[i].target; } catch (e) {} return null; }
    function targetForChar(ch, c, rules) {
        var custom = customTargetForChar(ch, rules); if (custom) return custom;
        if (c.autoJa && /[\u3040-\u30FF\u31F0-\u31FF]/.test(ch)) return "ja";
        if (c.autoKo && /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(ch)) return "ko";
        if (/[A-Za-z]/.test(ch)) return "en";
        if (/[0-9]/.test(ch)) return choiceTarget(c.digits);
        if (/[@#&%+\-_\/\\.:,!?"'()\[\]{}]/.test(ch)) return choiceTarget(c.asciiPunct);
        if (/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/.test(ch)) return choiceTarget(c.fullwidth);
        if (/[\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/.test(ch)) return choiceTarget(c.cjkPunct);
        if (/[$€£¥¢₹₩°℃℉=<>~^*|]/.test(ch)) return choiceTarget(c.symbols);
        if (/[ \t]/.test(ch)) return choiceTarget(c.whitespace);
        return "zh";
    }
    function stringsForGlyphCheck(layers, c) {
        var result = { zh: "", en: "", ja: "", ko: "" }, seen = { zh: {}, en: {}, ja: {}, ko: {} }, rules = parseCustomRules(c.custom, false) || [], i, j, k, p, doc, text, target, ch;
        for (i = 0; i < layers.length; i++) { p = getSource(layers[i]); for (j = 0; j < (p.numKeys || 1); j++) { doc = p.numKeys ? p.keyValue(j + 1) : p.value; text = String(doc.text); for (k = 0; k < text.length; k++) { ch = text.charAt(k); if (/\s/.test(ch)) continue; target = targetForChar(ch, c, rules); if (!seen[target][ch]) { seen[target][ch] = true; result[target] += ch; } } } }
        return result;
    }
    function missingGlyphs(record, chars) { var out = "", i, ch; if (!record || !record.object.hasGlyphsFor || !chars) return out; for (i = 0; i < chars.length; i++) { ch = chars.charAt(i); try { if (!record.object.hasGlyphsFor(ch) && out.indexOf(ch) < 0) out += ch; } catch (e) {} } return out; }
    function suggestions(missing) { var out = [], i; for (i = 0; i < fonts.length && out.length < 3; i++) try { if (fonts[i].object.hasGlyphsFor(missing)) out.push(fonts[i].label); } catch (e) {} return out; }
    function glyphReport(layers, c) {
        if (majorVersion() < 25 || parseFloat(app.version) < 25.1) return "AE 25.1 起才支援缺字檢查。";
        var strings = stringsForGlyphCheck(layers, c), targets = ["zh", "en", "ja", "ko"], names = ["中文", "英文", "日文", "韓文"], report = [], i, rec, missing, suggest;
        for (i = 0; i < targets.length; i++) { rec = fontByPS(fontForTarget(c, targets[i])); missing = missingGlyphs(rec, strings[targets[i]]); if (missing) { suggest = suggestions(missing); report.push(names[i] + "字型缺少：「" + missing.substring(0, 40) + (missing.length > 40 ? "…" : "") + "」\n可完整涵蓋的候選：" + (suggest.length ? suggest.join("、") : "未找到")); } }
        return report.join("\n\n");
    }

    function applyToLayers(layers, c) {
        if (!layers.length) { alert("指定範圍內找不到文字圖層。", SCRIPT_NAME); return; }
        if (!parseCustomRules(c.custom, true)) return;
        var i, p, overwritten = 0, applied = 0, failed = [], expression = makeExpression(c), report;
        for (i = 0; i < layers.length; i++) { p = getSource(layers[i]); if (p.expression && !isApplied(layers[i])) overwritten++; }
        if (overwritten && !confirm("有 " + overwritten + " 個圖層的 Source Text 已有其他 expression；已經可以備份還原，但套用期間會被取代。\n\n繼續嗎？", false, SCRIPT_NAME)) return;
        if (c.glyphCheck) { report = glyphReport(layers, c); if (report && !confirm("缺字檢查結果：\n\n" + report + "\n\n仍要套用嗎？", false, SCRIPT_NAME)) return; }
        app.beginUndoGroup(SCRIPT_NAME + " 套用");
        for (i = 0; i < layers.length; i++) try { backupLayer(layers[i]); p = getSource(layers[i]); setChineseBase(p, fontByPS(c.zh)); p.expression = expression; p.expressionEnabled = true; applied++; } catch (e) { failed.push(layers[i].name + "：" + e.toString()); }
        app.endUndoGroup();
        touchRecent([fontByPS(c.zh), fontByPS(c.en), fontByPS(c.ja), fontByPS(c.ko)]); setSetting("lastConfig", JSON.stringify(c));
        ui.status.text = "已套用 " + applied + " 個文字圖層。" + (failed.length ? " 失敗 " + failed.length + " 個。" : "");
        if (failed.length) alert("部分圖層失敗：\n\n" + failed.join("\n"), SCRIPT_NAME);
    }
    function restoreLayers(layers) { var i, count = 0; app.beginUndoGroup(SCRIPT_NAME + " 還原"); for (i = 0; i < layers.length; i++) try { if (restoreLayer(layers[i])) count++; } catch (e) {} app.endUndoGroup(); ui.status.text = "已還原 " + count + " 個文字圖層。"; }
    function removeExpressions(layers) { var i, p, count = 0; app.beginUndoGroup(SCRIPT_NAME + " 移除 expression"); for (i = 0; i < layers.length; i++) if (isApplied(layers[i])) { p = getSource(layers[i]); p.expression = ""; count++; } app.endUndoGroup(); ui.status.text = "已移除 " + count + " 個自動分字型 expression；中文字型基底與備份仍保留。"; }

    function presets() {
        var count = parseInt(getSetting("presetCount", "0"), 10) || 0, out = [], i, name, config;
        for (i = 0; i < count && i < 20; i++) {
            name = getSetting("presetName" + i, "");
            config = parseJSON(getSetting("presetData" + i, "{}"), null);
            if (name && config) out.push({ name: name, config: config });
        }
        return out;
    }
    function savePresets(list) {
        var i; if (list.length > 20) list.length = 20;
        setSetting("presetCount", list.length);
        for (i = 0; i < list.length; i++) { setSetting("presetName" + i, list[i].name); setSetting("presetData" + i, JSON.stringify(list[i].config)); }
    }
    function refreshPresetList() { var list = presets(), i; ui.presetList.removeAll(); for (i = 0; i < list.length; i++) ui.presetList.add("item", list[i].name); if (ui.presetList.items.length) ui.presetList.selection = 0; }

    function buildUI() {
        var win = thisObj instanceof Panel ? thisObj : new Window("palette", SCRIPT_NAME + " " + VERSION, undefined, { resizeable: true });
        win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.margins = 10;
        if (majorVersion() < 25) { win.add("statictext", undefined, "需要 After Effects 25.0 或更新版本。", { multiline: true }); return win; }
        loadFonts(); if (!fonts.length) { win.add("statictext", undefined, "找不到可用字型。"); return win; }

        var toolbar = win.add("group"); toolbar.add("statictext", undefined, "字型顯示："); ui.fontFilter = toolbar.add("dropdownlist", undefined, ["全部", "收藏", "最近使用"]); ui.fontFilter.selection = 0;
        var refreshFonts = toolbar.add("button", undefined, "重新整理"); refreshFonts.onClick = function () { loadFonts(); refreshAllPickers(); ui.status.text = "已重新整理 " + fonts.length + " 個字型樣式。"; };

        var tabs = win.add("tabbedpanel"); tabs.alignChildren = ["fill", "fill"]; tabs.preferredSize = [650, 520];
        var fontTab = tabs.add("tab", undefined, "字型與預覽"); fontTab.orientation = "column"; fontTab.alignChildren = ["fill", "top"]; fontTab.margins = 12;
        var last = parseJSON(getSetting("lastConfig", "{}"), {}), fallback = firstFont().ps;
        var defaultZh = defaultFontPS(CTScript.CT_TRADITIONALCHINESE_SCRIPT, fallback);
        var defaultEn = fontByPS("Montserrat-SemiBold") ? "Montserrat-SemiBold" : defaultFontPS(CTScript.CT_ROMAN_SCRIPT, fallback);
        var defaultJa = defaultFontPS(CTScript.CT_JAPANESE_SCRIPT, defaultZh);
        var defaultKo = defaultFontPS(CTScript.CT_KOREAN_SCRIPT, defaultZh);
        createPicker(fontTab, "zh", "中文", fontByPS(last.zh) ? last.zh : defaultZh);
        createPicker(fontTab, "en", "英文", fontByPS(last.en) ? last.en : defaultEn);
        createPicker(fontTab, "ja", "日文", fontByPS(last.ja) ? last.ja : defaultJa);
        createPicker(fontTab, "ko", "韓文", fontByPS(last.ko) ? last.ko : defaultKo);
        var preview = fontTab.add("panel", undefined, "預覽"); preview.orientation = "column"; preview.alignChildren = ["fill", "top"];
        ui.previewZh = preview.add("statictext", undefined, "中文預覽：設計與排版，１２３。");
        ui.previewEn = preview.add("statictext", undefined, "English preview: Typography ABC 123!");
        ui.previewJa = preview.add("statictext", undefined, "日本語プレビュー：かなカナ 123");
        ui.previewKo = preview.add("statictext", undefined, "한국어 미리보기: 한글 123");

        var rulesTab = tabs.add("tab", undefined, "分配規則"); rulesTab.orientation = "column"; rulesTab.alignChildren = ["fill", "top"]; rulesTab.margins = 12;
        ui.autoJa = rulesTab.add("checkbox", undefined, "自動辨識平假名／片假名並套用日文字型"); ui.autoJa.value = true;
        ui.autoKo = rulesTab.add("checkbox", undefined, "自動辨識韓文字母／音節並套用韓文字型"); ui.autoKo.value = true;
        var choices = ["英文字型", "中文字型", "日文字型", "韓文字型"];
        ui.digits = addChoice(rulesTab, "半形數字 0–9", choices, 0);
        ui.asciiPunct = addChoice(rulesTab, "半形標點與括號", choices, 0);
        ui.fullwidth = addChoice(rulesTab, "全形英文字母／數字", choices, 0);
        ui.cjkPunct = addChoice(rulesTab, "全形／中日文標點", choices, 1);
        ui.symbols = addChoice(rulesTab, "貨幣／數學／溫度符號", choices, 0);
        ui.whitespace = addChoice(rulesTab, "空格與 Tab", choices, 1);
        var customPanel = rulesTab.add("panel", undefined, "自訂規則（由上到下套用，後面的優先）"); customPanel.orientation = "column"; customPanel.alignChildren = ["fill", "top"];
        customPanel.add("statictext", undefined, "格式：目標|正則　目標可用 zh、en、ja、ko；例如 en|[©®™]");
        ui.customRules = customPanel.add("edittext", undefined, "", { multiline: true, scrolling: true }); ui.customRules.preferredSize.height = 140;

        var presetTab = tabs.add("tab", undefined, "配對預設"); presetTab.orientation = "column"; presetTab.alignChildren = ["fill", "top"]; presetTab.margins = 12;
        ui.presetList = presetTab.add("listbox", undefined, [], { multiselect: false }); ui.presetList.preferredSize.height = 285;
        var presetRow = presetTab.add("group"); ui.presetName = presetRow.add("edittext", undefined, ""); ui.presetName.preferredSize.width = 270;
        var savePreset = presetRow.add("button", undefined, "儲存目前設定"); var loadPreset = presetRow.add("button", undefined, "載入"); var deletePreset = presetRow.add("button", undefined, "刪除");
        savePreset.onClick = function () { var name = trim(ui.presetName.text), list = presets(), i; if (!name) { alert("請輸入預設名稱。", SCRIPT_NAME); return; } for (i = list.length - 1; i >= 0; i--) if (list[i].name === name) list.splice(i, 1); list.unshift({ name: name, config: configFromUI() }); savePresets(list); refreshPresetList(); ui.status.text = "已儲存預設：「" + name + "」。"; };
        loadPreset.onClick = function () { var list = presets(); if (ui.presetList.selection) applyConfig(list[ui.presetList.selection.index].config); };
        deletePreset.onClick = function () { var list = presets(); if (!ui.presetList.selection) return; list.splice(ui.presetList.selection.index, 1); savePresets(list); refreshPresetList(); };

        var batchTab = tabs.add("tab", undefined, "批次與還原"); batchTab.orientation = "column"; batchTab.alignChildren = ["fill", "top"]; batchTab.margins = 12;
        ui.scope = addChoice(batchTab, "處理範圍", ["目前選取文字層", "目前合成全部文字層", "專案面板選取的合成", "整個專案", "整個專案中已套用的圖層"], 0);
        ui.glyphCheck = batchTab.add("checkbox", undefined, "套用前檢查缺字並推薦可涵蓋字型"); ui.glyphCheck.value = true;
        batchTab.add("statictext", undefined, "「還原」會恢復套用前的逐字字型與原 Source Text expression。", { multiline: true });
        var action1 = batchTab.add("group"); var applyBtn = action1.add("button", undefined, "套用自動分字型"); var checkBtn = action1.add("button", undefined, "只檢查缺字");
        var action2 = batchTab.add("group"); var restoreBtn = action2.add("button", undefined, "還原套用前狀態"); var removeBtn = action2.add("button", undefined, "僅移除自動 expression");
        applyBtn.onClick = function () { applyToLayers(targetLayers(ui.scope.selection.index), configFromUI()); };
        checkBtn.onClick = function () { var layers = targetLayers(ui.scope.selection.index); if (!layers.length) { alert("指定範圍內找不到文字圖層。", SCRIPT_NAME); return; } var report = glyphReport(layers, configFromUI()); alert(report || "沒有發現缺字。", SCRIPT_NAME); };
        restoreBtn.onClick = function () { var layers = targetLayers(ui.scope.selection.index); if (layers.length && confirm("要還原指定範圍內有備份的文字圖層嗎？", false, SCRIPT_NAME)) restoreLayers(layers); };
        removeBtn.onClick = function () { var layers = targetLayers(ui.scope.selection.index); if (layers.length && confirm("只移除 expression，不還原原字型；備份會保留供之後還原。\n\n繼續嗎？", false, SCRIPT_NAME)) removeExpressions(layers); };

        ui.status = win.add("statictext", undefined, "選好字型與規則後，在「批次與還原」執行。", { multiline: true }); ui.status.minimumSize.height = 38;
        ui.fontFilter.onChange = refreshAllPickers; refreshPresetList();
        if (last.zh) applyConfig(last); else updatePreview();
        win.onResizing = win.onResize = function () { this.layout.resize(); };
        return win;
    }

    var panel = buildUI();
    if (panel instanceof Window) { panel.center(); panel.show(); } else panel.layout.layout(true);
})(this);
