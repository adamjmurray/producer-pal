// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared query helpers for arrangement clip e2e tests: calling a tool, reading
 * a track's arrangement clips, and measuring what came back.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { durationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  parseToolResult,
  type ReadClipResult,
  sleep,
} from "../../mcp-test-helpers.ts";
import { readClipsOnTrack } from "./arrangement-lengthening-test-helpers.ts";
import { arrangementStartOf } from "./arrangement-start-test-helpers.ts";

/** The subset of a clip result these helpers read back. */
export interface ArrangementClipResult {
  id: string;
  /** Where the clip is, e.g. "t0[5|1]" */
  path?: string;
  arrangementLength?: string;
}

/**
 * Call an MCP tool with the given arguments.
 * @param client - Connected MCP client
 * @param name - Tool name (e.g. "ppal-update-clip")
 * @param args - Tool arguments
 * @returns Raw tool result
 */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return client.callTool({ name, arguments: args });
}

/**
 * Duplicate a clip to an arrangement position and let Live settle.
 * @param client - Connected MCP client
 * @param id - Source clip ID
 * @param arrangementStart - Target position in bar|beat format
 * @returns The copy's metadata
 */
export async function duplicateClipToArrangement(
  client: Client,
  id: string,
  arrangementStart: string,
): Promise<ArrangementClipResult> {
  const result = await callTool(client, "ppal-duplicate", {
    type: "clip",
    id,
    arrangementStart,
  });
  const clip = parseToolResult<ArrangementClipResult>(result);

  await sleep(100);

  return clip;
}

/**
 * Read all arrangement clips on a track.
 * @param client - Connected MCP client
 * @param trackIndex - Track index
 * @returns Array of arrangement clip data
 */
export async function readArrangementClips(
  client: Client,
  trackIndex: number,
): Promise<ReadClipResult[]> {
  return (await readClipsOnTrack(client, trackIndex)).clips;
}

/**
 * Filter clips whose bar number falls within [minBar, maxBar].
 * @param clips - Array of clip results
 * @param minBar - Minimum bar number (inclusive)
 * @param maxBar - Maximum bar number (inclusive)
 * @returns Filtered clips, in arrangement order
 */
export function clipsInBarRange(
  clips: ReadClipResult[],
  minBar: number,
  maxBar: number,
): ReadClipResult[] {
  return clips.filter((c) => {
    const bar = Number.parseInt(arrangementStartOf(c)?.split("|")[0] ?? "", 10);

    return bar >= minBar && bar <= maxBar;
  });
}

/**
 * Find a clip at an exact arrangement position.
 * @param clips - Array of clip results
 * @param arrangementStart - Position in bar|beat format
 * @returns The matching clip, if any
 */
export function clipAt(
  clips: ReadClipResult[],
  arrangementStart: string,
): ReadClipResult | undefined {
  return clips.find((c) => arrangementStartOf(c) === arrangementStart);
}

/**
 * Get a clip's arrangement length in beats.
 * @param clip - Clip result (must have arrangementLength)
 * @returns Length in Ableton beats (4/4)
 */
export function lengthBeats(clip: ReadClipResult | undefined): number {
  if (!clip?.arrangementLength) {
    throw new Error("clip missing arrangementLength");
  }

  return beats(clip.arrangementLength);
}

/**
 * Parse a duration string to absolute beats (4/4). Handles every output shape:
 * "Nbar", "n<fraction>", "Nbar+n<fraction>", and off-grid bare beats.
 * @param duration - Duration string (e.g. "4bar")
 * @returns Length in Ableton beats
 */
export function beats(duration: string): number {
  return durationToAbletonBeats(duration, 4, 4);
}
