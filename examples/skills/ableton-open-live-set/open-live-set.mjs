#!/usr/bin/env node

// open-live-set.mjs — open a Live Set (.als) in Ableton Live and wait until it
// has loaded, answering the dialogs in the way. macOS only.
//
// Safe by default: an unsaved-changes prompt is cancelled (nothing opens) and a
// crash-recovery prompt is left up for the user. Only --discard-unsaved and
// --discard-recovery throw work away.
//
// `open -g` keeps Live in the background: a focused Live would take the user's
// own typing, and Return answers a dialog.
//
// Live windows expose no file path, only a title (the file name without .als),
// so "loaded" means: the old Set's Producer Pal server went away (if one was
// up), then a window shows the new name.
//
// PREREQUISITE: Accessibility permission for the app running this (System
// Settings ▸ Privacy & Security ▸ Accessibility). English Live UI assumed.
//
// Usage:
//   node open-live-set.mjs "My Song Project/My Song.als"
//   node open-live-set.mjs song.als --discard-unsaved   # only if the user agreed
//
// Prints JSON on stdout: {"opened":"<path>","producerPal":true,"dismissed":[]}.
// Status/progress → stderr.

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { get } from "node:http";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROCESS = "Live"; // System Events process name for Ableton Live
const PPAL_CONFIG = `http://localhost:${process.env.PPAL_PORT ?? 3350}/config`;
const POLL_MS = 250;
// Live can re-instantiate the device right after a load, so one answer can be
// the old device's last. Two in a row counts as up.
const READY_STREAK = 2;
const PPAL_START_MS = 15_000;

// --- CLI ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const VALUE_OPTIONS = new Set(["--app", "--timeout"]);
// A flag with no value is a malformed invocation, not a request for the default.
const opt = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) {
    return def;
  }
  const v = argv[i + 1];
  if (v == null || v.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return v;
};
const flag = (name) => argv.includes(name); // valueless on/off switch

const USAGE = `Usage: node open-live-set.mjs <path.als> [options]

  --discard-unsaved    click Don't Save if the open Set has unsaved changes
                       (default: cancel, open nothing)
  --discard-recovery   click No if Live offers to recover work after a crash
                       (default: leave the dialog up and stop)
  --app <name|path>    Live app to open it with (default: the running Live,
                       else the default app for .als files)
  --timeout <seconds>  give up after this long (default: 120)
  --help, -h           show this help

Prints {"opened": "<path>", "producerPal": true|false, "dismissed": [...]} on
stdout. macOS only. Both --discard flags throw work away: ask the user first.`;

async function main() {
  if (flag("--help") || flag("-h")) {
    console.log(USAGE);
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("macOS only: this drives Live's dialogs with AppleScript");
  }
  const file = setPath();
  const timeoutMs = seconds(opt("--timeout", "120")) * 1000;
  const app = opt("--app");
  const discard = {
    unsaved: flag("--discard-unsaved"),
    recovery: flag("--discard-recovery"),
  };
  await assertAssistiveAccess();
  const result = await openLiveSet({ file, app, timeoutMs, discard });
  process.stdout.write(JSON.stringify(result) + "\n");
}

/**
 * The one positional argument, checked to be an existing .als file.
 * @returns {string} Absolute path to the Set.
 */
function setPath() {
  const paths = argv.filter(
    (a, i) => !a.startsWith("-") && !VALUE_OPTIONS.has(argv[i - 1]),
  );
  if (paths.length === 0) {
    throw new Error(`Missing the .als path\n\n${USAGE}`);
  }
  if (paths.length > 1) {
    throw new Error(`Expected one .als path, got: ${paths.join(", ")}`);
  }
  const file = resolve(paths[0]);
  if (extname(file).toLowerCase() !== ".als") {
    throw new Error(`Not a Live Set (.als): ${file}`);
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`File not found: ${file}`);
  }
  return file;
}

