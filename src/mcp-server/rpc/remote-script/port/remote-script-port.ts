// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Which port the remote script is on. Another Live's script may hold 3349 and
// ours sit on a later port, so 3349 wins whenever it answers as the script, or
// this Live's requests could land in the other Live's Set. Only when it doesn't
// do we try the port file's port.

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
 * script answers there, else the port file's if it answers there, else 3349.
 * A port that answered as the script is kept until `forgetRemoteScriptPort`,
 * so a Live too busy to answer a ping can't lose it. Any other port is used
 * but not kept, so the next call looks again.
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
 * Probe 3349, then the port file's port.
 * @param probe - Asks a port whether the remote script answers there
 * @returns The port, and the probe's `info` for it
 */
async function probePorts<T>(
  probe: (port: number) => Promise<ProbeResult<T>>,
): Promise<FoundPort<T>> {
  const preferred = await probeOne(REMOTE_SCRIPT_DEFAULT_PORT, probe);

  if (preferred.usable) {
    return preferred.found;
  }

  // The file can be left over from a Live that has quit, with another program
  // on its port by now, so its port has to answer as the script too.
  const fromFile = remoteScriptPortFromFile();

  if (fromFile != null && fromFile !== REMOTE_SCRIPT_DEFAULT_PORT) {
    const filed = await probeOne(fromFile, probe);

    if (filed.usable) {
      return filed.found;
    }
  }

  return preferred.found;
}

/**
 * Probe one port, and keep it when the script answers there.
 * @param port - The port to ask
 * @param probe - Asks a port whether the remote script answers there
 * @returns What was found, and whether the script is there (answering or slow)
 */
async function probeOne<T>(
  port: number,
  probe: (port: number) => Promise<ProbeResult<T>>,
): Promise<{ usable: boolean; found: FoundPort<T> }> {
  const result = await probe(port);

  if (result.kind === "ours") {
    remembered = port;
  }

  return {
    usable: result.kind === "ours" || result.kind === "slow",
    found: { port, info: result.info },
  };
}

/** Drop the remembered port, so the next call looks again. */
export function forgetRemoteScriptPort(): void {
  remembered = null;
}
