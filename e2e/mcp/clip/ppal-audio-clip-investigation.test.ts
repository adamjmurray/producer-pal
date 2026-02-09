// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Investigation test: probes Live API behavior for warped unlooped audio clips.
 * Uses ppal-raw-live-api to directly read/write clip properties.
 * Results are logged for analysis, not asserted — this is exploratory.
 *
 * Uses: arrangement-clip-tests Live Set
 * - t24: warped unlooped audio, 2:0 clip, 2:0 arr, NO hidden content
 * - t25: warped unlooped audio, 1:1 clip, 1:1 arr, hidden content
 */
import { describe, expect, it } from "vitest";
import { ARRANGEMENT_CLIP_TESTS_PATH } from "./arrangement-lengthening-test-helpers.ts";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({
  once: true,
  liveSetPath: ARRANGEMENT_CLIP_TESTS_PATH,
});

// Track indices for investigation
const T24 = 24; // no hidden content
const T25 = 25; // hidden content

interface RawApiResult {
  path?: string;
  id: string;
  results: Array<{
    operation: { type: string; property?: string; value?: unknown };
    result: unknown;
  }>;
}

/**
 * Call ppal-raw-live-api with operations on a path.
 */
async function rawApi(
  path: string,
  operations: Array<{
    type: string;
    property?: string;
    value?: unknown;
    method?: string;
    args?: unknown[];
  }>,
): Promise<RawApiResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-raw-live-api",
    arguments: { path, operations },
  });

  return parseToolResult<RawApiResult>(result);
}

/**
 * Get the path to the first arrangement clip on a track.
 */
function clipPath(trackIndex: number): string {
  return `live_set tracks ${trackIndex} arrangement_clips 0`;
}

/**
 * Extract clip ID from duplicate_clip_to_arrangement result.
 * Returns result like ["id", 726] → "id 726"
 */
function extractDupId(result: unknown): string {
  if (Array.isArray(result) && result.length === 2) {
    return `${String(result[0])} ${String(result[1])}`;
  }

  return String(result);
}

/**
 * Duplicate a clip to a position and return the id path.
 */
async function duplicateClip(
  trackIndex: number,
  sourceId: string,
  position: number,
): Promise<string> {
  const trackPath = `live_set tracks ${trackIndex}`;
  const dupResult = await rawApi(trackPath, [
    {
      type: "call",
      method: "duplicate_clip_to_arrangement",
      args: [`id ${sourceId}`, position],
    },
  ]);

  return extractDupId(dupResult.results[0]?.result);
}

/**
 * Delete a clip by id path.
 */
async function deleteClip(trackIndex: number, idPath: string): Promise<void> {
  const trackPath = `live_set tracks ${trackIndex}`;

  await rawApi(trackPath, [
    { type: "call", method: "delete_clip", args: [idPath] },
  ]);
}

/**
 * Read a set of properties from a clip and return as a record.
 */
async function readClipProperties(
  path: string,
  properties: string[],
): Promise<Record<string, unknown>> {
  const ops = properties.map((p) => ({ type: "getProperty", property: p }));
  const result = await rawApi(path, ops);
  const record: Record<string, unknown> = {};

  for (let i = 0; i < properties.length; i++) {
    // loop bounds guarantee valid index
    const prop = properties[i] as string;

    record[prop] = result.results[i]?.result;
  }

  return record;
}

const CLIP_PROPS = [
  "start_time",
  "end_time",
  "start_marker",
  "end_marker",
  "loop_start",
  "loop_end",
  "looping",
  "warping",
];

