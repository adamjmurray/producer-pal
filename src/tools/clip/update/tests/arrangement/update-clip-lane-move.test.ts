// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { handleArrangementStartOperation } from "../../helpers/arrangement/arrangement-move.ts";
import {
  emitArrangementWarnings,
  moveGroupKey,
  type MoveGroup,
} from "../../helpers/arrangement/update-clip-move-groups.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// Wraps the real recreateClip so most tests get its actual behavior; one test
// below overrides it to return a clip that doesn't exist, a shape Live's own
// create guard normally rules out but the caller still has to handle safely.
vi.mock(
  import("#src/tools/shared/clip/recreate-clip.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return { ...actual, recreateClip: vi.fn(actual.recreateClip) };
  },
);

import { recreateClip } from "#src/tools/shared/clip/recreate-clip.ts";

const SOURCE_TRACK = 0;
const DEST_TRACK = 5;
/** Never registered, so it stands for a track index the caller mistyped. */
const MISSING_TRACK = 99;
const SOURCE_ID = "123";
/**
 * How a warning names the source clip: both spellings, per ADR-0009. It starts
 * at 8 Ableton beats, which the song's 4/4 spells as bar 3 beat 1.
 */
const SOURCE = `t${SOURCE_TRACK}[3|1] (id ${SOURCE_ID})`;
/** Same, for the tests whose source sits on a take lane. */
const SOURCE_ON_LANE = `t${SOURCE_TRACK}/l0[3|1] (id ${SOURCE_ID})`;
const DUPLICATED_ID = "456";
/** Never registered, so it resolves to a clip that doesn't exist. */
const PHANTOM_ID = "789";
/** Every move in this file lands, or tries to land, on this one group. */
const GROUP = moveGroupKey(DEST_TRACK, 32);

/**
 * What the tally counted for the group every move here aims at.
 * @param groups - The tally a batch of moves shared
 * @returns The count, or 0 when nothing was counted there
 */
function landedCount(groups: Map<string, MoveGroup>): number {
  return groups.get(GROUP)?.count ?? 0;
}

const TAKE_LANE_SOURCE = livePath
  .track(SOURCE_TRACK)
  .takeLane(0)
  .arrangementClip(0);

const mockContext = { silenceWavPath: "/tmp/test-silence.wav" } as const;

/** Gives a source clip something for add_new_notes to actually write. */
const NOTES = [
  {
    pitch: 60,
    start_time: 0,
    duration: 1,
    velocity: 100,
    probability: 1,
    velocity_deviation: 0,
  },
];

/** Every way placeMovedClip turns a move down before it writes anything. */
const REFUSALS: Array<[string, MoveOptions, string]> = [
  [
    "a MIDI clip aimed at an audio track",
    { destHasMidiInput: 0 },
    `track t${DEST_TRACK} (id tl_track_${DEST_TRACK}) is audio; a MIDI clip needs a MIDI track`,
  ],
  [
    "an audio clip with no sample, aimed at a take lane",
    {
      isMidi: 0,
      destHasMidiInput: 0,
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
    },
    "it's an audio clip with no sample file",
  ],
  [
    "a take lane past the per-track limit",
    { destination: { trackIndex: DEST_TRACK, takeLane: 8 } },
    'take lane "l8" is out of range',
  ],
  [
    "a destination track that isn't there",
    { destination: { trackIndex: MISSING_TRACK, takeLane: null } },
    `track t${MISSING_TRACK} does not exist`,
  ],
];

interface MoveOptions {
  /** Path of the source clip; a take-lane path makes it an unmovable source */
  sourcePath?: PathLike;
  isMidi?: number;
  filePath?: string;
  hasEnvelopes?: number;
  /** Take lanes the destination track already has */
  initialLanes?: number;
  /** 0 makes the destination an audio track */
  destHasMidiInput?: number;
  arrangementStartBeats?: number | null;
  destination?: ArrangementTrack | null;
  /** Shared across calls, to see what a batch counted on one track */
  movedClipGroups?: Map<string, MoveGroup>;
  /** Answer the duplicate with an id that doesn't exist, as Live can */
  duplicateFails?: boolean;
  /** Every create_midi_clip/create_audio_clip call answers with no clip, as Live can */
  clipCreationFails?: boolean;
  /** Live creates a real clip, then its add_new_notes throws — a post-creation failure. */
  postCreateFails?: boolean;
  /** Give the source clip notes, so add_new_notes actually runs (and can fail). */
  hasNotes?: boolean;
}

