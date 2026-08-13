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
// automatically (those number boxes aren't otherwise settable via AX). EVERY
// render therefore spans the whole timeline, whatever is being rendered: a
// track that plays only in the last chorus, or a short Session clip, comes back
// mostly silent. Harmless (silence costs almost nothing as MP3), but the file's
// duration is the arrangement's, not the material's.
//
// SESSION CLIPS (--session <sceneIndex>): Export only ever renders the
// arrangement, so a Session clip has to get there first. We duplicate the track
// (a temp copy — the user's own track is never modified), delete the copy's
// inherited arrangement clips, duplicate the wanted Session clip to 1|1, render
// the copy by name, then delete it in a `finally`. This half needs Producer Pal
// running (REST on :3350); the rest of the script needs only Live.
//
// One clip per render, deliberately: several clips laid end to end would leave
// the analysis no way to tell which audio came from which clip. To do a few,
// call this script once per clip.
//
// Filenames: we do NOT type into the save panel (reliably replacing its field
// is fragile — a track export pre-fills the track name). Instead we render into
// a fresh, empty temp dir via the panel's Go-to-Folder (⌘⇧G) and let Live use
// its default name, then find the render by extension and rename it cleanly.
//
// Non-destructive: Export never alters the Set, and the --session temp track is
// always deleted again. Output is MP3 only (small enough to send to an audio LLM
// inline) — Encode PCM is forced off, so Live's lossless twin isn't written.
// Every file produced is still reported, so the caller can clean them all up.
//
// Export settings are STICKY across runs, so every toggle is forced rather than
// read: an option the user last set by hand would otherwise change the render.
// Tracks render dry unless --with-returns (Include Return and Main Effects).
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
//   node render.mjs --track "Drums" --session 0   # its Session clip in scene 0
//   node render.mjs --track "Bass" --with-returns # include send/master effects
//   node render.mjs --out ~/renders          # move the files into a chosen dir
//
// Prints JSON on stdout: {"audio":"<path.mp3>","created":["<path.mp3>", ...]}.
// Status/progress → stderr.

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
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
const PPAL_API = `http://localhost:${process.env.PPAL_PORT ?? 3350}/api/tools`;
// The Rendered Track pop-up is matched by NAME, so the temp copy must not
// collide with a real track — two identical entries make the choice ambiguous.
// The random suffix matters for more than that: cleanup DELETES every track
// matching TEMP_TRACK_RE without asking, so the pattern has to be one no human
// would name a track.
const TEMP_PREFIX = "PPAL-RENDER-TEMP-";
const TEMP_TRACK_RE = /^PPAL-RENDER-TEMP-[0-9a-f]{6}$/;

// --- CLI ---------------------------------------------------------------------

const argv = process.argv.slice(2);
// A flag with no value (last token, or followed by another --flag) is a
// malformed invocation, not a request for the default — throw rather than hand
// back undefined. main()'s catch turns this into a clean stderr line + exit 1.
const opt = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  if (v == null || v.startsWith("--"))
    throw new Error(`Missing value for ${name}`);
  return v;
};
const flag = (name) => argv.includes(name); // valueless on/off switch

async function main() {
  const track = opt("--track", "Main"); // "Main" = full mix, or a track name
  const outDir = opt("--out"); // omit → leave the files in the temp dir
  const scene = opt("--session"); // omit → render the arrangement as it stands
  const withReturns = flag("--with-returns"); // default: dry, like Live's own
  if (scene != null && !argv.includes("--track"))
    throw new Error(
      "--session needs --track <name> (Main has no Session clips)",
    );
  const result =
    scene == null
      ? await renderAudio({ track, outDir, withReturns })
      : await renderSessionClip({
          track,
          scene: sceneIndex(scene),
          outDir,
          withReturns,
        });
  process.stdout.write(JSON.stringify(result) + "\n");
}

/**
 * Parse and validate a --session value as a 0-based scene index.
 * @param {string} value - Raw flag value.
 * @returns {number} The scene index.
 */
function sceneIndex(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`--session needs a 0-based scene index, got "${value}"`);
  return n;
}