/**
 * Parse and validate a --timeout value.
 * @param {string} value - Raw flag value.
 * @returns {number} Seconds.
 */
function seconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `--timeout needs a positive number of seconds, got "${value}"`,
    );
  }
  return n;
}

/**
 * Fail up front when AppleScript can't drive Live's UI. Without the grant,
 * dialog clicks fail silently and the open just times out.
 * @returns {Promise<void>} Resolves when access is granted.
 */
async function assertAssistiveAccess() {
  // Finder is always running, so this probes the permission, not an app.
  const { error } = await osascript(
    'tell application "System Events" to tell process "Finder" to return count of windows',
  );
  if (error?.includes("not allowed assistive access")) {
    throw new Error(
      "AppleScript is not allowed assistive access, so Live's dialogs can't " +
        "be read or clicked. Grant Accessibility (System Settings → Privacy & " +
        "Security → Accessibility) to the app running the agent, and to " +
        "AEServer if it is listed. Toggle an entry that is already on off and " +
        `back on — the grant goes stale. osascript said: ${error}`,
    );
  }
}

/**
 * Open the Set and wait until Live shows it.
 * @param {object} o - Options.
 * @param {string} o.file - Absolute path to the .als file.
 * @param {string} [o.app] - App name or .app path; omit to choose automatically.
 * @param {number} o.timeoutMs - Time limit for the whole open.
 * @param {{unsaved: boolean, recovery: boolean}} o.discard - What the user
 *   agreed to lose.
 * @returns {Promise<object>} The result printed on stdout.
 */
async function openLiveSet({ file, app, timeoutMs, discard }) {
  const deadline = Date.now() + timeoutMs;
  const name = basename(file, extname(file));
  const titleShows = async () => {
    const titles = await liveWindowTitles();
    return titles.includes(name);
  };
  const wasServing = await ppalAnswers();
  const titleWasShowing = await titleShows();
  const dismissed = new Set();
  const answerDialogs = () => answerDialog(discard, dismissed);
  const timedOut = async (what) =>
    new Error(
      `${what} within ${timeoutMs / 1000}s. ${await describeLiveState()}`,
    );

  const bundle = app ?? (await runningLiveApp());
  const inApp = bundle ? ` in ${bundle}` : "";
  process.stderr.write(`Opening ${file}${inApp}…\n`);
  try {
    await execFileAsync("open", [
      "-g",
      ...(bundle ? ["-a", bundle] : []),
      file,
    ]);
  } catch (err) {
    throw new Error(`open failed: ${err.stderr?.trim() || err.message}`, {
      cause: err,
    });
  }

  // Live keeps the old Set's server up until the swap, so its going away is the
  // sign the old Set let go.
  if (wasServing) {
    process.stderr.write("Waiting for the open Set to close…\n");
    const stopped = async () => !(await ppalAnswers());
    if (!(await poll(stopped, deadline, answerDialogs))) {
      throw await timedOut("Live did not swap Sets");
    }
  }

  process.stderr.write(`Waiting for "${name}" to load…\n`);
  if (!(await poll(titleShows, deadline, answerDialogs))) {
    throw await timedOut(`No Live window showed "${name}"`);
  }

  // Still answers dialogs: when the title was already showing, a save prompt
  // can turn up after the title check passed.
  process.stderr.write("Checking for Producer Pal…\n");
  let streak = 0;
  const ppalUp = async () => {
    streak = (await ppalAnswers()) ? streak + 1 : 0;
    return streak >= READY_STREAK;
  };
  const ppalDeadline = Math.min(deadline, Date.now() + PPAL_START_MS);
  const producerPal = await poll(ppalUp, ppalDeadline, answerDialogs);

  const result = { opened: file, producerPal, dismissed: [...dismissed] };
  if (titleWasShowing && !wasServing) {
    result.warning =
      `A Live window was already titled "${name}" before the open, so the ` +
      "swap couldn't be confirmed.";
  }
  return result;
}

