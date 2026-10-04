// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which port the remote script is on. Another Live's script may hold 3349 and
// ours sit on a later port, so 3349 wins whenever it answers as the script, or
// this Live's requests could land in the other Live's Set. Only when it doesn't
// do we use the port file.

import {
  REMOTE_SCRIPT_DEFAULT_PORT,
  remoteScriptPortFromFile,
} from "./remote-script-port-file.ts";

/** How long a found port is trusted before looking again. */
const REMEMBER_MS = 5000;

/**
 * How a port answered a probe: `ours` (with whatever the probe learned),
 * `other` (answered, but isn't the script), `none` (refused or no listener), or
 * `slow` (took the connection, then no reply in time).
 */
export type ProbeResult<T> =
  | { kind: "ours"; info: T }
  | { kind: "other" | "none" | "slow" };

/** What the port was found with: `info` only when this call's probe saw our script. */
interface FoundPort<T> {
  port: number;
  info: T | null;
}

let remembered: { port: number; at: number } | null = null;

/**
 * PPAL_REMOTE_SCRIPT_PORT, when it is a port number. Tests point it at their
 * own server (0 for none).
 * @returns The port, or null when it is unset, blank or invalid
 */
export function remoteScriptPortFromEnv(): number | null {
  const raw = process.env.PPAL_REMOTE_SCRIPT_PORT;
  const port = raw == null || raw.trim() === "" ? Number.NaN : Number(raw);

  return Number.isInteger(port) && port >= 0 ? port : null;
}

/**
 * Find the remote script's port: PPAL_REMOTE_SCRIPT_PORT, else 3349 if the
 * script answers there, else the port file, else 3349. The answer is kept for a
 * few seconds, except when 3349 was merely slow: a busy Live still holds 3349,
 * so it is used, but not remembered.
 * @param probe - Asks a port whether the remote script answers there
 * @param now - The time in ms; tests pass their own
 * @returns The port, and the probe's `info` when it just saw our script there
 */
export async function resolveRemoteScriptPort<T>(
  probe: (port: number) => Promise<ProbeResult<T>>,
  now = Date.now(),
): Promise<FoundPort<T>> {
  const fromEnv = remoteScriptPortFromEnv();

  if (fromEnv != null) {
    return { port: fromEnv, info: null };
  }

  if (remembered != null && now - remembered.at < REMEMBER_MS) {
    return { port: remembered.port, info: null };
  }

  const result = await probe(REMOTE_SCRIPT_DEFAULT_PORT);

  if (result.kind === "slow") {
    return { port: REMOTE_SCRIPT_DEFAULT_PORT, info: null };
  }

  const port =
    result.kind === "ours"
      ? REMOTE_SCRIPT_DEFAULT_PORT
      : (remoteScriptPortFromFile() ?? REMOTE_SCRIPT_DEFAULT_PORT);

  remembered = { port, at: now };

  return { port, info: result.kind === "ours" ? result.info : null };
}

/** Drop the remembered port, so the next call looks again. */
export function forgetRemoteScriptPort(): void {
  remembered = null;
}
