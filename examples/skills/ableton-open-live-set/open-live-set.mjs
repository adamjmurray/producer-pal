#!/usr/bin/env node

// open-live-set.mjs — open a Live Set (.als), or create a new one, in Ableton
// Live and wait until it has loaded, answering the dialogs in the way. macOS
// only.
//
// Safe by default: an unsaved-changes prompt is cancelled (nothing opens) and a
// crash-recovery prompt is left up for the user. Only --discard-unsaved and
// --discard-recovery throw work away.
//
// Live stays in the background (`open -g`, menu clicks through System Events):
// a focused Live would take the user's own typing, and Return answers a dialog.
//
// Live windows expose no file path, only a title (the file name without .als, or
// "Untitled" for a new Set), so "loaded" means: the old Set's Producer Pal
// server went away (if one was up), then a window shows the new name.
//
// --add-producer-pal loads the Producer_Pal device through the Producer Pal
// remote script when the Set has no running Producer Pal.
//
// PREREQUISITE: Accessibility permission for the app running this (System
// Settings ▸ Privacy & Security ▸ Accessibility). English Live UI assumed.
//
// Usage:
//   node open-live-set.mjs "My Song Project/My Song.als"
//   node open-live-set.mjs --new --add-producer-pal
//   node open-live-set.mjs song.als --discard-unsaved   # only if the user agreed
//   node open-live-set.mjs song.als --restart           # quit Live first
//
// Prints JSON on stdout: {"opened":"<path>","producerPal":true,"dismissed":[]}.
// Status/progress → stderr.

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { get, request } from "node:http";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROCESS = "Live"; // System Events process name for Ableton Live
const LIVE_BUNDLE_ID = "com.ableton.live"; // shared by every installed Live
const NEW_SET_NAME = "Untitled"; // a new Set's window title
const PPAL_PORT = process.env.PPAL_PORT ?? 3350;
const PPAL_CONFIG = `http://localhost:${PPAL_PORT}/config`;
const REMOTE_SCRIPT_PORT = process.env.PPAL_REMOTE_SCRIPT_PORT ?? 3349;
const REMOTE_SCRIPT = `http://127.0.0.1:${REMOTE_SCRIPT_PORT}`;
const REMOTE_SCRIPT_REPO =
  "https://github.com/adamjmurray/producer-pal/tree/main/remote-script";
const POLL_MS = 250;
// Live can re-instantiate the device right after a load, so one answer can be
// the old device's last. Two in a row counts as up.
const READY_STREAK = 2;
const PPAL_START_MS = 15_000;
const PPAL_ADDED_MS = 30_000;
// The remote script restarts with every Set, so it can be down for a moment.
const REMOTE_SCRIPT_START_MS = 10_000;
// The remote script waits up to 30s for Live before it answers.
const LOAD_TIMEOUT_MS = 35_000;
// Live's process can linger briefly after its windows go; launching then can
// hand the file to the dying process.
const QUIT_SETTLE_MS = 1_000;

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
       node open-live-set.mjs --new [options]

  --new                create a new Untitled Set instead of opening a file
  --add-producer-pal   if Producer Pal isn't running in the Set, add the
                       Producer_Pal device on a new MIDI track (needs the
                       Producer Pal remote script)
  --restart            quit Live first (if running), then relaunch the same
                       Live to open the Set; a save prompt on quit follows
                       --discard-unsaved
  --discard-unsaved    click Don't Save if the open Set has unsaved changes
                       (default: cancel, open nothing)
  --discard-recovery   click No if Live offers to recover work after a crash
                       (default: leave the dialog up and stop)
  --app <name|path>    Live app to use (default: the running Live, else the
                       default app for .als files). --new ignores it while
                       Live is running.
  --timeout <seconds>  give up after this long (default: 120)
  --help, -h           show this help

Env: PPAL_PORT (default 3350), PPAL_REMOTE_SCRIPT_PORT (default 3349).

