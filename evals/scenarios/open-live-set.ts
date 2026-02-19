#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Opens an Ableton Live project, handling the "Don't Save" dialog if it appears.
 * Waits for the MCP server to become responsive before returning.
 *
 * NOTE: macOS only. Requires Terminal.app with Accessibility permissions
 * (System Settings → Privacy & Security → Accessibility → Terminal)
 *
 * IMPORTANT: Any projects that are auto-opened need to have the Producer Pal device in them.
 *            If using Live templates, the device must be frozen or the code will be missing
 *            (the device, but not the code, is copied into the template).
 *
 * Usage: node scripts/eval-lib/open-live-set.ts /path/to/project.als
 */

import { type ChildProcess, exec, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ABLETON_APP = "Ableton Live 12 Suite"; // For `open -a`
const ABLETON_PROCESS = "Live"; // For System Events
const MCP_URL = "http://localhost:3350/mcp";
const DIALOG_POLL_INTERVAL_MS = 250;
const DIALOG_TIMEOUT_MS = 2500;
const MCP_POLL_INTERVAL_MS = 500;
const MCP_POLL_TIMEOUT_MS = 15000;

/**
 * Opens an Ableton Live project, handling the "Don't Save" dialog if it appears.
 * @param projectPath - Path to the .als file
 */
export async function openLiveSet(projectPath: string): Promise<void> {
  const absolutePath = resolvePath(projectPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Project file not found: ${absolutePath}`);
  }

  // Start dialog watcher before opening (it polls for the dialog)
  const dialogWatcher = startUnsavedChangesDialogWatcher();

  try {
    await openAbletonLiveProject(absolutePath);
    await dismissUnsavedChangesDialog(dialogWatcher);
    await waitForMcpServer();
  } finally {
    // Ensure dialog watcher is cleaned up
    dialogWatcher.kill();
  }
}

/**
 * Starts an AppleScript process that polls for the "Don't Save" dialog
 * and automatically dismisses it without saving.
 * @returns The spawned child process
 */
function startUnsavedChangesDialogWatcher(): ChildProcess {
  const pollCount = Math.ceil(DIALOG_TIMEOUT_MS / DIALOG_POLL_INTERVAL_MS);
  const pollIntervalSeconds = DIALOG_POLL_INTERVAL_MS / 1000;

  // Live's "unsaved changes" dialog is a window with subrole AXDialog (not a sheet).
  // The buttons are inside group 1, and their labels are in the "description"
  // attribute (not "name"). We use `contains "Don"` to avoid apostrophe issues.
  // After clicking, we delay briefly to let Ableton process before returning.
  const script = `
    tell application "System Events"
      tell process "${ABLETON_PROCESS}"
        repeat ${pollCount} times
          try
            repeat with w in windows
              if subrole of w is "AXDialog" then
                tell group 1 of w
                  repeat with btn in buttons
                    if description of btn contains "Don" then
                      click btn
                      delay 1
                      return "dismissed"
                    end if
                  end repeat
                end tell
              end if
            end repeat
          end try
          delay ${pollIntervalSeconds}
        end repeat
      end tell
    end tell
    return "no-dialog"
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
    exec(`open -g -a "${ABLETON_APP}" "${projectPath}"`, (error) => {
      if (error) {
        reject(new Error(`Failed to open project: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Waits for the dialog watcher process to complete.
 * @param watcher - The dialog watcher child process
 * @returns The output from the watcher ("dismissed" or "no-dialog")
 */
async function dismissUnsavedChangesDialog(
  watcher: ChildProcess,
): Promise<string> {
  return await new Promise((resolve) => {
    let output = "";

    watcher.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    watcher.on("close", () => {
      resolve(output.trim());
    });

    // If process is already closed, resolve immediately
    if (watcher.exitCode !== null) {
      resolve(output.trim());
    }
  });
}

/**
 * Waits for the MCP server to become responsive by establishing a real connection
 * and verifying that the expected tools are available.
 */
async function waitForMcpServer(): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < MCP_POLL_TIMEOUT_MS) {
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

      return;
    } catch {
      // Server not ready yet
    }

    await sleep(MCP_POLL_INTERVAL_MS);
  }

  throw new Error(`MCP server not responsive after ${MCP_POLL_TIMEOUT_MS}ms`);
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
    console.error("Usage: node scripts/eval-lib/open-live-set.ts <path>");
    process.exit(1);
  }

  try {
    await openLiveSet(projectPath);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
