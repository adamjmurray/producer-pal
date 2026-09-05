// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Retrying a Live Set open when Live stops answering.
 *
 * Live occasionally wedges — it stops serving MCP, refuses to swap Sets, and
 * then comes back on its own several minutes later. Without a retry every
 * scenario in that window is scored, and a wall of clean zeros looks exactly
 * like a real regression. Waiting is enough surprisingly often; killing Live is
 * the fallback, and its next launch is a cold one.
 */

import { execFile } from "node:child_process";
import { styleText } from "node:util";
import { openLiveSet } from "../open-live-set.ts";

const ABLETON_PROCESS = "Live";

/** How many times to try the open in total, including the first attempt. */
const MAX_ATTEMPTS = 3;

/** How long to leave a wedged Live alone before trying again. */
const RETRY_WAIT_MS = 60_000;

/** How long to wait after killing Live before asking for a cold launch. */
const RELAUNCH_WAIT_MS = 20_000;

/** Grace between the polite kill and SIGKILL. */
const FORCE_KILL_WAIT_MS = 15_000;

/**
 * Open a Live Set, retrying when Live is wedged. The first retry just waits —
 * Live often recovers by itself. The second kills Live first, so the open that
 * follows is a cold launch.
 *
 * @param projectPath - Path to the .als file
 */
export async function openLiveSetWithRecovery(
  projectPath: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await openLiveSet(projectPath);

      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;

      const message = error instanceof Error ? error.message : String(error);

      console.warn(
        styleText(
          "yellow",
          `\nLive Set open failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`,
        ),
      );

      await recoverBeforeRetry(attempt);
    }
  }
}

/**
 * Wait out a wedged Live, and on the second failure kill it so the next open
 * cold-launches. Killing rather than quitting on purpose: a quit puts up "Save
 * changes?" and a hung Live may not answer it, and the harness discards unsaved
 * work anyway — it opens Sets without saving whatever was there.
 *
 * @param attempt - Which attempt just failed (1-based)
 */
async function recoverBeforeRetry(attempt: number): Promise<void> {
  if (attempt === 1) {
    console.warn(
      styleText("gray", `Waiting ${RETRY_WAIT_MS / 1000}s for Live to settle…`),
    );
    await sleep(RETRY_WAIT_MS);

    return;
  }

  console.warn(styleText("gray", "Killing Live and cold-launching…"));
  await killLive();
  await sleep(RELAUNCH_WAIT_MS);
}

/**
 * Kill Live, escalating to SIGKILL when it does not go quietly.
 */
async function killLive(): Promise<void> {
  await run("killall", [ABLETON_PROCESS]);
  await sleep(FORCE_KILL_WAIT_MS);

  if (await liveIsRunning()) await run("killall", ["-9", ABLETON_PROCESS]);
}

/**
 * Whether a Live process is still alive.
 * @returns True when `pgrep` found one
 */
async function liveIsRunning(): Promise<boolean> {
  return (await run("pgrep", ["-x", ABLETON_PROCESS])) !== null;
}

/**
 * Run a command, swallowing failures. Every caller here treats "it didn't work"
 * as "there was nothing to do" — Live already gone, or never running.
 *
 * @param command - Executable name
 * @param args - Arguments
 * @returns Trimmed stdout, or null when the command failed
 */
async function run(command: string, args: string[]): Promise<string | null> {
  return await new Promise((resolve) => {
    execFile(command, args, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });
}

/**
 * Sleeps for the specified duration.
 * @param ms - Duration in milliseconds
 * @returns A promise that resolves after the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