/**
 * Register a source clip and a destination track, then run the move.
 * @param opts - What this test varies
 * @returns The clip id the operation resolved to
 */
function runMove(opts: MoveOptions = {}): string | null {
  const {
    sourcePath = livePath.track(SOURCE_TRACK).arrangementClip(0),
    isMidi = 1,
    filePath = "",
    hasEnvelopes = 0,
    initialLanes = 0,
    destHasMidiInput = 1,
    arrangementStartBeats = 32,
    destination = { trackIndex: DEST_TRACK, takeLane: null },
    hasNotes = false,
  } = opts;

  mockNonExistentObjects();

  registerMockObject(SOURCE_ID, {
    path: sourcePath,
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: isMidi,
      file_path: filePath,
      has_envelopes: hasEnvelopes,
      start_time: 8,
      end_time: 16,
      length: 8,
      start_marker: 0,
      loop_start: 0,
      loop_end: 8,
      end_marker: 8,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      name: "Verse",
      color: 16711680,
    },
    methods: {
      get_notes_extended: () =>
        JSON.stringify({ notes: hasNotes ? NOTES : [] }),
    },
  });

  registerMockObject(`track_${SOURCE_TRACK}`, {
    path: livePath.track(SOURCE_TRACK),
    type: "Track",
    properties: { arrangement_clips: children(SOURCE_ID) },
  });

  registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes,
    hasMidiInput: destHasMidiInput,
    clipCreationFails: opts.clipCreationFails,
    postCreateFails: opts.postCreateFails,
  });

  // registerTakeLaneTrack answers the lane creates; the main lane's move goes
  // through Live's own arrangement duplicate instead.
  lookupMockObject(
    undefined,
    livePath.track(DEST_TRACK),
  )!.methods.duplicate_clip_to_arrangement = () => {
    // Live answers a silently-declined duplicate with an id that resolves to
    // nothing, AFTER the target range has already been cleared for it.
    if (opts.duplicateFails) {
      return ["id", PHANTOM_ID];
    }

    registerMockObject(DUPLICATED_ID, {
      path: livePath.track(DEST_TRACK).arrangementClip(0),
      type: "Clip",
    });

    return ["id", DUPLICATED_ID];
  };

  return handleArrangementStartOperation({
    clip: LiveAPI.from(`id ${SOURCE_ID}`),
    arrangementStartBeats,
    destination,
    movedClipGroups: opts.movedClipGroups ?? new Map(),
    isMidiClip: isMidi === 1,
    context: mockContext,
    updatedClips: [],
    noteResult: null,
  });
}

