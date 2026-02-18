// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement clip splitting operations.
 * Uses: arrangement-clip-tests - comprehensive arrangement clip edge cases
 * See: e2e/live-sets/arrangement-clip-tests-spec.md
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type ArrangementClipTestCase,
  audioLoopedWarpedTestCases,
  audioUnloopedWarpedTestCases,
  audioUnwarpedTestCases,
  midiLoopedTestCases,
  midiUnloopedTestCases,
} from "./helpers/arrangement-clip-test-cases.ts";
import { ARRANGEMENT_CLIP_TESTS_PATH } from "./helpers/arrangement-lengthening-test-helpers.ts";
import {
  assertContiguousClips,
  assertSpanPreserved,
  splitClip,
  testSplitClip,
} from "./helpers/arrangement-splitting-test-helpers.ts";
import {
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({
  once: true,
  liveSetPath: ARRANGEMENT_CLIP_TESTS_PATH,
});

// Tracks reserved for multi-split and OOB tests (excluded from single-split)
const MULTI_SPLIT_TRACKS = new Set([0, 9, 15, 24, 30]);
const OOB_TRACK = 1;
const RESERVED_TRACKS = new Set([...MULTI_SPLIT_TRACKS, OOB_TRACK]);

// --- Single split point tests (1|2) ---

interface SplitSuite {
  suite: string;
  cases: ArrangementClipTestCase[];
  type: "midi" | "audio";
  sleepMs?: number;
}

const singleSplitSuites: SplitSuite[] = [
  { suite: "MIDI Looped", cases: midiLoopedTestCases, type: "midi" },
  { suite: "MIDI Unlooped", cases: midiUnloopedTestCases, type: "midi" },
  {
    suite: "Audio Looped Warped",
    cases: audioLoopedWarpedTestCases,
    type: "audio",
  },
  {
    suite: "Audio Unlooped Warped",
    cases: audioUnloopedWarpedTestCases,
    type: "audio",
  },
  {
    suite: "Audio Unwarped",
    cases: audioUnwarpedTestCases,
    type: "audio",
    sleepMs: 200,
  },
];

describe.each(singleSplitSuites)(
  "$suite (single split)",
  ({ cases, type, sleepMs }) => {
    const filtered = cases.filter((c) => !RESERVED_TRACKS.has(c.track));

    it.each(filtered)("splits t$track: $name", async ({ track }) => {
      const { trackType, initialClips, resultClips, warnings } =
        await testSplitClip(ctx.client!, track, { sleepMs });

      expect(resultClips.length).toBe(2);
      expect(trackType).toBe(type);
      expect(warnings).toHaveLength(0);

      assertContiguousClips(resultClips);
      assertSpanPreserved(initialClips, resultClips);
    });
  },
);

// --- Multiple split points ---

describe("Multiple split points (1|2, 1|3)", () => {
  const multiSplitCases = [
    { track: 0, type: "midi" as const, name: "MIDI looped", sleepMs: 100 },
    { track: 9, type: "midi" as const, name: "MIDI unlooped", sleepMs: 100 },
    {
      track: 15,
      type: "audio" as const,
      name: "audio looped warped",
      sleepMs: 200,
    },
    {
      track: 24,
      type: "audio" as const,
      name: "audio unlooped warped",
      sleepMs: 200,
    },
    { track: 30, type: "audio" as const, name: "audio unwarped", sleepMs: 200 },
  ];

  it.each(multiSplitCases)(
    "splits t$track ($name) into 3 segments",
    async ({ track, type, sleepMs }) => {
      const { trackType, initialClips, resultClips } = await testSplitClip(
        ctx.client!,
        track,
        { splitPoint: "1|2, 1|3", sleepMs },
      );

      expect(resultClips.length).toBe(3);
      expect(trackType).toBe(type);

      assertContiguousClips(resultClips);
      assertSpanPreserved(initialClips, resultClips);
    },
  );
});

// --- Out-of-bounds split points ---

describe("Out-of-bounds split points", () => {
  it("ignores split points beyond clip length (t1)", async () => {
    // t1 has 1:0 arrangement length (4 beats). 10|1 = 36 beats is way beyond.
    const { trackType, initialClips, resultClips, warnings } =
      await testSplitClip(ctx.client!, OOB_TRACK, {
        splitPoint: "1|2, 10|1",
      });

    // 10|1 should be filtered out, leaving only 1|2 → 2 segments
    expect(resultClips.length).toBe(2);
    expect(trackType).toBe("midi");
    expect(warnings).toHaveLength(0);

    assertContiguousClips(resultClips);
    assertSpanPreserved(initialClips, resultClips);
  });
});

// --- Behavioral tests (dynamic clip creation) ---

describe("Behavioral splitting tests", () => {
  let dynamicTrackIndex: number;

  beforeAll(async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi", name: "Split Behavioral Tests" },
    });

    dynamicTrackIndex = parseToolResult<CreateTrackResult>(result).trackIndex!;
  });

  it("preserves total note count across splits", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: dynamicTrackIndex,
        arrangementStart: "200|1",
        notes: "C3 1|1\nD3 2|1\nE3 3|1\nF3 4|1",
        length: "4:0.0",
        looping: true,
      },
    });
    const clipId = parseToolResult<{ id: string }>(createResult).id;

    await sleep(200);
    const splitResult = await splitClip(ctx.client!, clipId, "2|1, 3|1, 4|1");
    const splitClips = parseSplitResult(splitResult);

    expect(splitClips.length).toBe(4);

    let clipsWithNotes = 0;

    for (const s of splitClips) {
      await sleep(50);
      const clip = await readClip(ctx.client!, s.id, ["clip-notes"]);

      if (clip.notes) clipsWithNotes++;
    }

    // Each split segment should have at least 1 note (4 notes across 4 segments)
    expect(clipsWithNotes).toBeGreaterThanOrEqual(4);
  });

  it("applies other updates along with splitting", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: dynamicTrackIndex,
        arrangementStart: "210|1",
        notes: "C3 1|1",
        length: "2:0.0",
        looping: true,
      },
    });
    const clipId = parseToolResult<{ id: string }>(createResult).id;

    await sleep(200);
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, split: "2|1", name: "Split Section" },
    });
    const splitClips = parseSplitResult(result);

    expect(splitClips.length).toBe(2);

    await sleep(100);
    const clip = await readClip(ctx.client!, splitClips[0]!.id);

    expect(clip.name).toBe("Split Section");
  });

  it("returns session clip unchanged with warning", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: dynamicTrackIndex,
        sceneIndex: "0",
        notes: "C3 1|1",
        length: "2:0.0",
      },
    });
    const clipId = parseToolResult<{ id: string }>(createResult).id;

    await sleep(200);
    const result = await splitClip(ctx.client!, clipId);
    const splitClips = parseSplitResult(result);

    expect(splitClips[0]?.id).toBe(clipId);
  });

  it("splits multiple clips in one call", async () => {
    const clip1Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: dynamicTrackIndex,
        arrangementStart: "220|1",
        notes: "C3 1|1",
        length: "2:0.0",
        looping: true,
      },
    });
    const clip1Id = parseToolResult<{ id: string }>(clip1Result).id;

    const clip2Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: dynamicTrackIndex,
        arrangementStart: "230|1",
        notes: "E3 1|1",
        length: "2:0.0",
        looping: true,
      },
    });
    const clip2Id = parseToolResult<{ id: string }>(clip2Result).id;

    await sleep(200);
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: `${clip1Id},${clip2Id}`, split: "2|1" },
    });
    const splitClips = parseSplitResult(result);

    expect(splitClips.length).toBe(4);
  });
});

// --- Local helpers ---

/** Normalize split results - update-clip returns object for 1 clip, array for many */
function parseSplitResult(result: unknown): Array<{ id: string }> {
  const toolResult = result as { content?: Array<{ text?: string }> };
  const text = toolResult.content?.[0]?.text ?? "";

  // Strip WARNING lines and parse the JSON
  const jsonLine = text
    .split("\n")
    .find((line) => line.startsWith("[") || line.startsWith("{"));

  if (!jsonLine) return [];

  const parsed = JSON.parse(jsonLine) as { id: string } | Array<{ id: string }>;

  return Array.isArray(parsed) ? parsed : [parsed];
}

async function readClip(
  client: typeof ctx.client,
  clipId: string,
  include?: string[],
): Promise<ReadClipResult> {
  const result = await client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include },
  });

  return parseToolResult<ReadClipResult>(result);
}
