// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement take lanes, spanning the tools that touch them:
 * ppal-create-clip, ppal-duplicate, ppal-delete, ppal-read-track, and
 * ppal-read-live-set.
 *
 * Take lanes are append-only — Live exposes no API to delete a lane or a
 * take-lane clip — so every test depends on setupMcpTestContext() reopening the
 * Live Set between tests to reset state (no `once`). Targeting or creating on a
 * take lane always emits a "take lane" hint warning even on success, so those
 * calls are parsed with parseToolResultWithWarnings().
 *
 * Uses: e2e-test-set. t8 "9-MIDI" is an empty MIDI track; t1/t9/return/master
 * exercise the omission rules. See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  type CreateTrackResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  SAMPLE_FILE,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

// t8 "9-MIDI" is an empty MIDI track in e2e-test-set
const MIDI_TRACK = 8;

interface CreateClipTakeLaneResult extends CreateClipResult {
  takeLane?: number;
}

interface TakeLaneInfo {
  name: string;
  clips: Array<{ id: string; name?: string }>;
}

interface ReadTrackTakeLanesResult {
  takeLaneCount?: number;
  takeLanes?: TakeLaneInfo[];
  isGroup?: boolean;
}

interface LiveSetTracksResult {
  tracks: Array<{ id: string; trackIndex: number; takeLaneCount?: number }>;
}

interface DuplicateClipResult {
  id: string;
  takeLane?: number;
  trackIndex?: number;
  arrangementStart?: string;
}

/**
 * Create an arrangement clip on a take lane, tolerating the success hint
 * warning, and return the parsed result.
 */
async function createOnLane(
  args: Record<string, unknown>,
): Promise<CreateClipTakeLaneResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: args,
  });

  return parseToolResultWithWarnings<CreateClipTakeLaneResult>(result).data;
}

/** Read a track's full take lane list (arrangement-clips include). */
async function readTakeLanes(
  trackIndex: number,
): Promise<ReadTrackTakeLanesResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { trackIndex, include: ["arrangement-clips"] },
  });

  return parseToolResult<ReadTrackTakeLanesResult>(result);
}

