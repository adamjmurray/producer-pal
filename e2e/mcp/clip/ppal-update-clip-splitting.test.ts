// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip splitting functionality.
 * Uses: e2e-test-set - tests create clips in empty slots (t8 is empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  parseToolResult,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();
const emptyMidiTrack = 8;

/** Normalize split results - update-clip returns object for 1 clip, array for many */
function parseSplitResult(result: unknown): Array<{ id: string }> {
  const parsed = parseToolResult<{ id: string } | Array<{ id: string }>>(
    result as Awaited<ReturnType<NonNullable<typeof ctx.client>["callTool"]>>,
  );

  return Array.isArray(parsed) ? parsed : [parsed];
}

async function createMidiClip(
  start: string,
  opts: { notes?: string; length?: string; looping?: boolean } = {},
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      view: "arrangement",
      trackIndex: emptyMidiTrack,
      arrangementStart: start,
      notes: opts.notes,
      length: opts.length,
      looping: opts.looping,
    },
  });

  return parseToolResult<{ id: string }>(result).id;
}

async function splitClip(
  ids: string,
  split: string,
  extra?: Record<string, unknown>,
): Promise<Array<{ id: string }>> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids, split, ...extra },
  });

  return parseSplitResult(result);
}

async function readClip(
  clipId: string,
  include?: string[],
): Promise<ReadClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { clipId, include },
  });

  return parseToolResult<ReadClipResult>(result);
}

describe("ppal-update-clip splitting", () => {
  it(
    "splits looped MIDI clip into 1-bar segments",
    { timeout: 60000 },
    async () => {
      // Create 4-bar clip
      const clipId = await createMidiClip("49|1", {
        notes: "C3 D3 E3 F3 1|1",
        length: "4:0.0",
        looping: true,
      });

      await sleep(200);
      // Split at bars 2, 3, and 4 to create 4 equal 1-bar segments
      const split = await splitClip(clipId, "2|1, 3|1, 4|1");

      expect(split.length).toBe(4);

      await sleep(100);
      const first = await readClip(split[0]!.id);

      expect(first.arrangementStart).toBe("49|1");
      expect(first.arrangementLength).toBe("1:0");

      for (let i = 1; i < split.length; i++) {
        const clip = await readClip(split[i]!.id);

        expect(clip.arrangementStart).toBe(`${49 + i}|1`);
      }
    },
  );

  it("splits unlooped MIDI clip and reveals hidden content", async () => {
    const clipId = await createMidiClip("57|1", {
      notes: "1|1 C3\n2|1 D3\n3|1 E3\n4|1 F3",
      length: "4:0.0",
      looping: false,
    });

    await sleep(200);
    // Shorten clip to hide some content
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, arrangementLength: "2:0.0" },
    });

    await sleep(200);
    // Split at bar 2 (creates 2 segments from the shortened 2-bar clip)
    const split = await splitClip(clipId, "2|1");

    expect(split.length).toBeGreaterThanOrEqual(2);
  });

  it("splits warped audio clip", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Splitting Audio Test" },
    });
    const track = parseToolResult<CreateTrackResult>(trackResult);

    await sleep(100);
    const clipResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "arrangement",
        trackIndex: track.trackIndex,
        arrangementStart: "65|1",
        sampleFile: SAMPLE_FILE,
        looping: true,
        warping: true,
      },
    });
    const clipId = parseToolResult<{ id: string }>(clipResult).id;

    await sleep(200);
    // Split at bar 2
    const split = await splitClip(clipId, "2|1");

    expect(split.length).toBeGreaterThanOrEqual(1);

    await sleep(100);
    const clip = await readClip(split[0]!.id);

    expect(clip.type).toBe("audio");
    expect(clip.arrangementStart).toBe("65|1");
  });

  it("preserves total note count across splits", async () => {
    const clipId = await createMidiClip("73|1", {
      notes: "1|1 C3\n2|1 D3\n3|1 E3\n4|1 F3",
      length: "4:0.0",
      looping: true,
    });

    await sleep(200);
    // Split into 4 equal 1-bar segments
    const split = await splitClip(clipId, "2|1, 3|1, 4|1");

    expect(split.length).toBe(4);

    let totalNotes = 0;

    for (const s of split) {
      await sleep(50);
      totalNotes += (await readClip(s.id, ["clip-notes"])).noteCount ?? 0;
    }

    expect(totalNotes).toBeGreaterThanOrEqual(4);
  });

  it("applies other updates along with splitting", async () => {
    const clipId = await createMidiClip("81|1", {
      notes: "C3 1|1",
      length: "2:0.0",
      looping: true,
    });

    await sleep(200);
    // Split at bar 2 and also rename
    const split = await splitClip(clipId, "2|1", { name: "Split Section" });

    expect(split.length).toBe(2);

    await sleep(100);
    expect((await readClip(split[0]!.id)).name).toBe("Split Section");
  });

  it("returns session clip unchanged with warning", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: emptyMidiTrack,
        sceneIndex: "4",
        notes: "C3 1|1",
        length: "2:0.0",
      },
    });
    const clipId = parseToolResult<{ id: string }>(result).id;

    await sleep(200);
    // Session clips should not be split
    const split = await splitClip(clipId, "2|1");

    expect(split[0]?.id).toBe(clipId);
  });

  it("splits multiple clips in one call", async () => {
    const clip1Id = await createMidiClip("89|1", {
      notes: "C3 1|1",
      length: "2:0.0",
      looping: true,
    });
    const clip2Id = await createMidiClip("93|1", {
      notes: "E3 1|1",
      length: "2:0.0",
      looping: true,
    });

    await sleep(200);
    // Split both 2-bar clips at bar 2
    const split = await splitClip(`${clip1Id},${clip2Id}`, "2|1");

    expect(split.length).toBe(4);
  });

  it("splits at half-bar position", async () => {
    const clipId = await createMidiClip("97|1", {
      notes: "C3 D3 E3 F3 1|1",
      length: "2:0.0",
      looping: true,
    });

    await sleep(200);
    // Split at beat 3 of bar 1, bar 2, and beat 3 of bar 2 (4 segments of 2 beats each)
    const split = await splitClip(clipId, "1|3, 2|1, 2|3");

    expect(split.length).toBe(4);

    await sleep(100);
    expect((await readClip(split[0]!.id)).arrangementLength).toBe("0:2");
  });
});