Prints {"opened": "<path>" or "new": true, "producerPal": true|false,
"dismissed": [...]} on stdout, plus "addedProducerPal": {"trackIndex",
"trackName"} when it added the device. macOS only. Both --discard flags throw
work away: ask the user first.`;

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
  const addProducerPal = flag("--add-producer-pal");
  const restart = flag("--restart");
  await assertAssistiveAccess();
  const result = await openLiveSet({
    file,
    app,
    timeoutMs,
    discard,
    addProducerPal,
    restart,
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}

/**
 * The one positional argument, checked to be an existing .als file, or nothing
 * for --new.
 * @returns {string | undefined} Absolute path to the Set; undefined for --new.
 */
function setPath() {
  const paths = argv.filter(
    (a, i) => !a.startsWith("-") && !VALUE_OPTIONS.has(argv[i - 1]),
  );
  if (flag("--new")) {
    if (paths.length > 0) {
      throw new Error(`Pass a .als path or --new, not both`);
    }
    return undefined;
  }
  if (paths.length === 0) {
    throw new Error(`Missing the .als path (or --new)\n\n${USAGE}`);
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
 * Open the Set (or create a new one) and wait until Live shows it.
 * @param {object} o - Options.
 * @param {string} [o.file] - Absolute path to the .als file; omit for a new Set.
 * @param {string} [o.app] - App name or .app path; omit to choose automatically.
 * @param {number} o.timeoutMs - Time limit for the whole open.
 * @param {{unsaved: boolean, recovery: boolean}} o.discard - What the user
 *   agreed to lose.
 * @param {boolean} o.addProducerPal - Add the device if Producer Pal isn't up.
 * @param {boolean} o.restart - Quit Live before opening.
 * @returns {Promise<object>} The result printed on stdout.
 */
async function openLiveSet({
  file,
  app,
  timeoutMs,
  discard,
  addProducerPal,
  restart,
}) {
  const deadline = Date.now() + timeoutMs;
  const name = file ? basename(file, extname(file)) : NEW_SET_NAME;
  const dismissed = new Set();
  const answerDialogs = (verb) => answerDialog(discard, dismissed, verb);

  // Once Live has quit, `open` would pick macOS's default Live, so keep the
  // one that was running.
  const restarted =
    restart && (await quitLive({ deadline, timeoutMs, answerDialogs }));
  if (restarted) {
    app ??= restarted.app;
  }
  const wasServing = await ppalAnswers();
  const titleWasShowing = await windowTitled(name);

  await (file ? startOpen(file, app) : startNewSet(app, answerDialogs));
  await waitForSet({ name, wasServing, deadline, timeoutMs, answerDialogs });

  // Still answers dialogs: when the title was already showing, a save prompt
  // can turn up after the title check passed. Before adding, don't cut this
  // short: a device that is still starting would get a duplicate.
  process.stderr.write("Checking for Producer Pal…\n");
  const ppalWait = Date.now() + PPAL_START_MS;
  const producerPal = await waitForPpal(
    addProducerPal ? ppalWait : Math.min(deadline, ppalWait),
    answerDialogs,
  );
  const added =
    addProducerPal && !producerPal ? await loadProducerPal() : undefined;

  return {
    ...(file ? { opened: file } : { new: true }),
    producerPal: producerPal || added != null,
    ...(added && { addedProducerPal: added }),
    ...(restart && { restarted: Boolean(restarted) }),
    dismissed: [...dismissed],
    ...(titleWasShowing &&
      !wasServing && {
        warning: `A Live window was already titled "${name}", so the swap couldn't be confirmed.`,
      }),
  };
}

/**
 * Quit the running Live and wait for its process to go, answering the save
 * prompt like an open would.
 * @param {object} o - Options.
 * @param {number} o.deadline - Give up at this time (epoch ms).
 * @param {number} o.timeoutMs - The time limit, for error messages.
 * @param {(verb: string) => Promise<void>} o.answerDialogs - Runs on every
 *   tick.
 * @returns {Promise<{app: string | undefined} | undefined>} The .app that
 *   was quit, or undefined if Live wasn't running.
 */
