// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for promoting a take-lane clip to the main lane with
 * ppal-duplicate. The rest of the clip tools' side of take lanes is in
 * ppal-take-lanes.test.ts.
 *
 * Take lanes are append-only, so every test depends on setupMcpTestContext()
 * reopening the Live Set between tests to reset state (no `once`).
 *
 * Uses: e2e-test-set. t8 "9-MIDI" is an empty MIDI track; t5 is an audio track
 * with nothing on its arrangement.
 * See: e2e/live-sets/specs/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- track/take-lanes/ppal-take-lanes-promote
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { callTool } from "../../clip/helpers/arrangement-clip-query-test-helpers.ts";
import {
  AUDIO_TRACK,
  DRUM_LOOP_FILE,
  EMPTY_MIDI_TRACK,
} from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface DuplicateClipResult {
  id: string;
  path?: string;
  detail?: string;
}

interface TrackClips {
  arrangementClips?: Array<{ id: string; arrangementLength?: string }>;
  takeLanes?: Array<{ clips: Array<{ id: string }> }>;
}

describe("promoting a take-lane clip", () => {
  // Live's duplicate_clip_to_arrangement no-ops on a take-lane SOURCE, so this
  // re-creates the clip on the main lane. It's a copy, not a move: the take
  // stays put, because nothing can remove it.
  it("promotes a take-lane clip back to the main lane, leaving the take behind", async () => {
    await createClip({
      path: `t${EMPTY_MIDI_TRACK}/l0[1|1]`,
      notes: "C3 E3 G3 1|1",
      name: "The Keeper",
    });

    const takeId = (await laneClipIds())[0]!;

    const promoted = await promote(takeId);

    // Main lane has no `l` segment, so the path is the track plus the position
    expect(promoted.data.path).toBe(`t${EMPTY_MIDI_TRACK}[5|1]`);
    // Re-creating carries notes, and the copy's entry says so. This clip has no
    // envelopes, so nothing was lost and the entry names no cost.
    expect(promoted.data.detail).toBe(
      "promoted to the main lane by re-creating it",
    );

    await sleep(100);
    const copy = parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: promoted.data.id, include: ["notes"] },
      }),
    );

    expect(copy.name).toBe("The Keeper");
    expect(copy.notes).toContain("C3");

    // The source take is untouched on its lane
    expect(await laneClipIds()).toStrictEqual([takeId]);
  });

  // The copy lands at the take's length, then grows on the main lane, where
  // growing overwrites.
  it("resizes a promoted copy, and says what it grew over", async () => {
    await createClip({
      path: `t${EMPTY_MIDI_TRACK}/l0[1|1]`,
      notes: "C3 1|1",
      length: "1bar",
    });

    await createClip({
      path: `t${EMPTY_MIDI_TRACK}[7|1]`,
      notes: "D3 1|1",
      length: "1bar",
    });

    const takeId = (await laneClipIds())[0]!;

    const promoted = await promote(takeId, "4bar");

    expect(promoted.warnings).toStrictEqual([]);
    expect(promoted.data.detail).toBe(
      "promoted to the main lane by re-creating it; " +
        `overwrote the clip at t${EMPTY_MIDI_TRACK}[7|1]`,
    );

    await expectOnlyCopyOnMainLane(EMPTY_MIDI_TRACK, promoted.data.id);
  });

  // Live sizes a new audio clip to its sample and stops a growing clip at the
  // next one, so the main lane is cleared ahead of the copy.
  it("grows a looped audio take over the clips in its span", async () => {
    const lane = `t${AUDIO_TRACK}/l0`;
    const take = await createClip({
      path: `${lane}[1|1]`,
      sampleFile: DRUM_LOOP_FILE,
    });

    await callTool(ctx.client!, "ppal-update-clip", {
      id: take.id,
      looping: true,
      arrangementLength: "4bar",
    });

    await createClip({
      path: `t${AUDIO_TRACK}[7|1]`,
      sampleFile: DRUM_LOOP_FILE,
    });
    const promoted = parseToolResultWithWarnings<DuplicateClipResult>(
      await callTool(ctx.client!, "ppal-duplicate", {
        type: "clip",
        id: take.id,
        toPath: `t${AUDIO_TRACK}[5|1]`,
      }),
    );

    expect(promoted.data.detail).toBe(
      "promoted to the main lane by re-creating it " +
        "(warp markers reset to the sample's defaults); " +
        `overwrote the clip at t${AUDIO_TRACK}[7|1]`,
    );

    await expectOnlyCopyOnMainLane(AUDIO_TRACK, promoted.data.id);
  });
});

/**
 * Create a clip, tolerating any hint warning.
 * @param args - The ppal-create-clip arguments
 * @returns The created clip
 */
async function createClip(
  args: Record<string, unknown>,
): Promise<CreateClipResult> {
  return parseToolResultWithWarnings<CreateClipResult>(
    await callTool(ctx.client!, "ppal-create-clip", args),
  ).data;
}

/**
 * Copy a take-lane clip to bar 5 of the main lane.
 * @param id - The take-lane clip
 * @param arrangementLength - A length for the copy, when it gets one
 * @returns The copy's entry and any warnings
 */
async function promote(
  id: string,
  arrangementLength?: string,
): Promise<{ data: DuplicateClipResult; warnings: string[] }> {
  return parseToolResultWithWarnings<DuplicateClipResult>(
    await callTool(ctx.client!, "ppal-duplicate", {
      type: "clip",
      id,
      toPath: `t${EMPTY_MIDI_TRACK}[5|1]`,
      ...(arrangementLength == null ? {} : { arrangementLength }),
    }),
  );
}

/**
 * Expect a 4-bar copy to be the only clip left on a track's main lane.
 * @param track - The track the copy was promoted on
 * @param copyId - The copy
 */
async function expectOnlyCopyOnMainLane(
  track: number,
  copyId: string,
): Promise<void> {
  await sleep(100);

  expect((await readTrackClips(track)).arrangementClips).toStrictEqual([
    expect.objectContaining({ id: copyId, arrangementLength: "4bar" }),
  ]);
}

/**
 * @param track - The track to read; the empty MIDI track by default
 * @returns The track's main-lane clips and take lanes
 */
async function readTrackClips(track = EMPTY_MIDI_TRACK): Promise<TrackClips> {
  await sleep(100);

  return parseToolResult<TrackClips>(
    await callTool(ctx.client!, "ppal-read-track", {
      path: `t${track}`,
      include: ["arrangement-clips"],
    }),
  );
}

/**
 * @returns The ids of the clips on the track's first take lane
 */
async function laneClipIds(): Promise<string[]> {
  const { takeLanes } = await readTrackClips();

  return (takeLanes?.[0]?.clips ?? []).map((clip) => clip.id);
}