describe("moving an arrangement clip to another lane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("duplicates onto the destination track and deletes the original", () => {
    const movedClipGroups = new Map<string, MoveGroup>();
    const result = runMove({ movedClipGroups });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${SOURCE_ID}`,
      32,
    );
    // The delete goes to the SOURCE track, not the one the copy landed on.
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(result).toBe(DUPLICATED_ID);
    expect(landedCount(movedClipGroups)).toBe(1);
  });

  // Omitting arrangementStart means "same place, other lane".
  it("keeps the clip's own start time when no position is given", () => {
    runMove({ arrangementStartBeats: null });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${SOURCE_ID}`,
      8,
    );
  });

  it("re-creates the clip on a take lane", () => {
    const result = runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
    });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 32, 8);
    expect(capturedWarnings()).toContain(
      `clip ${SOURCE} was re-created on t${DEST_TRACK}/l0`,
    );
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(result).not.toBe(SOURCE_ID);
  });

  // recreateClip throws when Live's create call lands nothing (a stale
  // file_path is the real-world trigger, but a MIDI clip exercises the same
  // throw more simply). The throw must be caught and reported per-clip, not
  // escape uncaught, and it must never look like a success.
  it("reports a failed re-create on a take lane instead of throwing", () => {
    const result = runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
      clipCreationFails: true,
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE} was not moved: Live created no clip at t${DEST_TRACK}/l0`,
      ),
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("was re-created"),
    );
    expect(result).toBe(SOURCE_ID);
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
  });

  // add_new_notes throws AFTER Live already created a real clip: the
  // destination now holds a real, if incomplete, clip — not nothing — so the
  // move must be reported (and counted) as landed, not refused, and the
  // source must still be cleared to complete it.
  it("reports and counts a partial re-create, keeping the source untouched", () => {
    const movedClipGroups = new Map<string, MoveGroup>();
    const result = runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
      postCreateFails: true,
      hasNotes: true,
      movedClipGroups,
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE} left an incomplete clip on t${DEST_TRACK}/l0 (notes failed); the original clip was kept`,
      ),
    );
    // The source is kept, not deleted: the failure could have been in the
    // color write, after the notes had already landed on the broken clip.
    expect(result).toBe(SOURCE_ID);
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(landedCount(movedClipGroups)).toBe(1);
  });

  // A non-empty file_path only means Live once saw a sample there, so the
  // create can land nothing even though recreateClip doesn't throw. The
  // success message must not fire until the clip is confirmed to exist —
  // the caller's own exists() check is what reports the refusal.
  it("does not report success when the re-created clip doesn't exist", () => {
    vi.mocked(recreateClip).mockReturnValueOnce({
      exists: () => false,
    } as unknown as LiveAPI);

    const result = runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
    });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("was re-created"),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `failed to duplicate clip ${SOURCE} - original preserved`,
      ),
    );
    expect(result).toBe(SOURCE_ID);
  });

  it("creates the lane it needs and says what the re-created clip loses", () => {
    runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      hasEnvelopes: 1,
    });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith("create_take_lane");
    expect(capturedWarnings()).toContain(
      `clip ${SOURCE} was re-created on t${DEST_TRACK}/l0 (automation envelopes aren't copied)`,
    );
  });

  // A lane that already exists is reused, not appended to.
  it("reuses a lane the track already has", () => {
    runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      initialLanes: 1,
    });

    const created = vi
      .mocked(lookupMockObject(undefined, livePath.track(DEST_TRACK))!.call)
      .mock.calls.filter(([method]) => method === "create_take_lane");

    expect(created).toHaveLength(0);
  });

  // Every refusal keeps the clip where it is, so the rest of the update still
  // lands and nothing is deleted without a copy in place.
  it.each(REFUSALS)("refuses %s", (_label, opts, expected) => {
    const movedClipGroups = new Map<string, MoveGroup>();
    const result = runMove({ ...opts, movedClipGroups });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(`clip ${SOURCE} was not moved: ${expected}`),
    );
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(result).toBe(SOURCE_ID);
    // These all return before the placement writes anything, so nothing was
    // overwritten and nothing is counted.
    expect(landedCount(movedClipGroups)).toBe(0);
  });

  // The count is what the "same position" warning says out loud, so a refused
  // clip must not turn a single landing into a stack of two.
  it.each(REFUSALS)(
    "doesn't stack a clip that landed with %s",
    (_label, opts) => {
      const movedClipGroups = new Map<string, MoveGroup>();

      // The refusal first: the second call re-registers the destination track,
      // so the landing move gets one that takes it.
      runMove({ ...opts, movedClipGroups });
      runMove({ movedClipGroups });
      emitArrangementWarnings(movedClipGroups);

      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("moved to the same position"),
      );
      expect(landedCount(movedClipGroups)).toBe(1);
    },
  );

  // The opposite case: Live clears the target range BEFORE the duplicate that
  // then silently declines, so the clip that "wasn't moved" has already
  // destroyed whatever stood there. That is the overwrite the warning is for.
  it("counts a placement that cleared the target and then failed", () => {
    const movedClipGroups = new Map<string, MoveGroup>();
    const result = runMove({ duplicateFails: true, movedClipGroups });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `failed to duplicate clip ${SOURCE} - original preserved`,
      ),
    );
    // The source is kept, since no copy landed to replace it.
    expect(result).toBe(SOURCE_ID);
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(landedCount(movedClipGroups)).toBe(1);
  });

  it("counts a failed placement toward the stack warning", () => {
    const movedClipGroups = new Map<string, MoveGroup>();

    runMove({ movedClipGroups });
    runMove({ duplicateFails: true, movedClipGroups });
    emitArrangementWarnings(movedClipGroups);

    expect(capturedWarnings()).toContainEqual(
      `2 clips on t${DEST_TRACK} moved to the same position - later clips will overwrite earlier ones`,
    );
  });
});

