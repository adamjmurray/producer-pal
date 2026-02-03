/**
 * E2E tests for ppal-update-clip slicing functionality.
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

/** Normalize slice results - update-clip returns object for 1 clip, array for many */
function parseSliceResult(result: unknown): Array<{ id: string }> {
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

async function sliceClip(
  ids: string,
  slice: string,
  extra?: Record<string, unknown>,
): Promise<Array<{ id: string }>> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { ids, slice, ...extra },
  });

  return parseSliceResult(result);
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

describe("ppal-update-clip slicing", () => {
  it(
    "slices looped MIDI clip into 1-bar segments",
    { timeout: 60000 },
    async () => {
      const clipId = await createMidiClip("49|1", {
        notes: "C3 D3 E3 F3 1|1",
        length: "4:0.0",
        looping: true,
      });

      await sleep(200);
      const sliced = await sliceClip(clipId, "1:0.0");

      expect(sliced.length).toBe(4);

      await sleep(100);
      const first = await readClip(sliced[0]!.id);

      expect(first.arrangementStart).toBe("49|1");
      expect(first.arrangementLength).toBe("1:0");

      for (let i = 1; i < sliced.length; i++) {
        const clip = await readClip(sliced[i]!.id);

        expect(clip.arrangementStart).toBe(`${49 + i}|1`);
      }
    },
  );

  it("slices unlooped MIDI clip and reveals hidden content", async () => {
    const clipId = await createMidiClip("57|1", {
      notes: "1|1 C3\n2|1 D3\n3|1 E3\n4|1 F3",
      length: "4:0.0",
      looping: false,
    });

    await sleep(200);
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { ids: clipId, arrangementLength: "2:0.0" },
    });

    await sleep(200);
    const sliced = await sliceClip(clipId, "1:0.0");

    expect(sliced.length).toBeGreaterThanOrEqual(2);
  });

  it("slices warped audio clip", async () => {
    const trackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio", name: "Slicing Audio Test" },
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
    const sliced = await sliceClip(clipId, "1:0.0");

    expect(sliced.length).toBeGreaterThanOrEqual(1);

    await sleep(100);
    const clip = await readClip(sliced[0]!.id);

    expect(clip.type).toBe("audio");
    expect(clip.arrangementStart).toBe("65|1");
  });

  it("preserves total note count across slices", async () => {
    const clipId = await createMidiClip("73|1", {
      notes: "1|1 C3\n2|1 D3\n3|1 E3\n4|1 F3",
      length: "4:0.0",
      looping: true,
    });

    await sleep(200);
    const sliced = await sliceClip(clipId, "1:0.0");

    expect(sliced.length).toBe(4);

    let totalNotes = 0;

    for (const s of sliced) {
      await sleep(50);
      totalNotes += (await readClip(s.id, ["clip-notes"])).noteCount ?? 0;
    }

    expect(totalNotes).toBeGreaterThanOrEqual(4);
  });

  it("applies other updates along with slicing", async () => {
    const clipId = await createMidiClip("81|1", {
      notes: "C3 1|1",
      length: "2:0.0",
      looping: true,
    });

    await sleep(200);
    const sliced = await sliceClip(clipId, "1:0.0", { name: "Sliced Section" });

    expect(sliced.length).toBe(2);

    await sleep(100);
    expect((await readClip(sliced[0]!.id)).name).toBe("Sliced Section");
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
    const sliced = await sliceClip(clipId, "1:0.0");

    expect(sliced[0]?.id).toBe(clipId);
  });

  it("slices multiple clips in one call", async () => {
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
    const sliced = await sliceClip(`${clip1Id},${clip2Id}`, "1:0.0");

    expect(sliced.length).toBe(4);
  });

  it("slices into half-bar segments", async () => {
    const clipId = await createMidiClip("97|1", {
      notes: "C3 D3 E3 F3 1|1",
      length: "2:0.0",
      looping: true,
    });

    await sleep(200);
    const sliced = await sliceClip(clipId, "0:2.0");

    expect(sliced.length).toBe(4);

    await sleep(100);
    expect((await readClip(sliced[0]!.id)).arrangementLength).toBe("0:2");
  });
});
