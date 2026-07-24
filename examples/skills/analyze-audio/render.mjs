#!/usr/bin/env node

// render.mjs — get audio OUT of Ableton Live so it can be analyzed.
//
// Renders the Main mix OR any single track via File ▸ Export Audio/Video (⇧⌘R),
// driving the dialog with AppleScript (macOS only). It's automatable because
// every Export-dialog control exposes a stable AX `description`, and the
// Rendered Track pop-up is set by type-to-select.
//
// The render range is the whole arrangement: we focus the Arrangement view
// (Option-2) and Select All (⌘A), which sets the dialog's Render Start/Length
// automatically (those number boxes aren't otherwise settable via AX).
//
// Filenames: we do NOT type into the save panel (reliably replacing its field
// is fragile — a track export pre-fills the track name). Instead we render into
// a fresh, empty temp dir via the panel's Go-to-Folder (⌘⇧G) and let Live use
// its default name, then find the render by extension and rename it cleanly.
//
// Non-destructive: Export never alters the Set. Output is MP3 (small enough to
// send to an audio LLM inline). Because the dialog also honors its PCM setting,
// a .wav/.aiff/.flac twin is usually produced alongside the .mp3 — every file is
// reported so the caller can clean them all up.
//
// RELIABILITY: never sleep-and-hope. We fire the UI, then POLL for an .mp3
// appearing in the temp dir and its size stabilizing (offline render of unknown
// duration). Reading the Export dialog uses DIRECT navigation of "group 1"
// (its "entire contents" intermittently returns an empty tree).
//
// PREREQUISITE: the app running this (Terminal / your agent host) needs
// Accessibility permission — System Settings ▸ Privacy & Security ▸ Accessibility.
// English Live UI and default shortcuts are assumed.
//
// Usage:
//   node render.mjs                          # whole mix (Main) → temp .mp3
//   node render.mjs --track "Bass"           # one track by name → temp .mp3
//   node render.mjs --out ~/renders          # move the files into a chosen dir
//
// Prints JSON on stdout: {"audio":"<path.mp3>","created":["<path.mp3>", ...]}.
// Status/progress → stderr.

import { execFile } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROCESS = "Live"; // System Events process name for Ableton Live

// --- CLI ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};

async function main() {
  const track = opt("--track", "Main"); // "Main" = full mix, or a track name
  const outDir = opt("--out"); // omit → leave the files in the temp dir
  const result = await renderAudio({ track, outDir });
  process.stdout.write(JSON.stringify(result) + "\n");
}

/**
 * Render the Main mix or one track to an .mp3 and report every file produced.
 * @param {object} o - Options.
 * @param {string} o.track - Rendered Track value: "Main" or a track name.
 * @param {string} [o.outDir] - Directory to move the render into; omit to leave
 *   it in a temp dir.
 * @returns {Promise<{audio: string, created: string[]}>} The .mp3 path plus all
 *   rendered files (for cleanup).
 */
async function renderAudio({ track, outDir }) {
  // Always render into a fresh, empty temp dir so Live's default filename can't
  // collide (which would pop a "Replace?" sheet) and so the .mp3 is trivially
  // found by extension afterward.
  const tmp = mkdtempSync(join(tmpdir(), "ppal-render-"));
  const label = track === "Main" ? "the Main mix" : `track "${track}"`;
  process.stderr.write(`Exporting ${label}…\n`);
  await runAppleScript(buildExportScript({ track, dir: tmp }));

  process.stderr.write(`Rendering (polling for the .mp3)…\n`);
  await pollForMp3(tmp);

  // Rename Live's default-named files to a clean, unique base, moving them to
  // outDir if requested. The PCM twin (.wav/.aiff/.flac) rides along by stem.
  const destDir = outDir ? resolve(outDir) : tmp;
  if (outDir) mkdirSync(destDir, { recursive: true });
  const base = `ppal-${slug(track)}-${stamp()}`;
  const created = [];
  let audio;
  for (const f of readdirSync(tmp)) {
    const ext = extname(f);
    const dest = join(destDir, base + ext);
    moveFile(join(tmp, f), dest);
    created.push(dest);
    if (ext.toLowerCase() === ".mp3") audio = dest;
  }
  if (outDir) rmSync(tmp, { recursive: true, force: true });
  if (!audio) throw new Error("Export finished but produced no .mp3");
  return { audio, created };
}

/**
 * Build the AppleScript that focuses the Arrangement, selects all, opens the
 * Export dialog, configures it (Rendered Track, MP3 on, distracting toggles
 * off), commits, and drives the macOS save panel to `dir` (default filename).
 *
 * Grounded in live AX inspection of Live 12's Export dialog: controls live in
 * "group 1" with stable `description`s (read by direct navigation — "entire
 * contents" is flaky); the Rendered Track pop-up ignores "set value" and its
 * menu isn't AX-navigable, so it's set by click + type-to-select; the save
 * panel is a separate "Save" window whose Save button is nested (Return, the
 * default button, commits).
 * @param {object} o - Options.
 * @param {string} o.track - Rendered Track value ("Main" or a track name).
 * @param {string} o.dir - Absolute output directory (fresh/empty).
 * @returns {string} The AppleScript source.
 */
