#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Live API context probe: measure how per-call latency grows as the device
 * builds LiveAPI objects and visits paths, and tell the two costs apart.
 *
 * There are two, and they behave differently:
 *
 * - Per unique path visited. One-time, persists, saturates. Revisiting a path
 *   already visited is free.
 * - Per object constructed. Unbounded — it keeps climbing on paths that were
 *   registered long ago, and only reloading the device clears it.
 *
 * Telling them apart takes an arm that never repeats a path. Measured on
 * 12.4.3: 40 repeated deep paths read flat (0.99x over 25,000 gotos) while
 * never-repeating paths climbed 1.52x, and re-running that same never-repeating
 * sequence picked up where the first run ended and went flat. An arm on too few
 * paths will report "no growth" no matter how many operations it runs.
 *
 * Compare slopes *within* an arm, not absolute numbers across arms: every arm
 * loads the device further, so a later arm starts slower than an earlier one.
 * Reload the Producer Pal device between arms for comparable baselines.
 *
 * Every arm is read-only. Nothing here writes to the Live Set.
 *
 * Usage:
 *   node scripts/probes/live-api-context-probe.ts                    # goto arm
 *   node scripts/probes/live-api-context-probe.ts goto-fresh 5 100   # arm, rounds, calls
 *
 * Arms:
 *   baseline    50 exists ops per call    — transport + dispatch overhead
 *   goto        50 gotos over few paths   — the false-flat case
 *   goto-fresh  50 gotos, never repeating — exposes per-path cost
 *   read-track  one ppal-read-track call  — per-object cost
 *
 * Requires a debug build (ppal-live-api is not in release builds) and Ableton
 * Live running with the Producer Pal device loaded.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_URL = "http://localhost:3350/mcp";

/** Operations per ppal-live-api call. The tool caps this at 50. */
const OPS_PER_CALL = 50;

/** Shape of the probed Live Set. Only used to build paths that resolve. */
const TRACK_COUNT = 5;
const SLOT_COUNT = 8;

/** Named because it's the one arm that isn't a ppal-live-api operation batch. */
const READ_TRACK = "read-track";

const ARMS = ["baseline", "goto", "goto-fresh", READ_TRACK] as const;

type Arm = (typeof ARMS)[number];

interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// Deep paths that resolve, for the arm that deliberately repeats them.
const repeatedPaths: string[] = [];

for (let track = 0; track < TRACK_COUNT; track++) {
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    repeatedPaths.push(`live_set tracks ${track} clip_slots ${slot} clip`);
  }
}

/**
 * Build the tool call for one iteration of an arm.
 * @param arm - Which arm is running
 * @param n - Global call index, so paths vary across calls
 * @returns The MCP tool call to issue
 */
function callFor(arm: Arm, n: number): ToolCall {
  if (arm === READ_TRACK) {
    return {
      name: "ppal-read-track",
      arguments: { trackIndex: n % TRACK_COUNT },
    };
  }

  const operations = [];

  for (let i = 0; i < OPS_PER_CALL; i++) {
    operations.push(operationFor(arm, n * OPS_PER_CALL + i));
  }

  return { name: "ppal-live-api", arguments: { path: "live_set", operations } };
}

/**
 * Build one operation for a ppal-live-api arm.
 * @param arm - Which arm is running
 * @param seq - Global operation index
 * @returns The operation object
 */
function operationFor(arm: Arm, seq: number): Record<string, unknown> {
  if (arm === "baseline") {
    return { type: "exists" };
  }

  if (arm === "goto-fresh") {
    // Slots past SLOT_COUNT don't resolve, but the path is still distinct and
    // Live still walks live_set.tracks and tracks N.clip_slots to find out.
    // That is enough to pay the registration this arm is looking for.
    return {
      type: "goto",
      value: `live_set tracks ${seq % TRACK_COUNT} clip_slots ${seq} clip`,
    };
  }

  return {
    type: "goto",
    value: repeatedPaths[seq % repeatedPaths.length],
  };
}

/**
 * Run one arm and print per-round means.
 * @param client - Connected MCP client
 * @param arm - Which arm to run
 * @param rounds - Number of rounds
 * @param callsPerRound - Calls per round
 */
async function runArm(
  client: Client,
  arm: Arm,
  rounds: number,
  callsPerRound: number,
): Promise<void> {
  console.log(
    `arm=${arm} rounds=${rounds} callsPerRound=${callsPerRound} ` +
      `opsPerCall=${arm === READ_TRACK ? "n/a" : OPS_PER_CALL}`,
  );

  const means: number[] = [];
  let n = 0;

  for (let round = 1; round <= rounds; round++) {
    const started = performance.now();

    for (let i = 0; i < callsPerRound; i++) {
      await client.callTool(callFor(arm, n++));
    }

    const mean = (performance.now() - started) / callsPerRound;

    means.push(mean);
    console.log(`round ${round}: ${mean.toFixed(1)} ms/call`);
  }

  const first = means[0];
  const last = means.at(-1);

  if (first == null || last == null) return;

  console.log(
    `\nfirst→last: ${first.toFixed(1)} → ${last.toFixed(1)} ms/call ` +
      `(${(last / first).toFixed(2)}x over ${rounds * callsPerRound} calls)`,
  );
}

const [armArg, roundsArg, callsArg] = process.argv.slice(2);
const arm = (armArg ?? "goto") as Arm;

if (!ARMS.includes(arm)) {
  console.error(`Unknown arm: ${arm}. Valid arms: ${ARMS.join(", ")}`);
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(DEFAULT_URL));
const client = new Client(
  { name: "live-api-context-probe", version: "1.0.0" },
  { capabilities: {} },
);

await client.connect(transport);

try {
  await runArm(client, arm, Number(roundsArg ?? 5), Number(callsArg ?? 100));
} finally {
  await client.close();
}