async function quitLive({ deadline, timeoutMs, answerDialogs }) {
  if ((await livePid()) == null) {
    process.stderr.write("Live isn't running, so nothing to quit…\n");
    return undefined;
  }
  const app = await runningLiveApp();
  const answer = () => answerDialogs("quit");
  await answer(); // a dialog already up would block the menu
  process.stderr.write("Quitting Live…\n");
  // A menu click returns at once; an AppleScript `quit` would block while the
  // save prompt is up, so the prompt could never be answered.
  const { error } = await osascript(
    `tell application "System Events" to tell process "${PROCESS}" to click menu item "Quit Live" of menu "Live" of menu bar 1`,
  );
  if (error != null) {
    throw new Error(`Couldn't click Live → Quit Live: ${error}`);
  }
  const gone = async () => (await livePid()) == null;
  if (!(await poll(gone, deadline, answer))) {
    throw new Error(
      `Live did not quit within ${timeoutMs / 1000}s. ${await describeLiveState()}`,
    );
  }
  await sleep(QUIT_SETTLE_MS);
  return { app };
}

/**
 * Hand the file to Live.
 * @param {string} file - Absolute path to the .als file.
 * @param {string} [app] - App name or .app path; omit to choose automatically.
 * @returns {Promise<void>} Resolves once `open` has handed it off.
 */
async function startOpen(file, app) {
  const bundle = app ?? (await runningLiveApp());
  const inApp = bundle ? ` in ${bundle}` : "";
  process.stderr.write(`Opening ${file}${inApp}…\n`);
  await openInBackground([...(bundle ? ["-a", bundle] : []), file]);
}

/**
 * Click File → New Live Set in the running Live, or launch Live, which starts
 * with a new Set.
 * @param {string} [app] - App to launch; ignored while Live is running.
 * @param {() => Promise<void>} answerDialogs - Clears dialogs before the click.
 * @returns {Promise<void>} Resolves once the new Set is on its way.
 */
async function startNewSet(app, answerDialogs) {
  if ((await livePid()) == null) {
    process.stderr.write(`Launching ${app ?? "Live"} with a new Set…\n`);
    await openInBackground(app ? ["-a", app] : ["-b", LIVE_BUNDLE_ID]);
    return;
  }
  await answerDialogs(); // a dialog already up would block the menu
  const ignored = app ? " (--app ignored: Live is running)" : "";
  process.stderr.write(`Creating a new Set${ignored}…\n`);
  const { error } = await osascript(
    `tell application "System Events" to tell process "${PROCESS}" to click menu item "New Live Set" of menu "File" of menu bar 1`,
  );
  if (error != null) {
    throw new Error(`Couldn't click File → New Live Set in Live: ${error}`);
  }
}

/**
 * Wait for the old Set to let go, then for a window showing the new one.
 * @param {object} o - Options.
 * @param {string} o.name - Window title the new Set will have.
 * @param {boolean} o.wasServing - Producer Pal answered before the swap.
 * @param {number} o.deadline - Give up at this time (epoch ms).
 * @param {number} o.timeoutMs - The time limit, for error messages.
 * @param {() => Promise<void>} o.answerDialogs - Runs on every tick.
 * @returns {Promise<void>} Resolves once the new Set's window shows.
 */
async function waitForSet({
  name,
  wasServing,
  deadline,
  timeoutMs,
  answerDialogs,
}) {
  const timedOut = async (what) =>
    new Error(
      `${what} within ${timeoutMs / 1000}s. ${await describeLiveState()}`,
    );

  // Live keeps the old Set's server up until the swap (even after the title
  // changes), so its going away is the sign the old Set let go.
  if (wasServing) {
    process.stderr.write("Waiting for the open Set to close…\n");
    const stopped = async () => !(await ppalAnswers());
    if (!(await poll(stopped, deadline, answerDialogs))) {
      throw await timedOut("Live did not swap Sets");
    }
  }

  process.stderr.write(`Waiting for "${name}" to load…\n`);
  const shows = () => windowTitled(name);
  if (!(await poll(shows, deadline, answerDialogs))) {
    throw await timedOut(`No Live window showed "${name}"`);
  }
}