function buildExportScript({ track, dir }) {
  return `
    tell application "System Events"
      tell process "${PROCESS}"
        set frontmost to true
        delay 0.3
        -- Dismiss any Export dialog already open (else ⇧⌘R hits a stale window).
        repeat 4 times
          set isOpen to false
          repeat with w in windows
            if name of w contains "Export" then set isOpen to true
          end repeat
          if isOpen then
            key code 53
            delay 0.3
          else
            exit repeat
          end if
        end repeat
        -- Whole-arrangement range: focus Arrangement (⌥2) then Select All (⌘A).
        keystroke "2" using option down
        delay 0.3
        keystroke "a" using command down
        delay 0.3
        -- Open the Export dialog and wait for it to exist.
        keystroke "r" using {command down, shift down}
        set appeared to false
        repeat 40 times
          if (exists (first window whose name contains "Export")) then
            set appeared to true
            exit repeat
          end if
          delay 0.25
        end repeat
        if not appeared then error "Export dialog did not appear"
        set frontmost to true
        delay 0.5

        -- Every control lives in "group 1" of the dialog. Read by DIRECT
        -- navigation — "entire contents" intermittently returns an empty tree.
        -- Retry: the group populates lazily just after the dialog opens.
        set trackPop to missing value
        repeat 20 times
          try
            repeat with p in (pop up buttons of group 1 of (first window whose name contains "Export"))
              if (description of p is "Rendered Track Chooser") then set trackPop to p
            end repeat
          end try
          if trackPop is not missing value then exit repeat
          delay 0.3
        end repeat
        if trackPop is missing value then error "Rendered Track control not found"

        -- Rendered Track -> ${track}. "set value" is a no-op and the menu is not
        -- AX-navigable, so: click to open, type-to-select, Return. Verify + retry
        -- (a mistimed open would otherwise proceed with the wrong track).
        repeat 4 times
          if (value of trackPop as text) is ${as(track)} then exit repeat
          click trackPop
          delay 0.6
          keystroke ${as(track)}
          delay 0.5
          keystroke return
          delay 0.5
        end repeat
        if (value of trackPop as text) is not ${as(track)} then error "Could not set Rendered Track to ${track}"

        -- MP3 on; distracting options off (idempotent: click only to change).
        -- Grab the Export button in the same pass over group 1's buttons.
        set offList to {"Render as Loop", "Convert to Mono", "Normalize", "Create Analysis File", "Create Video with Rendered Audio"}
        set exportBtn to missing value
        repeat with b in (buttons of group 1 of (first window whose name contains "Export"))
          try
            set d to description of b
            if offList contains d then
              if (value of b as text) is "On" then click b
            else if d is "Encode MP3" then
              if (value of b as text) is "Off" then click b
            else if d is "Export" then
              set exportBtn to b
            end if
          end try
        end repeat
        delay 0.2

        -- Commit via the Export button.
        if exportBtn is missing value then error "Export button not found"
        click exportBtn

        -- Drive the standard macOS save panel (a separate window named "Save").
        set panel to missing value
        repeat 60 times
          repeat with w in windows
            if name of w is "Save" then set panel to w
          end repeat
          if panel is not missing value then exit repeat
          delay 0.25
        end repeat
        if panel is missing value then error "Save panel did not appear"
        delay 0.5
        -- Navigate to our empty temp folder and save with Live's default name
        -- (no filename typing — the caller finds the render by extension there).
        keystroke "g" using {command down, shift down}
        delay 0.7
        keystroke ${as(dir)}
        delay 0.5
        keystroke return
        delay 0.7
        keystroke return
      end tell
    end tell
    return "ok"
  `;
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
 * Poll a directory until an .mp3 appears and its size is stable across two
 * consecutive checks (the offline render writes for an unknown duration).
 * @param {string} dir - Directory to watch.
 * @param {object} [o] - Options.
 * @param {number} [o.timeoutMs] - Overall timeout.
 * @param {number} [o.intervalMs] - Poll interval.
 * @returns {Promise<string>} Absolute path of the stable .mp3.
 */
async function pollForMp3(dir, { timeoutMs = 300_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    const mp3 = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".mp3"));
    if (mp3 != null) {
      const size = statSync(join(dir, mp3)).size;
      if (size > 0 && size === lastSize) return join(dir, mp3);
      lastSize = size;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for an .mp3 in ${dir}`);
}

/**
 * Move a file, falling back to copy+delete across filesystems (temp dir → an
 * --out dir on another volume would make a plain rename fail with EXDEV).
 * @param {string} src - Source path.
 * @param {string} dest - Destination path.
 * @returns {void}
 */
function moveFile(src, dest) {
  try {
    renameSync(src, dest);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    copyFileSync(src, dest);
    rmSync(src, { force: true });
  }
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
 * @returns {string} e.g. "2026-07-24T18-04-05-123Z".
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