/**
 * The running Live's .app bundle, so the Set lands in that Live rather than
 * whichever installed version macOS prefers for .als files.
 * @returns {Promise<string | undefined>} Bundle path, or undefined if Live
 *   isn't running.
 */
async function runningLiveApp() {
  try {
    const { stdout: pids } = await execFileAsync("pgrep", ["-x", PROCESS]);
    const pid = pids.trim().split("\n")[0];
    const { stdout } = await execFileAsync("ps", ["-o", "comm=", "-p", pid]);
    const exe = stdout.trim();
    const suffix = "/Contents/MacOS/Live";
    return exe.endsWith(suffix) ? exe.slice(0, -suffix.length) : undefined;
  } catch {
    return undefined; // pgrep exits 1 when Live isn't running
  }
}

/**
 * Answer dialogs and run a check every tick until it passes or time runs out.
 * @param {() => Promise<boolean>} check - The condition to wait for.
 * @param {number} until - Deadline (epoch ms).
 * @param {() => Promise<void>} answerDialogs - Runs first on every tick; throws
 *   to stop the wait.
 * @returns {Promise<boolean>} True if the check passed, false on timeout.
 */
async function poll(check, until, answerDialogs) {
  for (;;) {
    await answerDialogs();
    if (await check()) {
      return true;
    }
    if (Date.now() >= until) {
      return false;
    }
    await sleep(POLL_MS);
  }
}

/**
 * Answer the Live dialog on screen, if any. Throws when the user must decide.
 * @param {{unsaved: boolean, recovery: boolean}} discard - What the user agreed
 *   to lose.
 * @param {Set<string>} dismissed - Collects what was clicked away.
 * @returns {Promise<void>} Resolves when nothing needs the user.
 */
async function answerDialog(discard, dismissed) {
  const { output } = await osascript(dialogScript(discard));
  if (output == null) {
    return;
  }
  const [tag, ...lines] = output.split("\n");
  const text = lines.join(" ").trim();
  const said = text ? ` Live says: "${text}"` : "";
  const unsavedAsk =
    "or rerun with --discard-unsaved only if they agree to lose those changes.";

  if (tag === "recovery-no") {
    dismissed.add("crash-recovery");
  } else if (tag === "unsaved-dont-save") {
    dismissed.add("unsaved-changes");
  } else if (tag === "recovery") {
    throw new Error(
      discard.recovery
        ? `Live's crash-recovery dialog is up but its No button wasn't found.${said} Ask the user to answer it in Live, then rerun.`
        : `Live is offering to recover work from a crash, and the dialog is still up.${said} Ask the user to answer it in Live, then rerun, or rerun with --discard-recovery only if they agree to lose that work.`,
    );
  } else if (tag === "unsaved-cancel") {
    const titles = await liveWindowTitles();
    throw new Error(
      `The open Set has unsaved changes, so nothing was opened (clicked Cancel; that Set is untouched).${said} Live windows: ${titles.join(", ")}. Ask the user to save it first, ${unsavedAsk}`,
    );
  } else if (tag === "unsaved") {
    throw new Error(
      `The open Set has unsaved changes, and Live's save dialog is still up (no Cancel button found).${said} Ask the user to answer it in Live, ${unsavedAsk}`,
    );
  } else if (tag === "newer") {
    throw new Error(
      `Live would not open the Set.${said} A Set saved by a newer Live can't be opened by an older one; use --app to open it with a newer Live if one is installed.`,
    );
  }
}

/**
 * The AppleScript that finds a blocking Live dialog and answers it. Returns a
 * tag line plus the dialog's text, or "" when there's nothing to answer.
 *
 * Dialogs are AXDialog windows; buttons in group 1 are named only by
 * `description`. "Don" matches Don't Save without the curly apostrophe.
 * @param {{unsaved: boolean, recovery: boolean}} discard - What may be lost.
 * @returns {string} The AppleScript source.
 */