/**
 * Load the Producer_Pal device through the remote script, then wait for
 * Producer Pal to answer. Not bound by --timeout: the Set is already open.
 * @returns {Promise<{trackIndex: number, trackName: string}>} Where it went.
 */
async function loadProducerPal() {
  const open = "The Set is open, but";
  process.stderr.write("Adding Producer Pal…\n");
  const reachable = await poll(
    () => answers(`${REMOTE_SCRIPT}/ping`),
    Date.now() + REMOTE_SCRIPT_START_MS,
  );
  if (!reachable) {
    throw new Error(
      `${open} Producer Pal couldn't be added: the Producer Pal remote script isn't answering on port ${REMOTE_SCRIPT_PORT}. Install it and select it as a Control Surface (Live Settings → Link, Tempo & MIDI): ${REMOTE_SCRIPT_REPO}. Set PPAL_REMOTE_SCRIPT_PORT if it uses another port.`,
    );
  }

  const { status, body } = await postJson(`${REMOTE_SCRIPT}/load`, {
    type: "mfl-device",
    name: "Producer_Pal",
  }).catch((err) => ({ status: 0, body: { error: err.message } }));
  if (status !== 200) {
    throw new Error(
      `${open} Producer Pal couldn't be added: ${loadFailure(status, body)}`,
    );
  }

  const track = { trackIndex: body.track?.index, trackName: body.track?.name };
  process.stderr.write(`Waiting for Producer Pal on "${track.trackName}"…\n`);
  if (!(await waitForPpal(Date.now() + PPAL_ADDED_MS))) {
    throw new Error(
      `${open} Producer Pal didn't answer on port ${PPAL_PORT} within ${PPAL_ADDED_MS / 1000}s after the Producer_Pal device was added to track ${track.trackIndex} ("${track.trackName}"). Set PPAL_PORT if it uses another port.`,
    );
  }
  return track;
}

/**
 * Explain a failed /load.
 * @param {number} status - HTTP status.
 * @param {{error?: string, candidates?: string[]}} body - The reply.
 * @returns {string} What went wrong and what to do.
 */
function loadFailure(status, body) {
  if (status === 404) {
    return "Live's browser has no Producer_Pal device. Put Producer_Pal.amxd where the browser's Max for Live section lists it, e.g. the User Library.";
  }
  if (status === 409) {
    return `Live's browser has more than one Producer_Pal device: ${(body.candidates ?? []).join(", ")}. Keep only one device named Producer_Pal there.`;
  }
  const reply = status ? `answered ${status}` : "didn't reply"; // 0: no reply
  return `the remote script ${reply}: ${body.error ?? "(no error text)"}`;
}

/**
 * Wait for Producer Pal to answer READY_STREAK times in a row.
 * @param {number} until - Deadline (epoch ms).
 * @param {() => Promise<void>} answerDialogs - Runs on every tick.
 * @returns {Promise<boolean>} True once it's up, false on timeout.
 */
function waitForPpal(until, answerDialogs) {
  let streak = 0;
  const up = async () => {
    streak = (await ppalAnswers()) ? streak + 1 : 0;
    return streak >= READY_STREAK;
  };
  return poll(up, until, answerDialogs);
}

/**
 * The running Live's .app bundle, so the Set lands in that Live rather than
 * whichever installed version macOS prefers for .als files.
 * @returns {Promise<string | undefined>} Bundle path, or undefined if Live
 *   isn't running.
 */
