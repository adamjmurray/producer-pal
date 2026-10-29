// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading and writing a clip's loop brace and markers straight through Live, for
 * e2e suites that check what Live kept. ppal-read-clip shows only one pair (the
 * loop while looping, the markers otherwise), so these go below it. The suite
 * must turn the direct Live API on: `setConfig({ liveApiEnabled: true })` in a
 * `beforeEach`.
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { expect } from "vitest";
import { sleep } from "../../mcp-test-helpers.ts";
import { liveApi } from "./arrangement-lane-test-helpers.ts";

/** A clip's loop brace and markers in beats, as Live holds them. */
export interface ClipRegion {
  looping: boolean;
  loop_start: number;
  loop_end: number;
  start_marker: number;
  end_marker: number;
}

const REGION_PROPERTIES = [
  "looping",
  "loop_start",
  "loop_end",
  "start_marker",
  "end_marker",
] as const;

/**
 * Read a clip's loop brace, markers and looping flag.
 * @param client - The connected MCP client
 * @param clipId - The clip's Live API id
 * @returns The region Live reports
 */
export async function readRegion(
  client: Client,
  clipId: string,
): Promise<ClipRegion> {
  const [looping, loopStart, loopEnd, startMarker, endMarker] =
    await getProperties(client, clipId, REGION_PROPERTIES);

  return {
    looping: Number(looping) > 0,
    loop_start: loopStart!,
    loop_end: loopEnd!,
    start_marker: startMarker!,
    end_marker: endMarker!,
  };
}

/**
 * Set a clip's region one property at a time, in an order that is safe when the
 * new region sits inside the clip's current one (the end of each pair first,
 * so no start is ever written past an end).
 * @param client - The connected MCP client
 * @param clipId - The clip's Live API id
 * @param region - The region to set
 */
export async function writeRegion(
  client: Client,
  clipId: string,
  region: ClipRegion,
): Promise<void> {
  // looping first, then each pair's end before its start
  const writes: Array<[string, number]> = [
    ["looping", region.looping ? 1 : 0],
    ["loop_end", region.loop_end],
    ["end_marker", region.end_marker],
    ["start_marker", region.start_marker],
    ["loop_start", region.loop_start],
  ];

  await liveApi(
    client,
    `id ${clipId}`,
    writes.map(([property, value]) => ({
      type: "set-property",
      property,
      value,
    })),
  );
  await sleep(100);
}

/**
 * Set a clip's region and check Live kept all of it, so a test that builds on
 * the region fails here, plainly, when Live refused part of the setup.
 * @param client - The connected MCP client
 * @param clipId - The clip's Live API id
 * @param region - The region to set
 */
export async function shapeRegion(
  client: Client,
  clipId: string,
  region: ClipRegion,
): Promise<void> {
  await writeRegion(client, clipId, region);

  expect(
    await readRegion(client, clipId),
    "setup: Live did not keep the region the test wrote",
  ).toStrictEqual(region);
}

/**
 * How long an arrangement clip sits on the timeline.
 * @param client - The connected MCP client
 * @param clipId - The clip's Live API id
 * @returns End time minus start time, in beats
 */
export async function arrangementSpanBeats(
  client: Client,
  clipId: string,
): Promise<number> {
  const [start, end] = await getProperties(client, clipId, [
    "start_time",
    "end_time",
  ]);

  return end! - start!;
}

/**
 * Read properties off a clip.
 * @param client - The connected MCP client
 * @param clipId - The clip's Live API id
 * @param properties - The property names
 * @returns The values, in the order asked
 */
async function getProperties(
  client: Client,
  clipId: string,
  properties: readonly string[],
): Promise<number[]> {
  const { results } = await liveApi(
    client,
    `id ${clipId}`,
    properties.map((property) => ({ type: "get-property", property })),
  );

  return results as number[];
}
