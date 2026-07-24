#!/usr/bin/env node

// render.mjs — get audio OUT of Ableton Live so it can be analyzed.
//
// Two modes (both drive Live's menus/dialogs via AppleScript — macOS only):
//   export  File ▸ Export Audio/Video (⇧⌘R): render the Main mix or one track
//           over a time range to a .wav you name. Offline (faster-than-realtime).
//   bounce  Edit ▸ Bounce to New Track (⌘B): bounce the selected clip to a new
//           audio track that stays in the Set (optionally deleted after).
//
// RELIABILITY PRINCIPLE — never sleep-and-hope. We fire the UI, then POLL for the
// completion ARTIFACT: the .wav appearing+stabilizing on disk (export), or a new
// track appearing via Producer Pal (bounce). This is what makes an offline render
// of unknown duration safe to wait on.
//
// PREREQUISITE: the app running this (Terminal / your agent host) needs
// Accessibility permission — System Settings ▸ Privacy & Security ▸ Accessibility.
//
// Usage:
//   node render.mjs --mode export --out ~/renders                       # current dialog settings
//   node render.mjs --mode export --track Main --start 1.1.1 --length 4.0.0 --out ~/renders
//   node render.mjs --mode bounce [--cleanup]                           # bounce the selected clip
//
// Prints the absolute .wav path on stdout. Status/progress → stderr.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROCESS = "Live"; // System Events process name for Ableton Live

// --- CLI ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(name);

async function main() {
  const mode = opt("--mode", "export");
  if (mode === "export") {
    const out = await exportAudio({
      track: opt("--track"), // e.g. "Main" or a track name; omit to keep dialog's setting
      start: opt("--start"), // bar.beat.sixteenth, e.g. "1.1.1"; omit to keep setting
      length: opt("--length"), // bar.beat.sixteenth, e.g. "4.0.0"; omit to keep setting
      outDir: resolve(opt("--out", "./renders")),
      filename: opt("--name"), // optional explicit filename; default is unique
    });
    process.stdout.write(out + "\n");
  } else if (mode === "bounce") {
    const out = await bounceClip({ cleanup: flag("--cleanup") });
    process.stdout.write(out + "\n");
  } else {
    throw new Error(`Unknown --mode ${mode} (expected "export" or "bounce")`);
  }
}

// --- Export Audio/Video ------------------------------------------------------

/**
 * Render the Main mix or a single track to a .wav via File ▸ Export Audio/Video.
 * @param {object} o - Options.
 * @param {string} [o.track] - Rendered Track value (e.g. "Main" or a track name).
 * @param {string} [o.start] - Render Start (advisory — see note in body).
 * @param {string} [o.length] - Render Length (advisory — see note in body).
 * @param {string} o.outDir - Directory to write the .wav into.
 * @param {string} [o.filename] - Explicit output filename; defaults to a unique name.
 * @returns {Promise<string>} Absolute path of the rendered .wav.
 */
async function exportAudio({ track, start, length, outDir, filename }) {
  mkdirSync(outDir, { recursive: true });
  if (start || length) {
    // Verified via AX inspection: the Render Start/Length number boxes are NOT
    // exposed as accessible controls, so they can't be set from here. The render
    // range is whatever is currently selected/looped in the Arrangement.
    process.stderr.write(
      "Note: --start/--length can't be set through the Export dialog (its number " +
        "boxes aren't accessible). Select the range in Live's Arrangement first; " +
        "rendering uses the current selection/loop.\n",
    );
  }
  const name = filename ?? `ppal-export-${slug(track ?? "mix")}-${stamp()}.wav`;
  const outFile = resolve(outDir, name);
  if (existsSync(outFile)) {
    // A unique name normally avoids the macOS "Replace?" sheet; bail rather than
    // risk a modal we don't drive.
    throw new Error(`Output already exists, refusing to overwrite: ${outFile}`);
  }

  process.stderr.write(`Opening Export dialog…\n`);
  await runAppleScript(buildExportScript({ track, outFile }));

  process.stderr.write(`Rendering (polling for ${name})…\n`);
  await pollForStableFile(outFile);
  return outFile;
}