async function runningLiveApp() {
  const pid = await livePid();
  if (pid == null) {
    return undefined;
  }
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "comm=", "-p", pid]);
    const exe = stdout.trim();
    const suffix = "/Contents/MacOS/Live";
    return exe.endsWith(suffix) ? exe.slice(0, -suffix.length) : undefined;
  } catch {
    return undefined; // Live quit in between
  }
}

/**
 * Live's process id.
 * @returns {Promise<string | undefined>} The pid, or undefined if Live isn't
 *   running.
 */
async function livePid() {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-x", PROCESS]);
    return stdout.trim().split("\n")[0];
  } catch {
    return undefined; // pgrep exits 1 when Live isn't running
  }
}

/**
 * Run `open -g`, which keeps the app in the background.
 * @param {string[]} args - Arguments after -g.
 * @returns {Promise<void>} Resolves once `open` has handed off.
 */
async function openInBackground(args) {
  try {
    await execFileAsync("open", ["-g", ...args]);
  } catch (err) {
    throw new Error(`open failed: ${err.stderr?.trim() || err.message}`, {
      cause: err,
    });
  }
}

/**
 * Answer dialogs and run a check every tick until it passes or time runs out.
 * @param {() => Promise<boolean>} check - The condition to wait for.
 * @param {number} until - Deadline (epoch ms).
 * @param {() => Promise<void>} [answerDialogs] - Runs first on every tick;
 *   throws to stop the wait. Omit once the Set is open.
 * @returns {Promise<boolean>} True if the check passed, false on timeout.
 */
async function poll(check, until, answerDialogs = async () => {}) {
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
 * @param {string} [verb] - What Cancel stopped: "opened" (default) or "quit".
 * @returns {Promise<void>} Resolves when nothing needs the user.
 */
async function answerDialog(discard, dismissed, verb = "opened") {
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
      `The open Set has unsaved changes, so nothing was ${verb} (clicked Cancel; that Set is untouched).${said} Live windows: ${titles.join(", ")}. Ask the user to save it first, ${unsavedAsk}`,
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
 * @returns {Promise<boolean>} True on a 200 within 2s.
 */
function ppalAnswers() {
  return answers(PPAL_CONFIG);
}

/**
 * Whether a local server answers a GET.
 *
 * node:http, not fetch: the fetch in some Node versions holds a request made
 * after a sleep for up to 3s, which trips the 2s timeout and fakes "not up".
 * @param {string} url - What to GET.
 * @returns {Promise<boolean>} True on a 200 within 2s.
 */
function answers(url) {
  return new Promise((done) => {
    const req = get(url, { agent: false, timeout: 2000 }, (res) => {
      res.resume();
      done(res.statusCode === 200);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => done(false));
  });
}

/**
 * POST JSON and read the JSON reply (node:http, for the same reason as
 * `answers`).
 * @param {string} url - Where to POST.
 * @param {object} payload - The request body.
 * @returns {Promise<{status: number, body: object}>} The status and parsed
 *   reply; a reply that isn't JSON comes back as `{error: <text>}`.
 */
function postJson(url, payload) {
  const data = JSON.stringify(payload);
  const options = {
    method: "POST",
    agent: false,
    timeout: LOAD_TIMEOUT_MS,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  };
  return new Promise((done, fail) => {
    const req = request(url, options, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => {
        try {
          done({ status: res.statusCode, body: JSON.parse(text) });
        } catch {
          done({ status: res.statusCode, body: { error: text.trim() } });
        }
      });
    });
    const waited = `no reply within ${LOAD_TIMEOUT_MS / 1000}s`;
    req.on("timeout", () => req.destroy(new Error(waited)));
    req.on("error", (err) =>
      fail(new Error(`${url} failed: ${err.message}`, { cause: err })),
    );
    req.end(data);
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

/**
 * Whether a Live window has this title.
 * @param {string} name - The title to look for.
 * @returns {Promise<boolean>} True if one does.
 */
async function windowTitled(name) {
  const titles = await liveWindowTitles();
  return titles.includes(name);
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