// Live can't delete a take-lane clip, so a move off one copies the content and
// leaves the original emptied and marked, rather than skipping the move.
describe("moving a clip off a take lane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-creates the clip on the main lane instead of duplicating it", () => {
    const result = runMove({ sourcePath: TAKE_LANE_SOURCE });

    // duplicate_clip_to_arrangement silently no-ops on a take-lane source.
    const destTrack = lookupMockObject(undefined, livePath.track(DEST_TRACK));

    expect(destTrack?.call).toHaveBeenCalledWith("create_midi_clip", 32, 8);
    expect(destTrack?.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );
    expect(capturedWarnings()).toContain(
      `clip ${SOURCE_ON_LANE} was re-created on t${DEST_TRACK}`,
    );
    expect(result).not.toBe(SOURCE_ID);
  });

  // Same throw as the take-lane-destination case, but on the promote path:
  // a source ON a take lane being moved to a main lane.
  it("reports a failed promote to the main lane instead of throwing", () => {
    const result = runMove({
      sourcePath: TAKE_LANE_SOURCE,
      clipCreationFails: true,
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE_ON_LANE} was not moved: Live created no clip at t${DEST_TRACK}`,
      ),
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("was re-created"),
    );
    expect(result).toBe(SOURCE_ID);
  });

  // Same as the take-lane-destination case above, but on the promote path: a
  // real (if incomplete) clip lands on the main lane, so it must be reported
  // (and treated) as landed, not as a refusal.
  it("reports a partial promote, keeping the take-lane source untouched", () => {
    const result = runMove({
      sourcePath: TAKE_LANE_SOURCE,
      postCreateFails: true,
      hasNotes: true,
    });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE_ON_LANE} left an incomplete clip on t${DEST_TRACK} (notes failed); the original clip was kept`,
      ),
    );
    expect(result).toBe(SOURCE_ID);

    // Unlike a completed promote, the take isn't emptied or marked: nothing
    // safe to keep was proven to have moved, so the source is left exactly
    // as it was.
    const source = lookupMockObject(SOURCE_ID);

    expect(source?.call).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(source?.set).not.toHaveBeenCalledWith("muted", 1);
  });

  it("empties and marks the MIDI original instead of deleting it", () => {
    runMove({ sourcePath: TAKE_LANE_SOURCE });

    const source = lookupMockObject(SOURCE_ID);

    // The remove window mirrors readAllClipNotes: [-length, 3 * length].
    expect(source?.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      -8,
      24,
    );
    expect(source?.set).toHaveBeenCalledWith("name", "(moved) Verse");
    expect(source?.set).toHaveBeenCalledWith("muted", 1);
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE_ON_LANE} was emptied instead of deleted`,
      ),
    );
  });

  // An audio take can't be emptied at all, so it is only muted and marked.
  it("mutes an audio original rather than emptying it", () => {
    runMove({
      sourcePath: TAKE_LANE_SOURCE,
      isMidi: 0,
      filePath: "/samples/take.wav",
      destHasMidiInput: 0,
    });

    const source = lookupMockObject(SOURCE_ID);

    expect(source?.set).toHaveBeenCalledWith("name", "(moved) Verse");
    expect(source?.set).toHaveBeenCalledWith("muted", 1);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE_ON_LANE} was muted instead of deleted`,
      ),
    );
  });
});
