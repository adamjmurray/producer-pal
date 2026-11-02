// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { spawn } from "node:child_process";

/**
 * Keep the display awake until this process exits (macOS only). When the
 * display sleeps, System Events stops seeing Live's windows, so opening a Set
 * can't clear its dialogs and treats Live as stuck. `-d` is the part that
 * matters: `-i` alone lets the display sleep. `-w` ends caffeinate with this
 * process, however it exits.
 *
 * @param platform - The OS to check (defaults to this one)
 * @param spawnProcess - Starts caffeinate (injectable for tests)
 */
export function keepDisplayAwake(
  platform: NodeJS.Platform = process.platform,
  spawnProcess: typeof spawn = spawn,
): void {
  if (platform !== "darwin") {
    return;
  }

  const child = spawnProcess(
    "caffeinate",
    ["-d", "-i", "-w", String(process.pid)],
    { stdio: "ignore" },
  );

  // A missing caffeinate shouldn't stop the run
  child.on("error", () => undefined);
  child.unref();
}