describe("take lanes", () => {
  it("creates clips on take lanes, surfaces the 1-based lane, and reads them back", async () => {
    // Targeting lane 1 auto-creates it; the result surfaces the 1-based lane
    const lane1 = await createOnLane({
      trackIndex: MIDI_TRACK,
      arrangementStart: "1|1",
      notes: "C3 1|1",
      takeLane: 1,
    });

    expect(lane1.id).toBeDefined();
    expect(lane1.takeLane).toBe(1);

    // "new" appends a fresh lane; takeLaneName names only that new lane
    const lane2 = await createOnLane({
      trackIndex: MIDI_TRACK,
      arrangementStart: "5|1",
      notes: "E3 1|1",
      takeLane: "new",
      takeLaneName: "Variation B",
    });

    expect(lane2.takeLane).toBe(2);

    // A main-lane clip omits takeLane from its result (and emits no warning)
    const mainResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: MIDI_TRACK,
        arrangementStart: "9|1",
        notes: "G3 1|1",
      },
    });
    const main = parseToolResult<CreateClipTakeLaneResult>(mainResult);

    expect(main.id).toBeDefined();
    expect(main).not.toHaveProperty("takeLane");

    await sleep(100);

    // Overview reports the count (no arrangement-clips include)
    const overviewResult = await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { trackIndex: MIDI_TRACK },
    });
    const overview = parseToolResult<ReadTrackTakeLanesResult>(overviewResult);

    expect(overview.takeLaneCount).toBe(2);
    expect(overview).not.toHaveProperty("takeLanes");

    // arrangement-clips include returns the full take lane list instead
    const detail = await readTakeLanes(MIDI_TRACK);

    expect(detail).not.toHaveProperty("takeLaneCount");
    expect(detail.takeLanes).toHaveLength(2);
    expect(detail.takeLanes![0]!.clips).toHaveLength(1);
    expect(detail.takeLanes![0]!.clips[0]!.id).toBeDefined();
    expect(detail.takeLanes![1]!.name).toBe("Variation B");
    expect(detail.takeLanes![1]!.clips).toHaveLength(1);
  });

  it("omits take lane fields for tracks without lanes and for group/return/master tracks", async () => {
    // Fresh set has no take lanes anywhere: a plain MIDI track omits the field
    const midi = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: 1 },
      }),
    );

    expect(midi).not.toHaveProperty("takeLaneCount");
    expect(midi).not.toHaveProperty("takeLanes");

    // Group track (t9 Parent)
    const group = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: 9 },
      }),
    );

    expect(group.isGroup).toBe(true);
    expect(group).not.toHaveProperty("takeLaneCount");

    // Return track
    const ret = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackType: "return", trackIndex: 0 },
      }),
    );

    expect(ret).not.toHaveProperty("takeLaneCount");

    // Master track
    const master = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackType: "master" },
      }),
    );

    expect(master).not.toHaveProperty("takeLaneCount");
  });

  it("errors on an overlapping clip and enforces the 8-lane cap", async () => {
    await createOnLane({
      trackIndex: MIDI_TRACK,
      arrangementStart: "1|1",
      notes: "C3 1|1",
      takeLane: 1,
    });

    // A second clip at the same position on the same lane overlaps and errors
    const overlap = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: MIDI_TRACK,
        arrangementStart: "1|1",
        notes: "C3 1|1",
        takeLane: 1,
      },
    });

    expect(isToolError(overlap)).toBe(true);
    expect(getToolErrorMessage(overlap)).toContain(
      "Clip exists at 1|1 on take lane 1",
    );

    // Targeting lane 8 auto-creates lanes up to the cap
    const lane8 = await createOnLane({
      trackIndex: MIDI_TRACK,
      arrangementStart: "1|1",
      notes: "C3 1|1",
      takeLane: 8,
    });

    expect(lane8.takeLane).toBe(8);

    await sleep(100);
    const overview = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: MIDI_TRACK },
      }),
    );

    expect(overview.takeLaneCount).toBe(8);

    // A 9th lane exceeds the cap
    const capped = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        trackIndex: MIDI_TRACK,
        arrangementStart: "5|1",
        notes: "C3 1|1",
        takeLane: "new",
      },
    });

    expect(isToolError(capped)).toBe(true);
    expect(getToolErrorMessage(capped)).toContain("8 take lane limit");
  });

  it("reports per-track takeLaneCount in read-live-set", async () => {
    await createOnLane({
      trackIndex: MIDI_TRACK,
      arrangementStart: "1|1",
      notes: "C3 1|1",
      takeLane: 1,
    });

    await sleep(100);
    const liveSet = parseToolResult<LiveSetTracksResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["tracks"] },
      }),
    );

    const withLanes = liveSet.tracks.find((t) => t.trackIndex === MIDI_TRACK);
    const withoutLanes = liveSet.tracks.find((t) => t.trackIndex === 0);

    expect(withLanes?.takeLaneCount).toBe(1);
    expect(withoutLanes).not.toHaveProperty("takeLaneCount");
  });

  it("creates an audio clip on a take lane", async () => {
    const track = parseToolResult<CreateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "audio", name: "Audio Lanes" },
      }),
    );

    expect(track.trackIndex).toBeDefined();
    await sleep(100);

    const clip = await createOnLane({
      trackIndex: track.trackIndex,
      arrangementStart: "1|1",
      sampleFile: SAMPLE_FILE,
      takeLane: "new",
    });

    expect(clip.id).toBeDefined();
    expect(clip.takeLane).toBe(1);

    await sleep(100);
    const readClip = parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: clip.id },
      }),
    );

    expect(readClip.type).toBe("audio");

    // The lane clip is reachable through the track's take lane list
    const detail = await readTakeLanes(track.trackIndex!);

    expect(detail.takeLanes).toHaveLength(1);
    expect(detail.takeLanes![0]!.clips).toHaveLength(1);
  });

  it("duplicates MIDI clips to take lanes (copying notes/name), ignoring arrangementLength and skipping audio", async () => {
    // A main-lane MIDI source to duplicate from
    const source = parseToolResult<CreateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          trackIndex: MIDI_TRACK,
          arrangementStart: "1|1",
          notes: "C3 E3 G3 1|1",
          name: "Original Take",
        },
      }),
    );

    await sleep(100);

    // Duplicate onto a fresh lane: notes and name copy from the source
    const midiDup = parseToolResultWithWarnings<DuplicateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: source.id,
          arrangementStart: "5|1",
          takeLane: "new",
        },
      }),
    );

    expect(midiDup.data.id).toBeDefined();
    expect(midiDup.data.takeLane).toBe(1);

    await sleep(100);
    const copy = parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { clipId: midiDup.data.id, include: ["notes"] },
      }),
    );

    expect(copy.type).toBe("midi");
    expect(copy.name).toBe("Original Take");
    expect(copy.notes).toContain("C3");

    // arrangementLength is meaningless on a take-lane duplicate: warn + ignore,
    // but the clip is still created
    const lengthDup = parseToolResultWithWarnings<DuplicateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: source.id,
          arrangementStart: "9|1",
          takeLane: "new",
          arrangementLength: "2:0",
        },
      }),
    );

    expect(lengthDup.warnings.join(" ")).toContain(
      "arrangementLength ignored for take-lane",
    );
    expect(lengthDup.data.takeLane).toBe(2);

    // An audio source is MIDI-only for v1: warn + skip (nothing created)
    const audioTrack = parseToolResult<CreateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "audio", name: "Audio Dup" },
      }),
    );

    await sleep(100);
    const audioSource = parseToolResult<CreateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          trackIndex: audioTrack.trackIndex,
          arrangementStart: "1|1",
          sampleFile: SAMPLE_FILE,
        },
      }),
    );

    await sleep(100);
    const audioDup = parseToolResultWithWarnings<unknown[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: audioSource.id,
          arrangementStart: "5|1",
          takeLane: "new",
        },
      }),
    );

    expect(audioDup.warnings.join(" ")).toContain(
      "takeLane supports MIDI clips only",
    );
    expect(audioDup.data).toStrictEqual([]);
  });

  it("warns and skips deletion of a take-lane clip (no delete API)", async () => {
    await createOnLane({
      trackIndex: MIDI_TRACK,
      arrangementStart: "1|1",
      notes: "C3 1|1",
      takeLane: "new",
    });

    await sleep(100);
    const before = await readTakeLanes(MIDI_TRACK);
    const clipId = before.takeLanes![0]!.clips[0]!.id;

    const deleteResult = parseToolResultWithWarnings<{ deleted: boolean }>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { ids: clipId, type: "clip" },
      }),
    );

    expect(deleteResult.warnings.join(" ")).toContain(
      "cannot delete take-lane clip",
    );
    expect(deleteResult.data.deleted).toBe(false);

    // The clip is still on the lane afterward
    await sleep(100);
    const after = await readTakeLanes(MIDI_TRACK);

    expect(after.takeLanes![0]!.clips).toHaveLength(1);
  });
});
