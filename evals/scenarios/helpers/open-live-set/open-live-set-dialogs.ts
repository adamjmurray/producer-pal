// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The dialog watcher for open-live-set.ts: clears the modals that block a Set
 * swap ("Save changes?", and the crash-recovery prompt after a crash).
 *
 * It polls with a fresh osascript each tick instead of one long-running
 * script, so a stale System Events handle on a relaunched Live can't blind it,
 * and so it can report what it sees. Two things it reports rather than hides:
 * a click that keeps failing, and Live running with no windows System Events
 * can see (usually a dialog it cannot reach).
 *
 * Live can also lock one System Events process out for good, refusing it
 * Accessibility although the grant is fine. A fresh System Events is let back
 * in, so the watcher restarts it once before reporting the refusal.
 */

import { execFile } from "node:child_process";

/** System Events' name for Ableton Live. */
export const LIVE_PROCESS = "Live";

/** What System Events says when Accessibility is refused. */
export const ASSISTIVE_ACCESS_DENIED = "not allowed assistive access";

/** Where to fix a refused Accessibility grant. */
export const ASSISTIVE_ACCESS_FIX =
  "Grant Accessibility (System Settings → Privacy & Security → " +
  "Accessibility) to the app running these tests, and to AEServer if it is " +
  "listed. Toggle an entry that is already on off and back on — the grant " +
  "goes stale.";

const POLL_INTERVAL_MS = 250;
const OSASCRIPT_TIMEOUT_MS = 15_000;

/** Consecutive bad ticks (failed click, or osascript error) before we report. */
const FAILING_TICKS_LIMIT = 3;

/**
 * How long Live may be running with no windows System Events can see before we
 * call it stuck. A cold launch shows a window well inside this.
 */
export const NO_WINDOWS_LIMIT_MS = 30_000;

export interface OsascriptResult {
  output: string | null;
  error: string | null;
}

export interface WatcherDeps {
  run: (script: string, signal?: AbortSignal) => Promise<OsascriptResult>;
  restartSystemEvents: () => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface DialogWatcher {
  /** Poll once. Exposed so tests can drive it without timers. */
  tick: (signal?: AbortSignal) => Promise<void>;
  /** Throws if a dialog click (or osascript itself) keeps failing. */
  assertClean: () => void;
  /** Like assertClean, and throws when Live has shown no windows for too long. */
  assertNotStuck: () => void;
  /** Stop polling and wait for the loop to finish. */
  stop: () => Promise<void>;
}

/** Live is up but System Events cannot see a window. Retrying won't help. */
export class LiveStuckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveStuckError";
  }
}

/**
 * Both dialogs are AXDialog windows whose buttons live in group 1, labelled by
 * "description". "Don" gets Don't Save without tangling with the curly
 * apostrophe; "No" is too plain to match without the crash prompt's text.
 *
 * Candidates come from UI elements, not just windows, and any subrole with
 * "Dialog" in it counts (AXSystemDialog too): a dialog the window list misses
 * is still clicked.
 *
 * Output: "no-process", or "windows N" followed by one line per dialog:
 * "clicked unsaved", "clicked recovery", or "failed <error>".
 */
const DIALOG_SCRIPT = `
  tell application "System Events"
    if not (exists process "${LIVE_PROCESS}") then return "no-process"
    tell process "${LIVE_PROCESS}"
      set out to "windows " & (count of windows) & linefeed
      repeat with w in UI elements
        try
          if subrole of w contains "Dialog" then
            set msg to ""
            try
              repeat with t in static texts of group 1 of w
                set msg to msg & (value of t)
              end repeat
            end try
            try
              repeat with b in buttons of group 1 of w
                set d to ""
                try
                  set d to description of b as text
                end try
                if d contains "Don" then
                  click b
                  set out to out & "clicked unsaved" & linefeed
                  exit repeat
                else if d is "No" and msg contains "recover your work" then
                  click b
                  set out to out & "clicked recovery" & linefeed
                  exit repeat
                end if
              end repeat
            on error errMsg
              set out to out & "failed " & errMsg & linefeed
            end try
          end if
        end try
      end repeat
      return out
    end tell
  end tell
`;

/**
 * Run an AppleScript, keeping the failure.
 *
 * @param script - The AppleScript source
 * @param signal - Aborting kills the osascript process
 * @returns The trimmed output, or the error text when osascript failed
 */
