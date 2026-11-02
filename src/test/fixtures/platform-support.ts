// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What this machine's filesystem can do, for tests that need it */
export const platformSupport = {
  /** Windows refuses symlinks without Developer Mode or admin */
  symlinks: probeSymlinks(),
  /** Windows and root ignore chmod, so a test can't make a folder unreadable */
  fileModes: process.platform !== "win32" && process.getuid?.() !== 0,
};

/**
 * @returns Whether a symlink can be created here
 */
function probeSymlinks(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "ppal-symlink-probe-"));

  try {
    symlinkSync(dir, join(dir, "link"));

    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