/**
 * Build the AppleScript that drives the Export dialog and the macOS save panel.
 *
 * Grounded in an AX inspection of Live 12's dialog: its controls have NO
 * accessible names, so we address the Rendered Track pop-up by index (it's the
 * first pop-up button) and commit with Return (the default button) rather than
 * clicking "Export" by name. The Render Start/Length boxes aren't accessible at
 * all — range comes from the Arrangement selection (see exportAudio). From the
 * save panel on it's the STANDARD macOS panel (⌘⇧G + filename + Save).
 * @param {object} o - Options.
 * @param {string} [o.track] - Rendered Track value (e.g. "Main" or a track name).
 * @param {string} o.outFile - Absolute output path.
 * @returns {string} The AppleScript source.
 */
function buildExportScript({ track, outFile }) {
  const dir = dirname(outFile);
  const base = basename(outFile);

  // Rendered Track is the first pop-up button (controls are unnamed → by index).
  const setTrack = track
    ? `
      try
        click pop up button 1 of exportWin
        delay 0.2
        click menu item ${as(track)} of menu 1 of pop up button 1 of exportWin
        delay 0.2
      end try`
    : "";

  return `
    tell application "System Events"
      tell process "${PROCESS}"
        set frontmost to true
        delay 0.3
        keystroke "r" using {command down, shift down}

        -- Wait for the Export dialog (window titled "Export…", subrole AXDialog).
        set exportWin to missing value
        repeat 40 times
          repeat with w in windows
            if name of w contains "Export" then
              set exportWin to contents of w
              exit repeat
            end if
          end repeat
          if exportWin is not missing value then exit repeat
          delay 0.25
        end repeat
        if exportWin is missing value then error "Export dialog did not appear"
        ${setTrack}

        -- Commit via the default button (Export). The dialog's buttons have no
        -- accessible names, so we press Return instead of clicking by name.
        keystroke return

        -- Wait for the standard macOS save panel (exposes a named "Save" button).
        set savePanel to missing value
        repeat 40 times
          repeat with w in windows
            if exists (button "Save" of w) then
              set savePanel to contents of w
              exit repeat
            end if
          end repeat
          if savePanel is not missing value then exit repeat
          delay 0.25
        end repeat
        if savePanel is missing value then error "Save panel did not appear"

        -- The Save As field is focused with the default name selected: type ours.
        keystroke ${as(base)}
        delay 0.2
        -- Go to folder: ⌘⇧G, type the absolute directory, confirm.
        keystroke "g" using {command down, shift down}
        delay 0.5
        keystroke ${as(dir)}
        delay 0.3
        keystroke return
        delay 0.5
        -- Save (named button on the standard panel; Return as a fallback).
        try
          click button "Save" of savePanel
        on error
          keystroke return
        end try
      end tell
    end tell
    return "ok"
  `;
}

// --- Bounce to New Track -----------------------------------------------------

/**
 * Bounce the currently selected clip to a new audio track via Edit ▸ Bounce to
 * New Track (⌘B), poll Producer Pal for the new track, and report its audio
 * file. Requires Ableton Live running with the Producer Pal device and the
 * TARGET CLIP already selected in Live (e.g. you just created/selected it).
 *
 * VERIFY-FIRST: bounce render mode (offline vs realtime) and the exact clip vs
 * track vs time-selection scope of ⌘B want a live spike; the poll-for-new-track
 * completion signal below is robust regardless of duration.
 * @param {object} o - Options.
 * @param {boolean} o.cleanup - Delete the created audio track after reporting it.
 * @returns {Promise<string>} The bounced audio clip's file_path (or a note if unresolved).
 */
