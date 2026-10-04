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

/**
 * How a port answered a probe, with what the probe learned: `ours`, `other`
 * (answered, but isn't the script), `none` (refused or no listener), or `slow`
 * (took the connection, then no reply in time).
 */
export interface ProbeResult<T> {
  kind: "ours" | "other" | "none" | "slow";
  info: T;
}

/** The port, and the probe's `info` when this call probed that same port. */
interface FoundPort<T> {
  port: number;
  info: T | null;
}

let remembered: number | null = null;

/** The probe in flight, which calls made meanwhile wait on. */
let pending: Promise<FoundPort<unknown>> | null = null;

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
 * script answers there, else the port file, else 3349. The port is kept until
 * `forgetRemoteScriptPort`, so a Live too busy to answer a ping can't lose it.
 * A 3349 that is merely slow is used but not kept.
 * @param probe - Asks a port whether the remote script answers there
 * @returns The port, and the probe's `info` when it probed that port just now
 */
export async function resolveRemoteScriptPort<T>(
  probe: (port: number) => Promise<ProbeResult<T>>,
): Promise<FoundPort<T>> {
  const fromEnv = remoteScriptPortFromEnv();

  if (fromEnv != null) {
    return { port: fromEnv, info: null };
  }

  if (remembered != null) {
    return { port: remembered, info: null };
  }

  // Calls made together share one probe: a burst of probes plus the requests
  // behind them overflows the remote script's listen queue, and the refused
  // ones read as the script missing.
  pending ??= probePorts(probe).finally(() => {
    pending = null;
  });

  return (await pending) as FoundPort<T>;
}

/**
 * Probe 3349, then fall back to the port file.
 * @param probe - Asks a port whether the remote script answers there
 * @returns The port, and the probe's `info` when it probed that port just now
 */
async function probePorts<T>(
  probe: (port: number) => Promise<ProbeResult<T>>,
): Promise<FoundPort<T>> {
  const result = await probe(REMOTE_SCRIPT_DEFAULT_PORT);

  if (result.kind === "slow") {
    return { port: REMOTE_SCRIPT_DEFAULT_PORT, info: result.info };
  }

  if (result.kind === "ours") {
    remembered = REMOTE_SCRIPT_DEFAULT_PORT;

    return { port: remembered, info: result.info };
  }

  const fromFile = remoteScriptPortFromFile();

  remembered = fromFile ?? REMOTE_SCRIPT_DEFAULT_PORT;

  return {
    port: remembered,
    info: remembered === REMOTE_SCRIPT_DEFAULT_PORT ? result.info : null,
  };
}

/** Drop the remembered port, so the next call looks again. */
export function forgetRemoteScriptPort(): void {
  remembered = null;
}
