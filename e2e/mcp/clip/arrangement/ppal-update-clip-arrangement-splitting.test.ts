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
} from "../helpers/arrangement-clip-test-cases.ts";
import {
  ARRANGEMENT_CLIP_TESTS_PATH,
  EPSILON,
  parseBarBeat,
  readClipsOnTrack,
} from "../helpers/arrangement-lengthening-test-helpers.ts";
import {
  assertContiguousClips,
  assertSpanPreserved,
  splitClip,
  testSplitClip,
  toSongPositions,
} from "../helpers/arrangement-splitting-test-helpers.ts";
import {
  type CreateTrackResult,
  getToolWarnings,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";

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
    // A cut happened, so the dropped position is the part that has to be said.
    expect(warnings.join("\n")).toContain("cut nothing at");

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

  /**
   * Read only the clips in one test's own span — the track is shared.
   * @param startBar - First bar of the span
   * @param bars - Span length in bars
   * @returns Clips starting inside the span, in timeline order
   */
  async function clipsInSpan(
    startBar: number,
    bars: number,
  ): Promise<ReadClipResult[]> {
    const { clips } = await readClipsOnTrack(ctx.client!, dynamicTrackIndex);
    const spanStart = startBar - 1;
    const startOf = (clip: ReadClipResult): number =>
      clip.arrangementStart ? parseBarBeat(clip.arrangementStart) : -1;

    return clips
      .filter((c) => {
        const start = startOf(c);

        return (
          start >= spanStart - EPSILON && start < spanStart + bars - EPSILON
        );
      })
      .toSorted((a, b) => startOf(a) - startOf(b));
  }

  it("preserves total note count across splits", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${dynamicTrackIndex}`,
        arrangementStart: "200|1",
        notes: "C3 1|1\nD3 2|1\nE3 3|1\nF3 4|1",
        length: "4bar",
        looping: true,
      },
    });
    const clipId = parseToolResult<{ id: string }>(createResult).id;

    await sleep(200);
    // The clip runs from song bar 200 to 204, so cut it on each bar line.
    const splitResult = await splitClip(
      ctx.client!,
      clipId,
      "201|1, 202|1, 203|1",
    );
    const splitClips = parseSplitResult(splitResult);

    expect(splitClips.length).toBe(4);

    let clipsWithNotes = 0;

    for (const s of splitClips) {
      await sleep(50);
      const clip = await readClip(ctx.client!, s.id, ["notes"]);

      if (clip.notes) clipsWithNotes++;
    }

    // Each split segment should have at least 1 note (4 notes across 4 segments)
    expect(clipsWithNotes).toBeGreaterThanOrEqual(4);
  });

  it("applies other updates along with splitting", async () => {
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${dynamicTrackIndex}`,
        arrangementStart: "210|1",
        notes: "C3 1|1",
        length: "2bar",
        looping: true,
      },
    });
    const clipId = parseToolResult<{ id: string }>(createResult).id;

    await sleep(200);
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: clipId,
        arrangementSplit: "211|1",
        name: "Split Section",
      },
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
        path: `t${dynamicTrackIndex}/s0`,
        notes: "C3 1|1",
        length: "2bar",
      },
    });
    const clipId = parseToolResult<{ id: string }>(createResult).id;

    await sleep(200);
    const result = await splitClip(ctx.client!, clipId, "2|1");
    const splitClips = parseSplitResult(result);

    expect(splitClips[0]?.id).toBe(clipId);
  });

  it("splits multiple clips in one call", async () => {
    const clip1Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${dynamicTrackIndex}`,
        arrangementStart: "220|1",
        notes: "C3 1|1",
        length: "2bar",
        looping: true,
      },
    });
    const clip1Id = parseToolResult<{ id: string }>(clip1Result).id;

    const clip2Result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${dynamicTrackIndex}`,
        arrangementStart: "230|1",
        notes: "E3 1|1",
        length: "2bar",
        looping: true,
      },
    });
    const clip2Id = parseToolResult<{ id: string }>(clip2Result).id;

    await sleep(200);
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        ids: `${clip1Id},${clip2Id}`,
        // One position per clip. Each falls outside the other clip, which
        // ignores it — that filtering is what lets one call cut both.
        arrangementSplit: "221|1, 231|1",
      },
    });
    const splitClips = parseSplitResult(result);

    expect(splitClips.length).toBe(4);
  });

  // The two params read the same bar|beat text on different timelines. A clip
  // that starts away from bar 1 is the only place that difference shows.
  describe("split position coordinates", () => {
    /**
     * Create a 4-bar looped MIDI clip at `startBar`.
     * @param startBar - Arrangement bar to place the clip at
     * @returns The new clip's id
     */
    async function createFourBarClip(startBar: number): Promise<string> {
      const result = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          path: `t${dynamicTrackIndex}`,
          arrangementStart: `${startBar}|1`,
          notes: "C3 1|1",
          length: "4bar",
          looping: true,
        },
      });

      return parseToolResult<{ id: string }>(result).id;
    }

    it("cuts arrangementSplit at the song bar the user named", async () => {
      // The reported failure, in miniature: a clip at bar 400 asked to split at
      // bar 402 must cut there, not 2 bars past its own start.
      const clipId = await createFourBarClip(400);

      await sleep(200);
      const result = await splitClip(ctx.client!, clipId, "402|1");

      expect(getToolWarnings(result)).toHaveLength(0);

      await sleep(200);
      const clips = await clipsInSpan(400, 4);

      expect(clips.map((c) => c.arrangementStart)).toStrictEqual([
        "400|1",
        "402|1",
      ]);
    });

    it("ignores an arrangementSplit position outside the clip", async () => {
      const clipId = await createFourBarClip(410);

      await sleep(200);
      // Bar 2 of the song is nowhere near this clip. Under the old param this
      // was a cut 1 bar in; now it warns instead of cutting the wrong place.
      const result = await splitClip(ctx.client!, clipId, "2|1");

      expect(getToolWarnings(result).join("\n")).toContain(
        "no split point falls inside any of the clips",
      );

      await sleep(200);
      const clips = await clipsInSpan(410, 4);

      expect(clips).toHaveLength(1);
      expect(clips[0]?.id).toBe(clipId);
    });

    it("still measures the deprecated split from the clip's start", async () => {
      const clipId = await createFourBarClip(420);

      await sleep(200);
      // 3|1 means "2 bars in" here, so the cut lands on song bar 422.
      const result = await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { ids: clipId, split: "3|1" },
      });

      expect(getToolWarnings(result).join("\n")).toContain(
        'param "split" is deprecated',
      );

      await sleep(200);
      const clips = await clipsInSpan(420, 4);

      expect(clips.map((c) => c.arrangementStart)).toStrictEqual([
        "420|1",
        "422|1",
      ]);
    });

    it("splits nothing when both split params are given", async () => {
      const clipId = await createFourBarClip(430);

      await sleep(200);
      const result = await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { ids: clipId, arrangementSplit: "432|1", split: "3|1" },
      });

      expect(getToolWarnings(result).join("\n")).toContain(
        "both name split positions",
      );

      await sleep(200);
      const clips = await clipsInSpan(430, 4);

      expect(clips).toHaveLength(1);
    });
  });

  // A point within EPSILON of an edge asks for a zero-length segment. Splitting
  // skips edge trims below that threshold, and the moves that follow assume
  // every trim ran — they place segments without checking for an occupant. So
  // accepting one leaves slivers and overlapping clips, and an overlap is what
  // crashes Live on the next duplicate. Mocks pass either way; these don't.
  describe("split points hugging a clip edge", () => {
    /**
     * Create a 2-bar looped MIDI clip at `startBar`.
     * @param startBar - Arrangement bar to place the clip at
     * @returns The new clip's id
     */
    async function createTwoBarClip(startBar: number): Promise<string> {
      const result = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          path: `t${dynamicTrackIndex}`,
          arrangementStart: `${startBar}|1`,
          notes: "C3 1|1\nE3 2|1",
          length: "2bar",
          looping: true,
        },
      });

      return parseToolResult<{ id: string }>(result).id;
    }

    // The clip is 8 beats, so 1|1.0005 sits 0.0005 beats past its start and
    // 2|4.9995 sits 0.0005 beats before its end.
    it.each([
      { where: "start", startBar: 300, split: "1|1.0005, 2|1" },
      { where: "end", startBar: 310, split: "2|1, 2|4.9995" },
    ])(
      "ignores a point at the $where and splits at the rest",
      async ({ startBar, split }) => {
        const clipId = await createTwoBarClip(startBar);

        await sleep(200);
        const initialClips = await clipsInSpan(startBar, 2);
        const result = await splitClip(
          ctx.client!,
          clipId,
          toSongPositions(`${startBar}|1`, split),
        );

        expect(getToolWarnings(result).join("\n")).toContain("cut nothing at");

        await sleep(200);
        const resultClips = await clipsInSpan(startBar, 2);

        // Two equal halves: the dropped point moved no boundary.
        expect(resultClips.map((c) => c.arrangementLength)).toStrictEqual([
          "1bar",
          "1bar",
        ]);
        assertContiguousClips(resultClips);
        assertSpanPreserved(initialClips, resultClips);
      },
    );

    it("leaves the clip alone when every point hugs an edge", async () => {
      const clipId = await createTwoBarClip(320);

      await sleep(200);
      const result = await splitClip(
        ctx.client!,
        clipId,
        toSongPositions("320|1", "1|1.0005"),
      );

      expect(getToolWarnings(result).join("\n")).toContain(
        "no split point falls inside any of the clips",
      );

      await sleep(200);
      const clips = await clipsInSpan(320, 2);

      expect(clips).toHaveLength(1);
      expect(clips[0]?.id).toBe(clipId);
    });
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
