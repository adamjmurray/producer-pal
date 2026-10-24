// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The remote script listens on 3349, or the next free port when another Live
// has it, and writes the one it got here. No file means a 2.4.0 install.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const REMOTE_SCRIPT_DEFAULT_PORT: number = 3349;

/**
 * Not `configDir()`: the Python script can't see PRODUCER_PAL_CONFIG_DIR, so
 * both sides use the same fixed spot.
 */
const PORT_FILE = join(homedir(), ".producer-pal", "remote-script-port.txt");

/**
 * The port the remote script wrote down. Read on every call; the file is a few
 * bytes.
 * @param file - The port file; tests pass their own
 * @returns The port, or null when the file is missing or isn't a port
 */
export function remoteScriptPortFromFile(file = PORT_FILE): number | null {
  try {
    const text = readFileSync(file, "utf8").trim();
    const port = /^\d+$/.test(text) ? Number(text) : Number.NaN;

    return port >= 1 && port <= 65535 ? port : null;
  } catch {
    return null;
  }
}
