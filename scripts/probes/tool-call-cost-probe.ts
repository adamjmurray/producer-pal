#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tool call cost probe: run one tool call over and over and watch what it costs.
 *
 * Two things come back per call — how long it took, and (on an instrumented
 * build) how many LiveAPI objects it resolved and how many of those it had to
 * construct. Read them together. Latency alone can't tell a slow tool from a
 * tool that rebuilds its objects every time, and the build counts alone can't
 * tell you whether the rebuilding costs anything.
 *
 * The shape to look for is a *constructed* count that stays above zero after
 * the first call. That means the pool isn't covering this call, so every repeat
 * pays construction again — and construction registers a context in MxDCore
 * that nothing but a device reload takes back, so latency climbs and never
 * comes down. This is how the free-list ceiling was found to be too low: a deep
 * 64-pad kit read rebuilt 803 objects per call and went 2.2 s to 5.9 s over
 * twelve calls, where a ceiling above the call's own size held it flat at
 * 1.2 s. See live-api-release.ts.
 *
 * Reload the device between runs you mean to compare. Every call loads it
 * further, so a second run starts slower than the first for reasons that have
 * nothing to do with what changed. Reopening the Live Set is the easy way:
 *   ./scripts/open-live-set "path/to/Set.als"
 *
 * The build counts need ENABLE_BUILD_STATS=true npm run build:debug. Without it
 * the probe still times calls and says the counts are missing — it can't tell
 * an uninstrumented build from a tool that resolved nothing.
 *
 * Usage:
 *   node scripts/probes/tool-call-cost-probe.ts <tool> [json-args] [calls]
 *
 * Examples:
 *   node scripts/probes/tool-call-cost-probe.ts ppal-read-live-set '{"include":["*"]}'
 *   node scripts/probes/tool-call-cost-probe.ts ppal-read-device \
 *     '{"path":"t17/d0/c0/d0","include":["*"],"maxDepth":3}' 12
 *
 * Read-only in itself, but it runs whatever tool it's given: pointing it at a
 * write tool runs that write once per call. Requires Ableton Live with the
 * Producer Pal device loaded.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const DEFAULT_URL = "http://localhost:3350/mcp";
const DEFAULT_CALLS = 10;

const STATS_PATTERN =
  /LiveAPI stats: (\d+) resolved, (\d+) distinct, (\d+) constructed/;

interface CallStats {
  resolved: number;
  distinct: number;
  constructed: number;
}

interface CallResult {
  ms: number;
  stats: CallStats | null;
}

/**
 * Pull the build-stats line out of a tool response.
 * @param text - The response text
 * @returns The counts, or null on a build without ENABLE_BUILD_STATS
 */
function parseStats(text: string): CallStats | null {
  const match = STATS_PATTERN.exec(text);

  if (match?.[1] == null || match[2] == null || match[3] == null) return null;

  return {
    resolved: Number(match[1]),
    distinct: Number(match[2]),
    constructed: Number(match[3]),
  };
}

/**
 * Run one tool call and time it.
 * @param client - Connected MCP client
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The elapsed time and the build counts, if the build reports them
 */
async function timeCall(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallResult> {
  const started = performance.now();
  const result = await client.callTool({ name, arguments: args });
  const ms = performance.now() - started;

  // Without this a tool that errors every call reads as a very fast tool.
  if (result.isError === true) {
    throw new Error(`Tool call failed: ${JSON.stringify(result)}`);
  }

  const content = result.content as { text?: string }[] | undefined;
  const text = (content ?? []).map((part) => part.text ?? "").join("\n");

  return { ms, stats: parseStats(text) };
}

/**
 * Print the closing summary: the trend, and whether the pool covered the call.
 * @param results - Every call's result, in order
 */
function report(results: CallResult[]): void {
  const first = results[0];
  const last = results.at(-1);

  if (first == null || last == null) return;

  console.log(
    `\nfirst→last: ${first.ms.toFixed(0)} → ${last.ms.toFixed(0)} ms ` +
      `(${(last.ms / first.ms).toFixed(2)}x over ${String(results.length)} calls)`,
  );

  const repeats = results.slice(1);

  if (repeats.length === 0) return;

  if (repeats.some(({ stats }) => stats == null)) {
    console.log(
      "no LiveAPI build counts — rebuild with ENABLE_BUILD_STATS=true to get them",
    );

    return;
  }

  const rebuilt = repeats.filter(({ stats }) => (stats?.constructed ?? 0) > 0);

  console.log(
    rebuilt.length === 0
      ? "pool covers this call: nothing constructed after the first"
      : `POOL TOO SMALL: ${String(rebuilt.length)} of ${String(repeats.length)} ` +
          `repeats still constructed objects (up to ` +
          `${String(Math.max(...rebuilt.map(({ stats }) => stats?.constructed ?? 0)))})`,
  );
}

/**
 * Read a positive-integer argument, rather than letting a typo become NaN — a
 * NaN count runs zero calls, prints nothing, and exits 0.
 * @param value - The raw argument, if given
 * @param fallback - Value to use when the argument is absent
 * @returns The call count to use
 */
function callCount(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`Invalid call count: ${value}. Expected a positive integer.`);
    process.exit(1);
  }

  return parsed;
}

/**
 * Parse the tool arguments, so a malformed JSON argument fails here rather than
 * as an unexplained tool error on every call.
 * @param value - The raw argument, if given
 * @returns The parsed arguments
 */
function toolArgs(value: string | undefined): Record<string, unknown> {
  if (value == null) return {};

  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    console.error(`Invalid JSON arguments: ${value}`);
    process.exit(1);
  }

  return parsed;
}

const [toolName, argsJson, callsArg] = process.argv.slice(2);

if (toolName == null) {
  console.error(
    "Usage: node scripts/probes/tool-call-cost-probe.ts <tool> [json-args] [calls]",
  );
  process.exit(1);
}

const args = toolArgs(argsJson);
const calls = callCount(callsArg, DEFAULT_CALLS);

const transport = new StreamableHTTPClientTransport(new URL(DEFAULT_URL));
const client = new Client(
  { name: "tool-call-cost-probe", version: "1.0.0" },
  { capabilities: {} },
);

await client.connect(transport);

console.log(
  `tool=${toolName} args=${JSON.stringify(args)} calls=${String(calls)}`,
);

try {
  const results: CallResult[] = [];

  for (let call = 1; call <= calls; call++) {
    const result = await timeCall(client, toolName, args);

    results.push(result);
    console.log(
      `${String(call).padStart(3)}  ${result.ms.toFixed(0).padStart(6)} ms  ` +
        (result.stats == null
          ? "(no build counts)"
          : `resolved=${String(result.stats.resolved)} ` +
            `distinct=${String(result.stats.distinct)} ` +
            `constructed=${String(result.stats.constructed)}`),
    );
  }

  report(results);
} finally {
  await client.close();
}