function dialogScript(discard) {
  return `
    tell application "System Events"
      tell process "${PROCESS}"
        repeat with w in windows
          try
            if subrole of w is "AXDialog" then
              set msg to ""
              try
                repeat with t in static texts of group 1 of w
                  set msg to msg & (value of t) & " "
                end repeat
              end try
              set dontSave to missing value
              set cancelBtn to missing value
              set noBtn to missing value
              repeat with b in buttons of group 1 of w
                set d to ""
                try
                  set d to description of b as text
                end try
                if d starts with "Don" and d ends with "Save" then set dontSave to contents of b
                if d is "Cancel" then set cancelBtn to contents of b
                if d is "No" then set noBtn to contents of b
              end repeat
              if msg contains "recover your work" then
                if ${discard.recovery} and noBtn is not missing value then
                  click noBtn
                  return "recovery-no" & linefeed & msg
                end if
                return "recovery" & linefeed & msg
              else if msg contains "newer version of Live" then
                click button 1 of group 1 of w
                return "newer" & linefeed & msg
              else if dontSave is not missing value then
                if ${discard.unsaved} then
                  click dontSave
                  return "unsaved-dont-save" & linefeed & msg
                else if cancelBtn is not missing value then
                  click cancelBtn
                  return "unsaved-cancel" & linefeed & msg
                end if
                return "unsaved" & linefeed & msg
              end if
            end if
          end try
        end repeat
      end tell
    end tell
    return ""
  `;
}

/**
 * Whether Producer Pal's REST server answers.
 *
 * node:http, not fetch: the fetch in some Node versions holds a request made
 * after a sleep for up to 3s, which trips the 2s timeout and fakes "not up".
 * @returns {Promise<boolean>} True on a 200 within 2s.
 */
function ppalAnswers() {
  return new Promise((done) => {
    const req = get(PPAL_CONFIG, { agent: false, timeout: 2000 }, (res) => {
      res.resume();
      done(res.statusCode === 200);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => done(false));
  });
}

/**
 * What Live looks like right now, for a timeout message.
 * @returns {Promise<string>} Its window titles and any dialog text.
 */
async function describeLiveState() {
  const titles = await liveWindowTitles();
  const { output: dialog } = await osascript(`
    tell application "System Events"
      tell process "${PROCESS}"
        set out to ""
        repeat with w in windows
          if subrole of w is "AXDialog" then
            try
              repeat with t in static texts of group 1 of w
                set out to out & (value of t) & " "
              end repeat
            end try
          end if
        end repeat
        return out
      end tell
    end tell
  `);
  const state =
    titles.length > 0
      ? `Live windows: ${titles.join(", ")}.`
      : "Live has no readable windows (is it running?).";
  return dialog == null ? state : `${state} Dialog on screen: ${dialog}`;
}

/**
 * Read the titles of Live's windows. The loaded Set names one of them.
 * @returns {Promise<string[]>} The titles; empty if Live isn't scriptable now.
 */
async function liveWindowTitles() {
  const { output } = await osascript(`
    tell application "System Events"
      tell process "${PROCESS}"
        set out to ""
        repeat with w in windows
          set n to ""
          try
            set n to name of w as text
          end try
          if n is not "" then set out to out & n & linefeed
        end repeat
        return out
      end tell
    end tell
  `);
  return output == null ? [] : output.split("\n");
}

// --- shared helpers ----------------------------------------------------------

/**
 * Run AppleScript without throwing. Live not running and a missing
 * Accessibility grant both land in `error`.
 * @param {string} script - AppleScript source.
 * @returns {Promise<{output: string | null, error: string | null}>} Trimmed
 *   stdout (null if empty or failed), and the error text if it failed.
 */
function osascript(script) {
  return new Promise((done) => {
    execFile("osascript", ["-e", script], (err, stdout, stderr) => {
      const output = err ? "" : stdout.trim();
      done({
        output: output === "" ? null : output,
        error: err ? stderr.trim() || err.message : null,
      });
    });
  });
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