/**
 * Render the Main mix or one track to an .mp3 and report every file produced.
 * @param {object} o - Options.
 * @param {string} o.track - Rendered Track value: "Main" or a track name.
 * @param {string} [o.outDir] - Directory to move the render into; omit to leave
 *   it in a temp dir.
 * @param {string} [o.label] - Name used in the output filename. Defaults to
 *   `track`; a Session render passes the real track name so the file isn't
 *   named after the throwaway temp track.
 * @param {boolean} [o.withReturns] - Include Return and Main Effects. Off gives
 *   the dry track; on gives it as heard in the mix, sends and master included.
 * @returns {Promise<{audio: string, created: string[]}>} The .mp3 path plus all
 *   rendered files (for cleanup).
 */
async function renderAudio({ track, outDir, label = track, withReturns }) {
  // Always render into a fresh, empty temp dir so Live's default filename can't
  // collide (which would pop a "Replace?" sheet) and so the .mp3 is trivially
  // found by extension afterward.
  const tmp = mkdtempSync(join(tmpdir(), "ppal-render-"));
  const what = track === "Main" ? "the Main mix" : `track "${track}"`;
  process.stderr.write(`Exporting ${what}…\n`);
  await runAppleScript(buildExportScript({ track, dir: tmp, withReturns }));

  process.stderr.write(`Rendering (polling for the .mp3)…\n`);
  await pollForMp3(tmp);

  // Rename Live's default-named files to a clean, unique base, moving them to
  // outDir if requested. The PCM twin (.wav/.aiff/.flac) rides along by stem.
  const destDir = outDir ? resolve(outDir) : tmp;
  if (outDir) mkdirSync(destDir, { recursive: true });
  const base = `ppal-${slug(label)}-${stamp()}`;
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
 * Render one Session clip by staging it in the arrangement on a temp copy of
 * its track, so the user's own track is never modified.
 *
 * Export can only render the arrangement, and a clip can only be duplicated to
 * the arrangement of the track it already lives on — hence the track copy. The
 * copy inherits the source's arrangement clips, which would render alongside
 * the clip we want, so those are deleted first.
 * @param {object} o - Options.
 * @param {string} o.track - Name of the track holding the Session clip.
 * @param {number} o.scene - 0-based scene index of the clip to render.
 * @param {string} [o.outDir] - Directory to move the render into.
 * @param {boolean} [o.withReturns] - Passed through to `renderAudio`.
 * @returns {Promise<{audio: string, created: string[]}>} As `renderAudio`.
 */
async function renderSessionClip({ track, scene, outDir, withReturns }) {
  await removeTempTracks(); // a crashed earlier run could have left one behind
  const source = await findTrackByName(track);
  const tempName = TEMP_PREFIX + randomBytes(3).toString("hex");
  process.stderr.write(`Staging "${track}" scene ${scene} for render…\n`);
  const temp = await ppal("ppal-duplicate", {
    id: source.id,
    type: "track",
    name: tempName,
  });
  try {
    const copy = await ppal("ppal-read-track", {
      trackIndex: temp.trackIndex,
      include: ["session-clips", "arrangement-clips"],
    });
    const inherited = (copy.arrangementClips ?? []).map((c) => c.id).join(",");
    if (inherited) await ppal("ppal-delete", { ids: inherited, type: "clip" });

    const clip = (copy.sessionClips ?? []).find(
      (c) => Number(c.slot.split("/")[1]) === scene,
    );
    if (clip == null)
      throw new Error(`Track "${track}" has no Session clip in scene ${scene}`);
    await ppal("ppal-duplicate", {
      id: clip.id,
      type: "clip",
      arrangementStart: "1|1",
    });

    return await renderAudio({
      track: tempName,
      outDir,
      label: `${track}-scene${scene}`,
      withReturns,
    });
  } finally {
    // Never let cleanup mask a render error — warn instead of throwing, so a
    // leftover track is visible rather than silent.
    await removeTempTracks().catch((err) =>
      process.stderr.write(
        `Warning: could not delete the temp track "${tempName}": ${err.message}\n`,
      ),
    );
  }
}

/**
 * Delete every track whose name matches `TEMP_TRACK_RE` — ours, plus any left
 * behind by a run that crashed before its `finally`.
 * @returns {Promise<void>} Resolves once they're gone.
 */
async function removeTempTracks() {
  const { tracks = [] } = await ppal("ppal-read-live-set", {
    include: ["tracks"],
  });
  const ids = tracks.filter((t) => TEMP_TRACK_RE.test(t.name)).map((t) => t.id);
  if (ids.length > 0)
    await ppal("ppal-delete", { ids: ids.join(","), type: "track" });
}

/**
 * Look up a regular (audio/MIDI) track by exact name.
 * @param {string} name - Track name.
 * @returns {Promise<object>} The track overview object.
 */
async function findTrackByName(name) {
  const { tracks = [] } = await ppal("ppal-read-live-set", {
    include: ["tracks"],
  });
  const track = tracks.find((t) => t.name === name);
  if (track == null)
    throw new Error(
      `No track named "${name}". Tracks: ${tracks.map((t) => t.name).join(", ")}`,
    );
  return track;
}

/**
 * Call a Producer Pal tool over its REST API.
 * @param {string} tool - Tool name, e.g. "ppal-read-track".
 * @param {object} args - Tool arguments.
 * @returns {Promise<any>} The tool's result.
 */
async function ppal(tool, args) {
  let res;
  try {
    res = await fetch(`${PPAL_API}/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch (err) {
    throw new Error(
      `Can't reach Producer Pal at ${PPAL_API} — is the device loaded in Live?`,
      { cause: err },
    );
  }
  if (!res.ok) throw new Error(`${tool} failed: HTTP ${res.status}`);
  const { result, isError } = await res.json();
  if (isError) throw new Error(`${tool} failed: ${JSON.stringify(result)}`);
  return result;
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
 * Every toggle is forced to a known state, never left as the user last had it —
 * these settings are sticky across exports, so an unforced one silently changes
 * what you get.
 * @param {object} o - Options.
 * @param {string} o.track - Rendered Track value ("Main" or a track name).
 * @param {string} o.dir - Absolute output directory (fresh/empty).
 * @param {boolean} [o.withReturns] - Include Return and Main Effects.
 * @returns {string} The AppleScript source.
 */
function buildExportScript({ track, dir, withReturns }) {
  const returns = "Include Return and Main Effects";
  // Encode PCM off: nothing uses the .aif/.wav twin, and it's ~7x the MP3.
  const offList = [
    "Render as Loop",
    "Convert to Mono",
    "Normalize",
    "Create Analysis File",
    "Create Video with Rendered Audio",
    "Encode PCM",
    ...(withReturns ? [] : [returns]),
  ];
  const onList = ["Encode MP3", ...(withReturns ? [returns] : [])];
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

        -- Pick the Rendered Track. "set value" is a no-op and the menu is not
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
        if (value of trackPop as text) is not ${as(track)} then error "Could not set Rendered Track to " & ${as(track)}

        -- Force every toggle (idempotent: click only to change). These are
        -- sticky across exports, so an unforced one silently changes the render.
        -- Grab the Export button in the same pass over group 1's buttons.
        set offList to ${asList(offList)}
        set onList to ${asList(onList)}
        set exportBtn to missing value
        repeat with b in (buttons of group 1 of (first window whose name contains "Export"))
          try
            set d to description of b
            if offList contains d then
              if (value of b as text) is "On" then click b
            else if onList contains d then
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
${buildSavePanelScript(dir)}
      end tell
    end tell
    return "ok"
  `;
}

/**
 * The AppleScript fragment that drives the macOS save panel — a separate window
 * named "Save", reached after the Export button commits.
 *
 * We navigate to an empty temp folder via Go-to-Folder (⌘⇧G) and accept Live's
 * default filename rather than typing one: the field is pre-filled differently
 * for track vs Main exports, and replacing it reliably is fragile. The caller
 * finds the render by extension instead.
 * @param {string} dir - Absolute output directory (fresh/empty).
 * @returns {string} The AppleScript fragment.
 */
function buildSavePanelScript(dir) {
  return `
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
        keystroke "g" using {command down, shift down}
        delay 0.7
        keystroke ${as(dir)}
        delay 0.5
        keystroke return
        delay 0.7
        keystroke return`;
}

/**
 * Render a JS string array as an AppleScript list literal.
 * @param {string[]} items - Strings to include.
 * @returns {string} e.g. `{"a", "b"}`.
 */
function asList(items) {
  return `{${items.map(as).join(", ")}}`;
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
