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
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  expectTakeLaneMidiClip,
  registerTakeLaneTrack,
} from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { handleArrangementStartOperation } from "../../helpers/arrangement/arrangement-move.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  emitArrangementWarnings,
  moveGroupKey,
  type MoveGroup,
} from "../../helpers/arrangement/update-clip-move-groups.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "../../helpers/entries/clip-reasons.ts";
import { joinedClipReason } from "../../helpers/update-clip-test-helpers.ts";

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
const DUPLICATED_ID = "456";
/** Never registered, so it resolves to a clip that doesn't exist. */
const PHANTOM_ID = "789";
/** Where a move with no take lane named lands. */
const DEST_MAIN_LANE: ArrangementTrack = {
  trackIndex: DEST_TRACK,
  takeLane: null,
};

/**
 * What the tally counted for a lane at the position every move here aims at.
 * @param groups - The tally a batch of moves shared
 * @param landing - The lane to read, defaulting to the destination's main one
 * @returns The count, or 0 when nothing was counted there
 */
function landedCount(
  groups: Map<string, MoveGroup>,
  landing: ArrangementTrack = DEST_MAIN_LANE,
): number {
  return groups.get(moveGroupKey(landing, 32))?.count ?? 0;
}

const TAKE_LANE_SOURCE = livePath
  .track(SOURCE_TRACK)
  .takeLane(0)
  .arrangementClip(0);

const mockContext = { silenceWavPath: "/tmp/test-silence.wav" } as const;

/** What the source clip had to say about the move the last runMove ran. */
let reasons: ClipReasons = newClipReasons();
const movedReason = (): string => joinedClipReason(reasons, SOURCE_ID);

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
    { destination: { trackIndex: DEST_TRACK, takeLane: MAX_TAKE_LANES } },
    `take lane "l${MAX_TAKE_LANES}" is out of range`,
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
  /** 1 gives the source a groove for the copy to keep, or fail to. */
  hasGroove?: number;
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
 * Register a source clip and a destination track, for a move about to run.
 * @param opts - What this test varies
 */