export async function runOsascript(
  script: string,
  signal?: AbortSignal,
): Promise<OsascriptResult> {
  return await new Promise((resolve) => {
    execFile(
      "osascript",
      ["-e", script],
      { timeout: OSASCRIPT_TIMEOUT_MS, signal },
      (error, stdout, stderr) => {
        const output = error ? "" : stdout.trim();

        resolve({
          output: output === "" ? null : output,
          error: error ? stderr.trim() || error.message : null,
        });
      },
    );
  });
}

/**
 * Quit System Events. The next osascript call relaunches it.
 */
async function restartSystemEvents(): Promise<void> {
  await new Promise<void>((resolve) => {
    // Fails when it isn't running, which is just as good.
    execFile("killall", ["System Events"], () => resolve());
  });
}

const realDeps: WatcherDeps = {
  run: runOsascript,
  restartSystemEvents,
  now: () => Date.now(),
  sleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Track what the polls report. Pure bookkeeping, so tests can drive it by hand.
 *
 * @param deps - osascript, clock and sleep; faked in tests
 * @returns The watcher state and its checks
 */
export function createDialogWatcher(
  deps: WatcherDeps = realDeps,
): Omit<DialogWatcher, "stop"> {
  let emptySince: number | null = null;
  let failingTicks = 0;
  let lastFailure = "";
  let accessDenied = false;
  let restarted = false;

  const tick = async (signal?: AbortSignal): Promise<void> => {
    const { output, error } = await deps.run(DIALOG_SCRIPT, signal);

    if (signal?.aborted) {
      return;
    }

    if (error != null) {
      accessDenied = error.includes(ASSISTIVE_ACCESS_DENIED);

      if (accessDenied && !restarted) {
        restarted = true;
        await deps.restartSystemEvents();

        return;
      }

      failingTicks++;
      lastFailure = `osascript failed: ${error}`;

      return;
    }

    accessDenied = false;
    restarted = false;

    const [first, ...rest] = (output ?? "").split("\n");
    const failed = rest.find((line) => line.startsWith("failed "));

    failingTicks = failed == null ? 0 : failingTicks + 1;
    lastFailure = failed == null ? "" : `the click failed: ${failed.slice(7)}`;

    // Live up, no windows, and no dialog found by any route.
    emptySince =
      first === "windows 0" && rest.every((line) => line === "")
        ? (emptySince ?? deps.now())
        : null;
  };

  const assertClean = (): void => {
    if (failingTicks >= FAILING_TICKS_LIMIT && accessDenied) {
      throw new Error(
        "macOS refused System Events access to Live, even after restarting " +
          "System Events, so dialogs can't be found or clicked. " +
          `${ASSISTIVE_ACCESS_FIX} (${lastFailure})`,
      );
    }

    if (failingTicks >= FAILING_TICKS_LIMIT) {
      throw new Error(
        `Could not clear a dialog in Live (${lastFailure}). ` +
          "Live is probably waiting on it; answer it in Live and rerun.",
      );
    }
  };

  const assertNotStuck = (): void => {
    assertClean();

    if (emptySince != null && deps.now() - emptySince >= NO_WINDOWS_LIMIT_MS) {
      const seconds = Math.round((deps.now() - emptySince) / 1000);

      throw new LiveStuckError(
        `Live is running but System Events has seen no Live windows for ` +
          `${seconds}s, so a dialog (such as crash recovery) can't be found ` +
          "or clicked. Live may be stuck on a dialog: look at Live, answer " +
          "it, then rerun.",
      );
    }
  };

  return { tick, assertClean, assertNotStuck };
}

/**
 * Start polling for dialogs. Call `stop()` when the open is done.
 *
 * @param deps - osascript, clock and sleep; faked in tests
 * @returns The watcher
 */
export function startDialogWatcher(
  deps: WatcherDeps = realDeps,
): DialogWatcher {
  const watcher = createDialogWatcher(deps);
  const controller = new AbortController();
  const loop = (async () => {
    while (!controller.signal.aborted) {
      await watcher.tick(controller.signal);
      await deps.sleep(POLL_INTERVAL_MS);
    }
  })();

  return {
    ...watcher,
    stop: async () => {
      controller.abort();
      await loop;
    },
  };
}