describe("Audio clip property investigation", () => {
  it("Q1: baseline properties for t24 (no hidden) and t25 (hidden)", async () => {
    const t24Props = await readClipProperties(clipPath(T24), CLIP_PROPS);
    const t25Props = await readClipProperties(clipPath(T25), CLIP_PROPS);

    console.log("=== Q1: Baseline Properties ===");
    console.log("t24 (no hidden):", JSON.stringify(t24Props, null, 2));
    console.log("t25 (hidden):", JSON.stringify(t25Props, null, 2));

    expect(t24Props.warping).toBe(1);
    expect(t25Props.warping).toBe(1);
  });

  it("Q2: does set('end_marker', X) change end_time?", async () => {
    const sourceResult = await rawApi(clipPath(T25), [
      { type: "getProperty", property: "end_time" },
      { type: "getProperty", property: "end_marker" },
    ]);

    const origEndTime = sourceResult.results[0]?.result;
    const origEndMarker = sourceResult.results[1]?.result;

    // Duplicate to position 40
    const dupPath = await duplicateClip(T25, sourceResult.id, 40);

    console.log("=== Q2: set('end_marker') effect on end_time ===");
    console.log("Source end_time:", origEndTime, "end_marker:", origEndMarker);
    console.log("Duplicate path:", dupPath);

    // Read dup properties before modification
    const beforeProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "start_marker",
      "end_marker",
    ]);

    console.log("Before set end_marker:", JSON.stringify(beforeProps));

    // Set end_marker to 16
    await rawApi(dupPath, [{ type: "set", property: "end_marker", value: 16 }]);

    await sleep(100);

    const afterProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "start_marker",
      "end_marker",
    ]);

    console.log("After set end_marker=16:", JSON.stringify(afterProps));

    expect(afterProps).toBeDefined();

    // Clean up
    await deleteClip(T25, dupPath);
  });

  it("Q3: does looping workaround change end_time?", async () => {
    const sourceResult = await rawApi(clipPath(T25), [
      { type: "getProperty", property: "start_marker" },
    ]);

    const startMarker = sourceResult.results[0]?.result as number;

    // Duplicate to position 50
    const dupPath = await duplicateClip(T25, sourceResult.id, 50);

    const beforeProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "start_marker",
      "end_marker",
    ]);

    console.log("=== Q3: Looping workaround effect on end_time ===");
    console.log("Before workaround:", JSON.stringify(beforeProps));

    // Apply looping workaround: looping=1 → set markers → looping=0
    await rawApi(dupPath, [
      { type: "set", property: "looping", value: 1 },
      { type: "set", property: "loop_end", value: 16 },
      { type: "set", property: "loop_start", value: startMarker },
      { type: "set", property: "end_marker", value: 16 },
      { type: "set", property: "start_marker", value: startMarker },
      { type: "set", property: "looping", value: 0 },
    ]);

    await sleep(100);

    const afterProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "start_marker",
      "end_marker",
      "loop_start",
      "loop_end",
      "looping",
    ]);

    console.log("After workaround (target 16):", JSON.stringify(afterProps));

    expect(afterProps).toBeDefined();

    // Clean up
    await deleteClip(T25, dupPath);
  });

  it("Q4: does Ableton clamp end_marker to audio file boundary?", async () => {
    const sourceResult = await rawApi(clipPath(T25), [
      { type: "getProperty", property: "start_marker" },
    ]);

    const startMarker = sourceResult.results[0]?.result as number;

    // Duplicate to position 60
    const dupPath = await duplicateClip(T25, sourceResult.id, 60);

    console.log("=== Q4: end_marker clamping ===");

    // Try bare set to huge value
    await rawApi(dupPath, [
      { type: "set", property: "end_marker", value: 99999 },
    ]);

    await sleep(100);

    const afterBareSet = await readClipProperties(dupPath, [
      "end_marker",
      "end_time",
    ]);

    console.log("After set end_marker=99999:", JSON.stringify(afterBareSet));

    // Now try with looping workaround
    await rawApi(dupPath, [
      { type: "set", property: "looping", value: 1 },
      { type: "set", property: "loop_end", value: 99999 },
      { type: "set", property: "loop_start", value: startMarker },
      { type: "set", property: "end_marker", value: 99999 },
      { type: "set", property: "start_marker", value: startMarker },
      { type: "set", property: "looping", value: 0 },
    ]);

    await sleep(100);

    const afterWorkaround = await readClipProperties(dupPath, [
      "end_marker",
      "end_time",
    ]);

    console.log(
      "After workaround end_marker=99999:",
      JSON.stringify(afterWorkaround),
    );

    expect(afterWorkaround).toBeDefined();

    // Clean up
    await deleteClip(T25, dupPath);
  });

  it("Q5: can we set end_time directly?", async () => {
    // Duplicate to position 70
    const sourceResult = await rawApi(clipPath(T25), [
      { type: "getProperty", property: "start_time" },
    ]);

    const dupPath = await duplicateClip(T25, sourceResult.id, 70);

    const beforeProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
    ]);

    console.log("=== Q5: Can we set end_time directly? ===");
    console.log("Before:", JSON.stringify(beforeProps));

    // Try setting end_time directly
    await rawApi(dupPath, [{ type: "set", property: "end_time", value: 86 }]);

    await sleep(100);

    const afterProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "end_marker",
    ]);

    console.log("After set end_time=86:", JSON.stringify(afterProps));

    expect(afterProps).toBeDefined();

    // Clean up
    await deleteClip(T25, dupPath);
  });

  it("Q6: also try on t24 (no hidden content) for comparison", async () => {
    const sourceResult = await rawApi(clipPath(T24), [
      { type: "getProperty", property: "start_marker" },
    ]);

    const startMarker = sourceResult.results[0]?.result as number;

    // Duplicate to position 80
    const dupPath = await duplicateClip(T24, sourceResult.id, 80);

    const beforeProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "start_marker",
      "end_marker",
    ]);

    console.log("=== Q6: t24 (no hidden) looping workaround ===");
    console.log("Before workaround:", JSON.stringify(beforeProps));

    // Apply looping workaround with target 16
    await rawApi(dupPath, [
      { type: "set", property: "looping", value: 1 },
      { type: "set", property: "loop_end", value: 16 },
      { type: "set", property: "loop_start", value: startMarker },
      { type: "set", property: "end_marker", value: 16 },
      { type: "set", property: "start_marker", value: startMarker },
      { type: "set", property: "looping", value: 0 },
    ]);

    await sleep(100);

    const afterProps = await readClipProperties(dupPath, [
      "start_time",
      "end_time",
      "start_marker",
      "end_marker",
    ]);

    console.log("After workaround (target 16):", JSON.stringify(afterProps));

    expect(afterProps).toBeDefined();

    // Clean up
    await deleteClip(T24, dupPath);
  });
});
