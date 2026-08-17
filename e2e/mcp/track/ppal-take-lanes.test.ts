// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement take lanes, spanning the tools that touch them:
 * ppal-create-clip, ppal-duplicate, ppal-delete, ppal-read-track, and
 * ppal-read-live-set.
 *
 * A lane is a path segment: `t8/l0` is the track's first take lane and `t8/l+`
 * appends one. Results report the same spelling, so a clip's `path` says which
 * lane it landed on.
 *
 * Take lanes are append-only — Live exposes no API to delete a lane or a
 * take-lane clip — so every test depends on setupMcpTestContext() reopening the
 * Live Set between tests to reset state (no `once`). Resolving a lane emits a
 * "expand the take-lanes arrow" hint warning even on success, so those calls are
 * parsed with parseToolResultWithWarnings().
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
  getToolNotices,
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

// Clip-free MIDI tracks, for cross-track take-lane duplicates
const LANE_DEST_TRACK = 7;
const LANE_DEST_TRACK_2 = 10;

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
  path?: string;
  arrangementStart?: string;
}

/**
 * Create an arrangement clip on a take lane, tolerating the hint warning, and
 * return the parsed result.
 */
async function createOnLane(
  args: Record<string, unknown>,
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: args,
  });

  return parseToolResultWithWarnings<CreateClipResult>(result).data;
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
  it("creates clips on take lanes, reports the lane path, and reads them back", async () => {
    // Targeting l0 auto-creates it; the result path names the lane
    const lane0 = await createOnLane({
      path: `t${MIDI_TRACK}/l0`,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    expect(lane0.id).toBeDefined();
    expect(lane0.path).toBe(`t${MIDI_TRACK}/l0`);

    // "l+" appends a fresh lane; takeLaneName names only that new lane
    const lane1 = await createOnLane({
      path: `t${MIDI_TRACK}/l+`,
      arrangementStart: "5|1",
      notes: "E3 1|1",
      takeLaneName: "Variation B",
    });

    expect(lane1.path).toBe(`t${MIDI_TRACK}/l1`);

    // A main-lane clip's path is the bare track (and it emits no warning)
    const mainResult = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${MIDI_TRACK}`,
        arrangementStart: "9|1",
        notes: "G3 1|1",
      },
    });
    const main = parseToolResult<CreateClipResult>(mainResult);

    expect(main.id).toBeDefined();
    expect(main.path).toBe(`t${MIDI_TRACK}`);

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

  // takeLane is a hidden alias now, and 1-based where the path segment is
  // 0-based. It has to keep landing on the same lane until the removal release.
  it("still honors the deprecated takeLane param, and says so", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${MIDI_TRACK}`,
        arrangementStart: "1|1",
        notes: "C3 1|1",
        takeLane: 2,
      },
    });
    const { data: clip } =
      parseToolResultWithWarnings<CreateClipResult>(result);

    expect(clip.path).toBe(`t${MIDI_TRACK}/l1`);
    expect(getToolNotices(result)).toContainEqual(
      expect.stringContaining('param "takeLane" is deprecated'),
    );
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

  it("replaces an overlapping clip and enforces the 8-lane cap", async () => {
    await createOnLane({
      path: `t${MIDI_TRACK}/l0`,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    // A second clip at the same position on the same lane replaces it, like the
    // main lane — no overlap error.
    const replaced = await createOnLane({
      path: `t${MIDI_TRACK}/l0`,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    expect(replaced.path).toBe(`t${MIDI_TRACK}/l0`);

    await sleep(100);
    const afterReplace = await readTakeLanes(MIDI_TRACK);

    // Replace (not stack): lane 0 still holds a single clip at the position
    expect(afterReplace.takeLanes![0]!.clips).toHaveLength(1);

    // Targeting the last lane auto-creates the lanes up to it
    const lane7 = await createOnLane({
      path: `t${MIDI_TRACK}/l7`,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    expect(lane7.path).toBe(`t${MIDI_TRACK}/l7`);

    await sleep(100);
    const overview = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: MIDI_TRACK },
      }),
    );

    expect(overview.takeLaneCount).toBe(8);

    // Out of room, and deleting lanes in Live is what makes room
    const capped = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${MIDI_TRACK}/l+`,
        arrangementStart: "5|1",
        notes: "C3 1|1",
      },
    });

    expect(isToolError(capped)).toBe(true);
    expect(getToolErrorMessage(capped)).toContain("8 take lane limit");

    // A lane number past the end is a bad number instead, and deleting lanes
    // would only make it worse — so it gets the range, not the delete advice.
    const outOfRange = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${MIDI_TRACK}/l8`,
        arrangementStart: "5|1",
        notes: "C3 1|1",
      },
    });

    expect(isToolError(outOfRange)).toBe(true);
    expect(getToolErrorMessage(outOfRange)).toContain(
      'take lane "l8" is out of range: a track has "l0" through "l7"',
    );
  });

  it("reports per-track takeLaneCount in read-live-set", async () => {
    await createOnLane({
      path: `t${MIDI_TRACK}/l0`,
      arrangementStart: "1|1",
      notes: "C3 1|1",
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
      path: `t${track.trackIndex}/l+`,
      arrangementStart: "1|1",
      sampleFile: SAMPLE_FILE,
    });

    expect(clip.id).toBeDefined();
    expect(clip.path).toBe(`t${track.trackIndex}/l0`);

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
          path: `t${MIDI_TRACK}`,
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
          toPath: `t${MIDI_TRACK}/l+`,
        },
      }),
    );

    expect(midiDup.data.id).toBeDefined();
    expect(midiDup.data.path).toBe(`t${MIDI_TRACK}/l0`);

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
          toPath: `t${MIDI_TRACK}/l+`,
          arrangementLength: "2bar",
        },
      }),
    );

    expect(lengthDup.warnings.join(" ")).toContain(
      "arrangementLength ignored for the take-lane copies",
    );
    expect(lengthDup.data.path).toBe(`t${MIDI_TRACK}/l1`);

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
          path: `t${audioTrack.trackIndex}`,
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
          toPath: `t${audioTrack.trackIndex}/l+`,
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
      path: `t${MIDI_TRACK}/l+`,
      arrangementStart: "1|1",
      notes: "C3 1|1",
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

  // One written "l+" is one lane however many clips land on it — the copy loop
  // cycles the destination list, and a cycled repeat must reuse its lane.
  it("stacks every copy on one new lane when one l+ cycles across positions", async () => {
    const source = await sourceClipOn(MIDI_TRACK, "Take Source");

    const dup = parseToolResultWithWarnings<DuplicateClipResult[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: source.id,
          toPath: `t${LANE_DEST_TRACK}/l+`,
          arrangementStart: "5|1, 9|1, 13|1",
        },
      }),
    );

    expect(dup.data).toHaveLength(3);
    expect(dup.data.map((copy) => copy.path)).toStrictEqual(
      Array(3).fill(`t${LANE_DEST_TRACK}/l0`),
    );

    await sleep(100);
    const detail = await readTakeLanes(LANE_DEST_TRACK);

    expect(detail.takeLanes).toHaveLength(1);
    expect(detail.takeLanes![0]!.clips).toHaveLength(3);
  });

  // ...but two written "l+" are two lanes, even on the same track. Sharing them
  // is what makes a stack of takes impossible to write in one call.
  it("gives each written l+ its own lane on the same track", async () => {
    const source = await sourceClipOn(MIDI_TRACK, "Two Lanes");

    const dup = parseToolResultWithWarnings<DuplicateClipResult[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: source.id,
          toPath: `t${LANE_DEST_TRACK}/l+,t${LANE_DEST_TRACK}/l+`,
          arrangementStart: "5|1",
        },
      }),
    );

    expect(dup.data.map((copy) => copy.path)).toStrictEqual([
      `t${LANE_DEST_TRACK}/l0`,
      `t${LANE_DEST_TRACK}/l1`,
    ]);

    await sleep(100);
    const detail = await readTakeLanes(LANE_DEST_TRACK);

    expect(detail.takeLanes).toHaveLength(2);
    expect(detail.takeLanes![0]!.clips).toHaveLength(1);
    expect(detail.takeLanes![1]!.clips).toHaveLength(1);
  });

  it("gives each toPath track its own new lane", async () => {
    const source = await sourceClipOn(MIDI_TRACK, "Fan Out");

    const dup = parseToolResultWithWarnings<DuplicateClipResult[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: source.id,
          toPath: `t${LANE_DEST_TRACK}/l+,t${LANE_DEST_TRACK_2}/l+`,
          arrangementStart: "5|1",
        },
      }),
    );

    expect(dup.data.map((copy) => copy.path)).toStrictEqual([
      `t${LANE_DEST_TRACK}/l0`,
      `t${LANE_DEST_TRACK_2}/l0`,
    ]);

    await sleep(100);

    for (const trackIndex of [LANE_DEST_TRACK, LANE_DEST_TRACK_2]) {
      const detail = await readTakeLanes(trackIndex);

      expect(detail.takeLanes).toHaveLength(1);
      expect(detail.takeLanes![0]!.clips).toHaveLength(1);
    }
  });
});

/**
 * Create a main-lane arrangement clip to duplicate from, and let Live settle.
 * @param trackIndex - Track to create it on
 * @param name - Clip name
 * @returns The created clip
 */
async function sourceClipOn(
  trackIndex: number,
  name: string,
): Promise<CreateClipResult> {
  const source = parseToolResult<CreateClipResult>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${trackIndex}`,
        arrangementStart: "1|1",
        notes: "C3 E3 1|1",
        name,
      },
    }),
  );

  await sleep(100);

  return source;
}
