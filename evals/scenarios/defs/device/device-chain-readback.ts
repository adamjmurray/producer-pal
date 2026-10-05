// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Grading for the device-path scenarios: the paths a turn's calls carried, and
 * a track's device chain read back in order.
 */

import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../types.ts";
import { listEntries } from "../path/path-assertions.ts";

/** One device in a track read's flat `devices` list. */
interface ReadDevice {
  /** Device kind and class, e.g. "audio-effect: Utility" or "instrument-rack" */
  type?: string;
  /** Only present when the device has been renamed */
  name?: string;
}

/** What one slot of a device chain should be. */
export interface ExpectedDevice {
  /** Text the device's `type` contains */
  type: string;
  /** Exact name; `null` means never renamed. Left out, the name isn't graded. */
  name?: string | null;
}

/**
 * Every entry of a path param across the successful calls of one tool in a
 * turn. Entries from separate calls and from one comma list count alike, so a
 * batched call and several single calls grade the same.
 *
 * @param turns - All turn results
 * @param options - Which calls to read
 * @param options.turn - Turn index
 * @param options.tool - Tool name
 * @param options.param - Param holding the path list
 * @returns Each path entry, spaces stripped
 */
export function pathEntries(
  turns: EvalTurnResult[],
  options: { turn: number; tool: string; param: "path" | "toPath" },
): string[] {
  return getToolCalls(turns, options.turn)
    .filter((call) => call.name === options.tool)
    .flatMap((call) => listEntries(call.args[options.param]))
    .map((entry) => entry.replaceAll(" ", ""));
}

/**
 * Assert a turn's path entries all have an accepted shape, and that there are
 * as many as the turn needs.
 *
 * @param options - What to grade
 * @param options.turn - Turn index
 * @param options.tool - Tool name
 * @param options.param - Param holding the path list
 * @param options.accepted - Shape every entry must match
 * @param options.count - How many entries the turn should carry in all
 * @param options.what - What the entries should be, for the description
 * @returns A custom assertion
 */
export function assertPathEntries(options: {
  turn: number;
  tool: string;
  param: "path" | "toPath";
  accepted: RegExp;
  count: number;
  what: string;
}): EvalAssertion {
  const { turn, tool, param, accepted, count, what } = options;

  return {
    type: "custom",
    description: `${tool} turn ${turn}: ${param} entries are ${what}`,
    assert: (turns) => {
      const entries = pathEntries(turns, { turn, tool, param });
      const bad = entries.filter((entry) => !accepted.test(entry));

      if (bad.length > 0) {
        throw new Error(
          `not ${what}: ${bad.join(", ")} (sent ${entries.join(", ")})`,
        );
      }

      if (entries.length !== count) {
        throw new Error(
          `${entries.length} ${param} entries, expected ${count}: ${entries.join(", ")}`,
        );
      }

      return true;
    },
  };
}

/**
 * Devices on a read-track result, in chain order.
 *
 * @param result - Parsed ppal-read-track result
 * @returns The track's devices
 */
function trackDevices(result: unknown): ReadDevice[] {
  return (result as { devices?: ReadDevice[] }).devices ?? [];
}

/**
 * Describe a chain for a failure message.
 *
 * @param devices - Devices in chain order
 * @returns "type (name), ..." or "empty"
 */
function describeChain(devices: ReadDevice[]): string {
  if (devices.length === 0) {
    return "empty";
  }

  return devices
    .map((d) => {
      const named = d.name == null ? "" : ` (${d.name})`;

      return `${d.type ?? "?"}${named}`;
    })
    .join(", ");
}

/**
 * Whether a device is what one slot of a chain should hold.
 *
 * @param device - The device read at that slot
 * @param expected - What the slot should hold
 * @returns True when the type matches and any graded name does too
 */
function deviceMatches(
  device: ReadDevice | undefined,
  expected: ExpectedDevice,
): boolean {
  if (device == null || !(device.type ?? "").includes(expected.type)) {
    return false;
  }

  return expected.name === undefined || (device.name ?? null) === expected.name;
}

/**
 * Assert a track's whole device chain, slot by slot, read back through the
 * tools. The order is the point: it shows where each device landed.
 *
 * @param trackPath - Track path, e.g. "t3"
 * @param expected - What each slot holds, first to last
 * @returns A state assertion over read-track
 */
export function assertTrackChain(
  trackPath: string,
  expected: ExpectedDevice[],
): EvalAssertion {
  const wanted = describeChain(
    expected.map((e) => ({
      type: e.type,
      ...(e.name == null ? {} : { name: e.name }),
    })),
  );

  return {
    type: "state",
    tool: "ppal-read-track",
    args: { path: trackPath, include: ["devices"] },
    expect: (result) => {
      const devices = trackDevices(result);

      return (
        devices.length === expected.length &&
        expected.every((slot, i) => deviceMatches(devices[i], slot))
      );
    },
    explain: (result) =>
      `${trackPath} chain: expected ${wanted}, got ${describeChain(trackDevices(result))}`,
  };
}
