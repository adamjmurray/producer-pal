#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Opens an Ableton Live project and waits until THAT project is the one
 * serving MCP.
 *
 * The waiting is the hard part. Live keeps the outgoing Set's MCP server up
 * until the swap actually happens, and a dialog can hold the swap off for as
 * long as it likes, so "a server answered" is not evidence the new Set loaded.
 * We therefore wait for the running server to go away and a new one to come
 * back. A dialog watcher runs the whole time to clear the modals that would
 * otherwise block the swap forever.
 *
 * NOTE: macOS only. Requires Terminal.app with Accessibility permissions
 * (System Settings → Privacy & Security → Accessibility → Terminal)
 *
 * IMPORTANT: Any projects that are auto-opened need to have the Producer Pal device in them.
 *            If using Live templates, the device must be frozen or the code will be missing
 *            (the device, but not the code, is copied into the template).
 *
 * Usage: node evals/scenarios/open-live-set.ts /path/to/project.als
 */

// The MCP poll loop below sleeps between requests, which is exactly what Node's
// bundled undici stalls. See the module for why.
import "#evals/shared/install-fetch-dispatcher.ts";
import { type ChildProcess, exec, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve as resolvePath } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { MIN_LIVE_VERSION } from "#src/shared/config.ts";

// For `open -a`. Override to test against a differently-named bundle
// (e.g. a side-by-side older version).
const ABLETON_APP = process.env.ABLETON_APP ?? "Ableton Live 12 Suite";
const ABLETON_PROCESS = "Live"; // For System Events
const POLL_INTERVAL_MS = 250;
// A swap takes ~1.5s once nothing is in its way. The headroom is for the
// dialogs, which hold Live at the old Set until the watcher clicks them.
const SERVER_STOP_TIMEOUT_MS = 20000;
// A cold Live launch, plus the crash-recovery dialog when there was a crash.
const SERVER_START_TIMEOUT_MS = 45000;
// Live shows this instead of opening a Set that a newer version saved.
const UNSUPPORTED_VERSION_TEXT = "newer version of Live";

/**
 * Opens an Ableton Live project, clearing any dialogs in the way.
 * @param projectPath - Path to the .als file
 */