async function bounceClip({ cleanup }) {
  const { callTool } = await import(
    new URL("../producer-pal/ppal.mjs", import.meta.url)
  );

  const before = await trackCount(callTool);
  process.stderr.write(
    `Bouncing selected clip (⌘B); ${before} tracks before…\n`,
  );
  await runAppleScript(`
    tell application "System Events"
      tell process "${PROCESS}"
        set frontmost to true
        delay 0.3
        keystroke "b" using {command down}
      end tell
    end tell
    return "ok"
  `);

  // Poll for the new track (offline or realtime — duration-agnostic).
  const deadline = Date.now() + 120_000;
  let after = before;
  while (Date.now() < deadline) {
    after = await trackCount(callTool);
    if (after > before) break;
    await sleep(500);
  }
  if (after <= before)
    throw new Error("No new track appeared after ⌘B (timed out)");

  const newIndex = after - 1; // Bounce to New Track appends the audio track.
  const track = await readTrack(callTool, newIndex);
  const filePath = await clipFilePath(callTool, track);
  process.stderr.write(
    `New audio track "${track?.name}" at index ${newIndex} (id ${track?.id}).\n`,
  );

  if (cleanup && track?.id != null) {
    process.stderr.write(`Cleaning up track id ${track.id}…\n`);
    await callTool("ppal-delete", {
      ids: String(track.id),
      type: "track",
    }).catch((e) => process.stderr.write(`Cleanup skipped: ${e.message}\n`));
  }

  return (
    filePath ??
    `<unresolved: read the sample file path of a clip on track index ${newIndex}>`
  );
}

/**
 * Count regular (audio/MIDI) tracks in the current Live Set.
 * @param {Function} callTool - The ppal callTool function.
 * @returns {Promise<number>} The regular track count.
 */
async function trackCount(callTool) {
  const { result } = await callTool("ppal-read-live-set");
  return result?.regularTrackCount ?? 0;
}

/**
 * Read a track (with its arrangement clips) by index.
 * @param {Function} callTool - The ppal callTool function.
 * @param {number} trackIndex - 0-based track index.
 * @returns {Promise<object|null>} The track object, or null.
 */
async function readTrack(callTool, trackIndex) {
  const { result } = await callTool("ppal-read-track", {
    trackIndex,
    include: ["arrangement-clips"],
  });
  return result ?? null;
}

/**
 * Resolve the audio file backing a track's first arrangement clip.
 * @param {Function} callTool - The ppal callTool function.
 * @param {object|null} track - A track object from readTrack().
 * @returns {Promise<string|null>} The clip's sample file path, or null.
 */
async function clipFilePath(callTool, track) {
  const clip = track?.arrangementClips?.[0];
  if (clip?.id == null) return null;
  try {
    const { result } = await callTool("ppal-read-clip", {
      clipId: String(clip.id),
      include: ["sample"],
    });
    // The audio path may surface under a few keys depending on ppal version.
    return (
      result?.filePath ??
      result?.file_path ??
      result?.sample?.filePath ??
      result?.sample?.path ??
      null
    );
  } catch {
    return null;
  }
}

// --- shared helpers ----------------------------------------------------------

/**
 * Run an AppleScript source string via `osascript -e`.
 * @param {string} script - AppleScript source.
 * @returns {Promise<string>} Trimmed stdout.
 */
async function runAppleScript(script) {
  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  return stdout.trim();
}

/**
 * Poll until a file exists and its size is stable across two consecutive checks
 * (Live writes the .wav, then an .asd analysis sidecar — size settles first).
 * @param {string} path - Absolute file path to watch.
 * @param {object} [o] - Options.
 * @param {number} [o.timeoutMs] - Overall timeout.
 * @param {number} [o.intervalMs] - Poll interval.
 * @returns {Promise<void>} Resolves once the file is present and stable.
 */
async function pollForStableFile(
  path,
  { timeoutMs = 300_000, intervalMs = 500 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const size = statSync(path).size;
      if (size > 0 && size === lastSize) return;
      lastSize = size;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${path}`);
}

/**
 * Escape a JS string as an AppleScript double-quoted string literal.
 * @param {string} s - Raw string.
 * @returns {string} AppleScript literal, including surrounding quotes.
 */
function as(s) {
  return '"' + String(s).replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
}

/**
 * A filesystem-safe slug for filenames.
 * @param {string} s - Raw string.
 * @returns {string} Slugified string.
 */
function slug(s) {
  return String(s)
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * A filename-safe timestamp (colons/dots replaced) for unique output names.
 * @returns {string} e.g. "2026-07-23T18-04-05-123Z".
 */
function stamp() {
  return new Date().toISOString().replaceAll(/[:.]/g, "-");
}

/**
 * Promise-based sleep.
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>} Resolves after the delay.
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

try {
  await main();
} catch (err) {
  process.stderr.write(`Error: ${err.message ?? err}\n`);
  process.exit(1);
}