function registerMoveWorld(opts: MoveOptions = {}): void {
  const {
    sourcePath = livePath.track(SOURCE_TRACK).arrangementClip(0),
    isMidi = 1,
    filePath = "",
    hasEnvelopes = 0,
    hasGroove = 0,
    initialLanes = 0,
    destHasMidiInput = 1,
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
      has_groove: hasGroove,
      groove: ["id", 42],
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
}

/**
 * A take lane on the destination track, as a move destination.
 * @param laneIndex - 0-based lane index
 * @returns The destination
 */
function takeLane(laneIndex: number): ArrangementTrack {
  return { trackIndex: DEST_TRACK, takeLane: laneIndex };
}

/**
 * Register the world and run the move.
 * @param opts - What this test varies
 * @returns The clip id the operation resolved to
 */
function runMove(opts: MoveOptions = {}): string | null {
  const {
    isMidi = 1,
    arrangementStartBeats = 32,
    destination = DEST_MAIN_LANE,
  } = opts;

  registerMoveWorld(opts);
  reasons = newClipReasons();

  return handleArrangementStartOperation({
    clip: LiveAPI.from(`id ${SOURCE_ID}`),
    arrangementStartBeats,
    destination,
    movedClipGroups: opts.movedClipGroups ?? new Map(),
    isMidiClip: isMidi === 1,
    context: mockContext,
    updatedClips: [],
    noteResult: null,
    reasons,
  });
}

// Through updateClip itself, because the bug was in the seam: the resize runs on
// the clip the move re-created, so its reason was filed under an id the loop
// never looks up, and the entry lost it.
describe("a lane move whose resize can't run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps both reasons on the moved clip's entry", async () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMoveWorld();

    const result = (await updateClip({
      id: SOURCE_ID,
      toPath: `t${DEST_TRACK}/l0`,
      arrangementLength: "2bar",
    })) as { id: string; reason?: string };

    // The clip moved, so its entry is real — and it carries what the move and
    // the refused resize each had to say.
    expect(result.id).not.toBe(SOURCE_ID);
    expect(result.reason).toBe(
      `re-created on t${DEST_TRACK}/l0; ` +
        "arrangementLength ignored for a take-lane clip; adjust it in Live's UI",
    );
  });
});

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
    expect(movedReason()).toBe(`re-created on t${DEST_TRACK}/l0`);
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

    expect(movedReason()).toContain(
      `not moved: Live created no clip at t${DEST_TRACK}/l0`,
    );
    expect(movedReason()).not.toContain("re-created on");
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

    expect(movedReason()).toContain(
      `not moved: an incomplete clip was left on t${DEST_TRACK}/l0 (notes failed); the original clip was kept`,
    );
    // The source is kept, not deleted: the failure could have been in the
    // color write, after the notes had already landed on the broken clip.
    expect(result).toBe(SOURCE_ID);
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expect(landedCount(movedClipGroups, takeLane(0))).toBe(1);
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

    expect(movedReason()).not.toContain("re-created on");
    expect(movedReason()).toContain(
      "not moved: Live made no copy at the destination, so the original was kept",
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
    expect(movedReason()).toBe(
      `re-created on t${DEST_TRACK}/l0 (automation envelopes aren't copied)`,
    );
  });

  // Live takes a groove write and can still leave the copy grooveless, so the
  // copy is read back and the entry says what really happened.
  it("says so when the copy didn't keep the source's groove", () => {
    runMove({
      destination: { trackIndex: DEST_TRACK, takeLane: 0 },
      hasGroove: 1,
    });

    expect(movedReason()).toBe(
      `re-created on t${DEST_TRACK}/l0 (groove isn't copied)`,
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

    expect(movedReason()).toContain(`not moved: ${expected}`);
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

    expect(movedReason()).toContain(
      "not moved: Live made no copy at the destination, so the original was kept",
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

  // A take lane is a lane of its own: two clips at one position on different
  // lanes sit side by side, so there is no overwrite to warn about.
  it("doesn't stack clips landing on different take lanes", () => {
    const movedClipGroups = new Map<string, MoveGroup>();

    runMove({ destination: takeLane(0), movedClipGroups });
    runMove({ destination: takeLane(1), movedClipGroups });
    emitArrangementWarnings(movedClipGroups);

    // Both landed — each on its own lane, so neither group holds a stack.
    expect(landedCount(movedClipGroups, takeLane(0))).toBe(1);
    expect(landedCount(movedClipGroups, takeLane(1))).toBe(1);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("moved to the same position"),
    );
  });

  it("doesn't stack a take-lane landing against a main-lane one", () => {
    const movedClipGroups = new Map<string, MoveGroup>();

    runMove({ movedClipGroups });
    runMove({ destination: takeLane(0), movedClipGroups });
    emitArrangementWarnings(movedClipGroups);

    expect(landedCount(movedClipGroups)).toBe(1);
    expect(landedCount(movedClipGroups, takeLane(0))).toBe(1);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("moved to the same position"),
    );
  });

  // One lane, one position: these really do land on top of each other, and the
  // warning names the lane so the caller knows which one.
  it("warns for clips landing on one take lane at one position", () => {
    const movedClipGroups = new Map<string, MoveGroup>();

    runMove({ destination: takeLane(1), movedClipGroups });
    runMove({ destination: takeLane(1), movedClipGroups });
    emitArrangementWarnings(movedClipGroups);

    expect(capturedWarnings()).toContainEqual(
      `2 clips on t${DEST_TRACK}/l1 moved to the same position - later clips will overwrite earlier ones`,
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
    expect(movedReason()).toContain(`re-created on t${DEST_TRACK}`);
    expect(result).not.toBe(SOURCE_ID);
  });

  // Same throw as the take-lane-destination case, but on the promote path:
  // a source ON a take lane being moved to a main lane.
  it("reports a failed promote to the main lane instead of throwing", () => {
    const result = runMove({
      sourcePath: TAKE_LANE_SOURCE,
      clipCreationFails: true,
    });

    expect(movedReason()).toContain(
      `not moved: Live created no clip at t${DEST_TRACK}`,
    );
    expect(movedReason()).not.toContain("re-created on");
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

    expect(movedReason()).toContain(
      `not moved: an incomplete clip was left on t${DEST_TRACK} (notes failed); the original clip was kept`,
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
    expect(movedReason()).toContain("emptied instead of deleted");
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
    expect(movedReason()).toContain("muted instead of deleted");
  });
});

// A destination that names a position but no lane keeps the clip's own lane. It
// used to land every clip on the track's MAIN lane, which promoted a take-lane
// clip off a lane the caller never mentioned — and piled a batch sharing one
// bare position onto that one lane, where each landing cleared the last.
describe("a move that names a position but no lane", () => {
  /** Past the index the lane's own create_midi_clip writes to. */
  const LANE_SOURCE = livePath.track(DEST_TRACK).takeLane(0).arrangementClip(3);
  const MAIN_SOURCE_ID = "321";

  /** Bar 9 in 4/4, where every move here aims. */
  const BAR_9 = 32;

  /**
   * A take-lane source on the lane track, so its own lane is a real one.
   * @returns The clip the call names
   */
  function registerLaneSource(): string {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMoveWorld({ sourcePath: LANE_SOURCE, initialLanes: 1 });

    return SOURCE_ID;
  }

  /**
   * A main-lane clip on the same track, for the batch that shares a position.
   * Its move answers with a copy that reports where it landed, so the entry's
   * path says which lane took it.
   */
  function registerMainSource(): void {
    registerMainLaneClip(MAIN_SOURCE_ID, 9, 48);

    const track = lookupMockObject(undefined, livePath.track(DEST_TRACK));

    track!.methods.duplicate_clip_to_arrangement = (_sourceId, startTime) => {
      registerMainLaneClip("322", 10, startTime as number);

      return ["id", "322"];
    };
  }

  /**
   * Register an 8-beat MIDI clip on the lane track's main lane.
   * @param id - Clip id
   * @param clipIndex - Its place in the track's arrangement_clips
   * @param start - Its start, in beats
   */
  function registerMainLaneClip(
    id: string,
    clipIndex: number,
    start: number,
  ): void {
    registerMockObject(id, {
      path: livePath.track(DEST_TRACK).arrangementClip(clipIndex),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: start,
        end_time: start + 8,
        length: 8,
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a take-lane clip on its own lane", async () => {
    const result = (await updateClip({
      id: registerLaneSource(),
      toPath: "[9|1]",
    })) as { path?: string; reason?: string };

    expectTakeLaneMidiClip(0, BAR_9, 8, DEST_TRACK);
    expect(result.path).toBe(`t${DEST_TRACK}/l0[9|1]`);
    expect(result.reason).toContain(`re-created on t${DEST_TRACK}/l0`);
  });

  // arrangementStart is the deprecated spelling of the same bare position, so
  // it has to keep the lane too.
  it("keeps the lane when the position comes from arrangementStart", async () => {
    const result = (await updateClip({
      id: registerLaneSource(),
      arrangementStart: "9|1",
    })) as { path?: string };

    expectTakeLaneMidiClip(0, BAR_9, 8, DEST_TRACK);
    expect(result.path).toBe(`t${DEST_TRACK}/l0[9|1]`);
  });

  // Naming the track IS naming the main lane, so that promote still happens.
  it("still promotes the clip when the destination names the track", async () => {
    const result = (await updateClip({
      id: registerLaneSource(),
      toPath: `t${DEST_TRACK}[9|1]`,
    })) as { reason?: string };

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", BAR_9, 8);
    expect(result.reason).toContain(`re-created on t${DEST_TRACK}`);
    expect(result.reason).not.toContain(`re-created on t${DEST_TRACK}/l0`);
  });

  // The shape that lost a clip: both clips sit on one track, so before this
  // both landed on its main lane and the second wiped out the first.
  it("lands a main-lane and a take-lane clip on their own lanes", async () => {
    const laneId = registerLaneSource();

    registerMainSource();

    const result = (await updateClip({
      id: `${MAIN_SOURCE_ID},${laneId}`,
      toPath: "[9|1]",
    })) as Array<{ path?: string }>;

    expect(result.map((entry) => entry.path)).toStrictEqual([
      `t${DEST_TRACK}[9|1]`,
      `t${DEST_TRACK}/l0[9|1]`,
    ]);
    // Different lanes, so nothing stacked and nothing may be warned about.
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("moved to the same position"),
    );
  });
});