export async function openLiveSet(projectPath: string): Promise<void> {
  const absolutePath = resolvePath(projectPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Project file not found: ${absolutePath}`);
  }

  const watcher = startDialogWatcher();

  try {
    const wasServing = await serverIsAnswering();

    await openAbletonLiveProject(absolutePath);

    // Only wait for a teardown there is something to tear down. With Live shut
    // (or its Set device-less) nothing is serving, and the wait would just burn
    // its whole timeout.
    if (wasServing) await waitForServerToStop();

    await waitForServerToStart();
    await verifyLoadedSet(absolutePath);
  } finally {
    watcher.kill();
  }
}

/**
 * Starts an AppleScript process that clicks away the modals that block a Set
 * swap: "Save changes before closing?" (click Don't Save) and, after a crash,
 * "Would you like to recover your work?" (click No — recovering restores the
 * mutated session we are reopening to get rid of).
 *
 * It runs until killed rather than for a fixed window, because the dialogs turn
 * up at their own pace: the save prompt right after `open`, the crash prompt
 * partway through a cold launch.
 * @returns The spawned child process. Kill it when the open is done.
 */
function startDialogWatcher(): ChildProcess {
  const pollCount = Math.ceil(
    (SERVER_STOP_TIMEOUT_MS + SERVER_START_TIMEOUT_MS) / POLL_INTERVAL_MS,
  );

  // Both dialogs are AXDialog windows whose buttons live in group 1, labelled
  // by "description" ("name" and "title" are both `missing value`). "Don" gets
  // Don't Save without tangling with the curly apostrophe. "No" is too plain a
  // word to match on alone, so it needs the crash prompt's text alongside it.
  const script = `
    tell application "System Events"
      tell process "${ABLETON_PROCESS}"
        repeat ${pollCount} times
          try
            repeat with w in windows
              if subrole of w is "AXDialog" then
                set msg to ""
                try
                  repeat with t in static texts of group 1 of w
                    set msg to msg & (value of t)
                  end repeat
                end try
                repeat with b in buttons of group 1 of w
                  set d to ""
                  try
                    set d to description of b as text
                  end try
                  if d contains "Don" then
                    click b
                    exit repeat
                  else if d is "No" and msg contains "recover your work" then
                    click b
                    exit repeat
                  end if
                end repeat
              end if
            end repeat
          end try
          delay ${POLL_INTERVAL_MS / 1000}
        end repeat
      end tell
    end tell
  `;

  return spawn("osascript", ["-e", script]);
}

/**
 * Opens the project file with Ableton Live.
 * @param projectPath - Absolute path to the .als file
 * @returns A promise that resolves when the open command completes
 */
async function openAbletonLiveProject(projectPath: string): Promise<void> {
  return await new Promise((resolve, reject) => {
    exec(
      `open -g -a "${ABLETON_APP}" "${projectPath}"`,
      { env: envWithoutTestMarkers() },
      (error) => {
        if (error) {
          reject(new Error(`Failed to open project: ${error.message}`));
        } else {
          resolve();
        }
      },
    );
  });
}

/**
 * The current environment minus vitest's markers. macOS `open` hands the
 * caller's environment to an app it COLD-STARTS, so a Live launched from the
 * e2e suite would inherit VITEST=true — which makes the server treat
 * ~/.producer-pal as inert (see config-markdown-store.ts), silently emptying
 * global context, memory, and skill overrides. An already-running Live keeps
 * whatever environment it started with, so without this the suite tests a
 * different server depending on whether Live happened to be open.
 *
 * @returns A copy of process.env with the vitest markers removed
 */
function envWithoutTestMarkers(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST")) delete env[key];
  }

  delete env.NODE_ENV;

  return env;
}

/**
 * Waits for the Set that was open to stop serving MCP. That teardown is the
 * only reliable sign Live let go of it — the alternative, trusting the first
 * server that answers, hands the caller the outgoing Set.
 */
async function waitForServerToStop(): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < SERVER_STOP_TIMEOUT_MS) {
    if (!(await serverIsAnswering())) return;

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `The Set that was already open never stopped serving MCP ` +
      `(${SERVER_STOP_TIMEOUT_MS}ms). Live did not swap Sets. ` +
      (await describeLiveState()),
  );
}

/**
 * Waits for the newly opened Set to start serving MCP.
 */
async function waitForServerToStart(): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < SERVER_START_TIMEOUT_MS) {
    const refusal = await dismissUnsupportedVersionAlert();

    if (refusal != null) {
      throw new Error(
        `Live would not open the Set. ${refusal} ` +
          "Point ABLETON_APP at a Live that can open it, or rebuild the Set " +
          `in Live ${MIN_LIVE_VERSION}, the oldest Producer Pal supports. ` +
          "Live cannot save a Set back to an older version.",
      );
    }

    if (await mcpServerIsReady()) return;

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `MCP server not responsive after ${SERVER_START_TIMEOUT_MS}ms. ` +
      (await describeLiveState()),
  );
}

/**
 * Checks whether anything is serving on the MCP port. Cheaper than a full MCP
 * handshake, which is all the teardown poll needs.
 * @returns True if the port answered
 */
async function serverIsAnswering(): Promise<boolean> {
  try {
    const response = await fetch(new URL("/config", MCP_URL), {
      signal: AbortSignal.timeout(2000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Probes the MCP server once.
 * @returns True if it answered with the tools a loaded Set serves
 */
async function mcpServerIsReady(): Promise<boolean> {
  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    const client = new Client(
      { name: "open-live-set", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    // List tools and verify ppal-connect is present
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    if (!toolNames.includes("ppal-connect")) {
      throw new Error("ppal-connect tool not found");
    }

    if (toolNames.length < 2) {
      throw new Error("Expected more than one tool in the MCP server");
    }

    await client.close();

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks that the Set now serving is the one we asked for, by window title.
 *
 * Corroboration rather than the guarantee — the server restart is that. Live
 * titles a saved Set's window with its file name. Every window is searched, not
 * just the front one, since a floating Max or plugin window is often in front.
 * No readable titles means no check: a missing Accessibility grant shouldn't
 * fail every open.
 * @param projectPath - Absolute path to the .als file
 */
async function verifyLoadedSet(projectPath: string): Promise<void> {
  const expected = basename(projectPath, ".als");
  const titles = await liveWindowTitles();

  if (titles.length > 0 && !titles.includes(expected)) {
    throw new Error(
      `No Live window is showing "${expected}" (open: ${titles.join(", ")}). ` +
        "The server that answered belongs to a different Set.",
    );
  }
}

/**
 * Dismisses Live's "made with a newer version of Live" alert, if it is showing.
 *
 * Live puts this up INSTEAD of opening the Set, so the Set never loads and the
 * server never comes back. Clicking it away matters as much as reporting it:
 * left up, the alert blocks every later open too, which is what turns one bad
 * Set into a timeout on every remaining test file.
 * @returns Live's own message, or null if the alert is not showing
 */
async function dismissUnsupportedVersionAlert(): Promise<string | null> {
  return await runAppleScript(`
    tell application "System Events"
      tell process "${ABLETON_PROCESS}"
        repeat with w in windows
          try
            if subrole of w is "AXDialog" then
              tell group 1 of w
                repeat with t in static texts
                  if value of t contains "${UNSUPPORTED_VERSION_TEXT}" then
                    set alertText to value of t
                    click button 1
                    return alertText
                  end if
                end repeat
              end tell
            end if
          end try
        end repeat
      end tell
    end tell
    return ""
  `);
}

/**
 * What Live looks like right now, for a timeout message. A bare "not
 * responsive" leaves you guessing; the Set on screen and any dialog still up
 * usually name the problem outright.
 * @returns A one-line description
 */
async function describeLiveState(): Promise<string> {
  const titles = await liveWindowTitles();
  const dialog = await runAppleScript(`
    tell application "System Events"
      tell process "${ABLETON_PROCESS}"
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
 * Reads the titles of Live's windows. The loaded Set names one of them.
 * @returns The titles, or an empty array if Live isn't scriptable right now
 */
async function liveWindowTitles(): Promise<string[]> {
  const output = await runAppleScript(`
    tell application "System Events"
      tell process "${ABLETON_PROCESS}"
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
 * Runs an AppleScript and returns its output.
 * @param script - The AppleScript source
 * @returns Trimmed output, or null if it failed or printed nothing. Live not
 *   running and Accessibility not granted both land here, and neither is worth
 *   failing an open over on its own.
 */
async function runAppleScript(script: string): Promise<string | null> {
  return await new Promise((resolve) => {
    execFile("osascript", ["-e", script], (error, stdout) => {
      const output = error ? "" : stdout.trim();

      resolve(output === "" ? null : output);
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

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2];

  if (!projectPath) {
    console.error("Usage: node evals/scenarios/open-live-set.ts <path>");
    process.exit(1);
  }

  try {
    await openLiveSet(projectPath);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
