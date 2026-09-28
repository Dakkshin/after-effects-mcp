#!/usr/bin/env node
// Generates media fixtures for the After Effects smoke test (test/AE_SMOKE_TEST.md) using ffmpeg.
//
// Usage:  node test/fixtures/generate-fixtures.js [--force]
//
// Output (test/fixtures/media/, git-ignored):
//   clip_10s.mp4   1920x1080, 25 fps, 10 s, H.264 + AAC 1 kHz tone, burned-in running timecode
//   clip_2997.mp4  1920x1080, 29.97 fps (30000/1001), 6 s, H.264, video only, burned-in timecode
//   tone_5s.wav    5 s, 1 kHz sine, 48 kHz 16-bit PCM
//   still.png      1920x1080 single frame
//
// Requires ffmpeg (and ffprobe for verification) on PATH. Existing files are kept unless --force.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "media");
const force = process.argv.includes("--force");

function which(cmd) {
  const r = spawnSync(cmd, ["-version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

// Candidate fonts (monospace first so the timecode does not jitter).
const FONT_CANDIDATES = [
  "C:/Windows/Fonts/consola.ttf",
  "C:/Windows/Fonts/cour.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "/System/Library/Fonts/Menlo.ttc",
  "/System/Library/Fonts/Supplemental/Courier New.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
  "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
];

function findFont() {
  if (process.env.FIXTURE_FONT && fs.existsSync(process.env.FIXTURE_FONT)) return process.env.FIXTURE_FONT;
  return FONT_CANDIDATES.find((f) => fs.existsSync(f)) || null;
}

/**
 * Escapes a value for use inside a single-quoted ffmpeg filter option.
 * Windows drive letters need their colon escaped ("C\:/Windows/Fonts/x.ttf"); backslashes are
 * converted to forward slashes (ffmpeg accepts them on Windows) so they need no escaping.
 */
function ffQuote(value) {
  const v = String(value).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
  return `'${v}'`;
}

function drawtext(font, opts) {
  const parts = [];
  if (font) parts.push(`fontfile=${ffQuote(font)}`);
  for (const [k, v] of Object.entries(opts)) parts.push(`${k}=${v}`);
  return `drawtext=${parts.join(":")}`;
}

function timecodeFilters(font, rateExpr, label) {
  const common = { fontcolor: "white", box: 1, boxcolor: "black@0.75", boxborderw: 16, x: "(w-text_w)/2" };
  return [
    // SMPTE timecode HH:MM:SS:FF (frame-accurate at the clip rate).
    drawtext(font, { ...common, timecode: ffQuote("00:00:00:00"), rate: rateExpr, fontsize: 120, y: "h*0.30" }),
    // Seconds with milliseconds, e.g. 00:00:02.000 — this is what the smoke test reads ("00:02").
    drawtext(font, { ...common, text: ffQuote("%{pts:hms}"), fontsize: 96, y: "h*0.50" }),
    drawtext(font, { ...common, text: ffQuote(`${label}  frame %{n}`), fontsize: 56, y: "h*0.68" }),
  ].join(",");
}

function run(args, label) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    throw new Error(`ffmpeg failed for ${label} (exit ${r.status}):\n${r.stderr || r.error}`);
  }
}

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,width,height,r_frame_rate,sample_rate", "-of", "json", file], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function main() {
  if (!which("ffmpeg")) {
    console.error("ffmpeg not found on PATH. Install ffmpeg and retry.");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const font = findFont();
  if (!font) console.warn("WARNING: no known font file found; relying on ffmpeg's fontconfig default (set FIXTURE_FONT to override).");

  const jobs = [
    {
      name: "clip_10s.mp4",
      args: (out) => [
        "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=25:duration=10",
        "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=10",
        "-vf", timecodeFilters(font, "25", "clip_10s 25fps"),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "25",
        "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out,
      ],
    },
    {
      name: "clip_2997.mp4",
      args: (out) => [
        "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30000/1001:duration=6",
        "-vf", timecodeFilters(font, "30000/1001", "clip_2997 29.97fps"),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30000/1001",
        "-an", "-movflags", "+faststart", out,
      ],
    },
    {
      name: "tone_5s.wav",
      args: (out) => ["-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=5", "-c:a", "pcm_s16le", out],
    },
    {
      name: "still.png",
      args: (out) => [
        "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=1:duration=1",
        "-vf", drawtext(font, { text: ffQuote("STILL 1920x1080"), fontsize: 120, fontcolor: "white", box: 1,
          boxcolor: "black@0.75", boxborderw: 16, x: "(w-text_w)/2", y: "(h-text_h)/2" }),
        "-frames:v", "1", out,
      ],
    },
  ];

  for (const job of jobs) {
    const out = path.join(outDir, job.name);
    if (!force && fs.existsSync(out) && fs.statSync(out).size > 0) {
      console.log(`skip   ${job.name} (exists; use --force to regenerate)`);
      continue;
    }
    run(job.args(out), job.name);
    console.log(`wrote  ${job.name}`);
  }

  console.log(`\nFixtures in ${outDir}:`);
  for (const job of jobs) {
    const out = path.join(outDir, job.name);
    const size = fs.statSync(out).size;
    const info = probe(out);
    let desc = "";
    if (info) {
      const dur = info.format && info.format.duration ? `${Number(info.format.duration).toFixed(3)} s` : "";
      const streams = (info.streams || []).map((s) => s.codec_type === "video"
        ? `video ${s.width}x${s.height} @ ${s.r_frame_rate}`
        : `audio ${s.sample_rate} Hz`).join(", ");
      desc = `${dur} ${streams}`.trim();
    }
    console.log(`  ${job.name.padEnd(14)} ${String(size).padStart(10)} bytes  ${desc}`);
  }
}

main();
