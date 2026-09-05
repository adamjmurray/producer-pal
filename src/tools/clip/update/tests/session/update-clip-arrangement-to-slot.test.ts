// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { handleArrangementToSlotMove } from "../../helpers/update-clip-slot-move-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const SOURCE_TRACK = 0;
const DEST_TRACK = 1;
const DEST_SCENE = 2;
const SOURCE_ID = "123";
/**
 * How a warning names the source clip: both spellings, per ADR-0009. The clip
 * starts at 0, which the song's 4/4 spells as bar 1 beat 1.
 */
const SOURCE = `t${SOURCE_TRACK}[1|1] (id ${SOURCE_ID})`;
/** Same, for the tests whose source sits on a take lane. */
const SOURCE_ON_LANE = `t${SOURCE_TRACK}/l0[1|1] (id ${SOURCE_ID})`;
const NEW_ID = "456";
const OCCUPANT_ID = "789";
/** Id of the clip built in a scratch slot before it's swapped onto the destination */
const SCRATCH_CLIP_ID = "999";
const TAKE_LANE_SOURCE = livePath
  .track(SOURCE_TRACK)
  .takeLane(0)
  .arrangementClip(0);

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

interface MoveOptions {
  /** Path of the source clip; a take-lane path makes it a take that gets emptied */
  sourcePath?: string;
  isMidi?: number;
  filePath?: string;
  hasEnvelopes?: number;
  warping?: number;
  destIsMidi?: number;
  destSlotExists?: boolean;
  destHasClip?: number;
  /** Simulates an offline audio sample: Live's create call lands no clip. */
  destCreateFails?: boolean;
  /**
   * has_clip for each of the destination track's other scenes, indexed by
   * scene index (DEST_SCENE's own entry is ignored — destHasClip controls
   * that one). Drives the scratch-slot search: omit for the default (the
   * track reports no clip_slots at all, so the search finds nothing and
   * falls straight back).
   */
  otherScenes?: number[];
  /** Live creates a real clip, then add_new_notes throws — a post-creation failure. */
  incompleteCreate?: boolean;
  /** The scratch slot's create call lands no clip (only meaningful with otherScenes). */
  scratchCreateFails?: boolean;
  /** The scratch slot's duplicate_clip_to declines — nothing lands at the destination. */
  scratchCopyDeclines?: boolean;
}

/**
 * Register an arrangement source and a destination slot, then run the move.
 * @param opts - What this test varies
 * @returns The results the move collected
 */
function runMove(opts: MoveOptions = {}): ClipResult[] {
  const {
    sourcePath = livePath.track(SOURCE_TRACK).arrangementClip(0),
    isMidi = 1,
    filePath = "",
    hasEnvelopes = 0,
    warping = 0,
    destIsMidi = 1,
    destSlotExists = true,
    destHasClip = 0,
    destCreateFails = false,
    otherScenes,
    incompleteCreate = false,
    scratchCreateFails = false,
    scratchCopyDeclines = false,
  } = opts;

  mockNonExistentObjects();

  const destSlotPath = livePath.track(DEST_TRACK).clipSlot(DEST_SCENE);
  const newClipPath = destSlotPath.clip();

  registerMockObject(SOURCE_ID, {
    path: sourcePath,
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: isMidi,
      file_path: filePath,
      has_envelopes: hasEnvelopes,
      warping,
      length: 16,
      start_marker: 0,
      loop_start: 0,
      loop_end: 16,
      end_marker: 16,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      name: "Verse",
      color: 16711680,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: NOTES }) },
  });

  registerMockObject(`track_${SOURCE_TRACK}`, {
    path: livePath.track(SOURCE_TRACK),
  });
  registerMockObject(`track_${DEST_TRACK}`, {
    path: livePath.track(DEST_TRACK),
    properties: {
      has_midi_input: destIsMidi,
      is_frozen: 0,
      // getChildCount only needs the right length; the scratch search reads
      // each scene straight off its own path, never these placeholder ids.
      ...(otherScenes && {
        clip_slots: children(...otherScenes.map((_, i) => `slot${i}`)),
      }),
    },
  });

  for (const [sceneIndex, hasClip] of (otherScenes ?? []).entries()) {
    if (sceneIndex === DEST_SCENE) continue;
    registerScratchSlot(sceneIndex, hasClip);
  }

  if (destSlotExists) {
    registerMockObject("dest_slot", {
      path: destSlotPath,
      type: "ClipSlot",
      properties: { has_clip: destHasClip },
      methods: {
        create_clip: () => {
          if (!destCreateFails) registerDestClip();

          return null;
        },
        create_audio_clip: () => {
          if (!destCreateFails) registerDestClip();

          return null;
        },
        delete_clip: () => null,
      },
    });
  }

  /** Registers the clip a successful create lands at the destination. */
  function registerDestClip(): void {
    registerMockObject(NEW_ID, {
      path: newClipPath,
      type: "Clip",
      ...(incompleteCreate && {
        methods: {
          add_new_notes: () => {
            throw new Error("notes failed");
          },
        },
      }),
    });
  }

  /**
   * An empty scratch slot elsewhere on the destination track: create the
   * replacement there, then duplicate_clip_to it onto the real destination.
   */
  function registerScratchSlot(sceneIndex: number, hasClip: number): void {
    const path = livePath.track(DEST_TRACK).clipSlot(sceneIndex);
    const clipPath = path.clip();

    const createScratchClip = (): null => {
      if (!scratchCreateFails) {
        registerMockObject(SCRATCH_CLIP_ID, { path: clipPath, type: "Clip" });
      }

      return null;
    };

    registerMockObject(`scratch_slot_${sceneIndex}`, {
      path,
      type: "ClipSlot",
      properties: { has_clip: hasClip },
      methods: {
        create_clip: createScratchClip,
        create_audio_clip: createScratchClip,
        duplicate_clip_to: () => {
          if (!scratchCopyDeclines) {
            registerMockObject(NEW_ID, { path: newClipPath, type: "Clip" });
          }

          return null;
        },
        delete_clip: () => null,
      },
    });
  }

  // Skipped when the create fails: nothing re-registers newClipPath in that
  // case, and delete_clip is a no-op mock, so leaving the occupant registered
  // would make the slot look occupied by its old clip rather than empty.
  if (destHasClip && !destCreateFails) {
    registerMockObject(OCCUPANT_ID, { path: newClipPath, type: "Clip" });
  }

  const updatedClips: ClipResult[] = [];

  handleArrangementToSlotMove({
    clip: LiveAPI.from(`id ${SOURCE_ID}`),
    toSlot: { trackIndex: DEST_TRACK, sceneIndex: DEST_SCENE },
    updatedClips,
    noteResult: null,
  });

  return updatedClips;
}

/** The move landed: the new clip at the destination is all that came back. */
function expectMovedToDestination(updatedClips: ClipResult[]): void {
  expect(updatedClips).toStrictEqual([
    { id: NEW_ID, path: `t${DEST_TRACK}/s${DEST_SCENE}` },
  ]);
}

/** The destination's occupant was replaced, and the caller was told. */
function expectOverwriteWarning(): void {
  expect(capturedWarnings()).toContain(
    `clip ${SOURCE} overwrote the existing clip at t${DEST_TRACK}/s${DEST_SCENE}`,
  );
}

describe("handleArrangementToSlotMove", () => {
  it("re-creates the clip in the slot and deletes the original", () => {
    const updatedClips = runMove();

    expect(lookupMockObject("dest_slot")?.call).toHaveBeenCalledWith(
      "create_clip",
      16,
    );
    expect(lookupMockObject(NEW_ID)?.call).toHaveBeenCalledWith(
      "add_new_notes",
      { notes: NOTES },
    );
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).toHaveBeenCalledWith("delete_clip", `id ${SOURCE_ID}`);
    expectMovedToDestination(updatedClips);
  });

  it("carries the source's name and color", () => {
    runMove();

    expect(lookupMockObject(NEW_ID)?.set).toHaveBeenCalledWith("name", "Verse");
    expect(lookupMockObject(NEW_ID)?.set).toHaveBeenCalledWith(
      "color",
      16711680,
    );
  });

  it("re-creates an audio clip from its sample", () => {
    runMove({ isMidi: 0, filePath: "/samples/loop.wav", destIsMidi: 0 });

    expect(lookupMockObject("dest_slot")?.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/samples/loop.wav",
    );
  });

  it("says what the re-created clip loses", () => {
    runMove({ hasEnvelopes: 1 });

    expect(capturedWarnings()).toContain(
      `arrangement clip ${SOURCE} was re-created at t${DEST_TRACK}/s${DEST_SCENE} (automation envelopes aren't copied)`,
    );
  });

  // Most clips have no envelopes, so the parenthetical has to stay off them.
  it("names no loss when the clip loses nothing", () => {
    runMove();

    expect(capturedWarnings()).toContain(
      `arrangement clip ${SOURCE} was re-created at t${DEST_TRACK}/s${DEST_SCENE}`,
    );
  });

  it("clears the slot's existing clip first, and says so", () => {
    runMove({ destHasClip: 1 });

    expect(lookupMockObject("dest_slot")?.call).toHaveBeenCalledWith(
      "delete_clip",
    );
    expectOverwriteWarning();
  });

  // The occupant is never predeleted here: the replacement is built and
  // verified elsewhere first, then swapped in atomically.
  it("builds the replacement in an empty scene first when one is free, instead of deleting the occupant", () => {
    const updatedClips = runMove({ destHasClip: 1, otherScenes: [0] });

    const scratch = lookupMockObject("scratch_slot_0");

    expect(scratch?.call).toHaveBeenCalledWith("create_clip", 16);
    expect(scratch?.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.anything(),
    );
    expect(scratch?.call).toHaveBeenCalledWith("delete_clip");
    expect(lookupMockObject("dest_slot")?.call).not.toHaveBeenCalledWith(
      "delete_clip",
    );
    expectOverwriteWarning();
    expectMovedToDestination(updatedClips);
  });

  // Distinct from the "clears the slot" case above: here the track's other
  // scenes are known (not just unreported) and every one is occupied too, so
  // the search comes back empty rather than the collection being absent.
  it("falls back to deleting the occupant when every other scene is occupied too", () => {
    // Index 2 is DEST_SCENE itself — included so the search passes over its
    // own destination rather than just running out of scenes before reaching it.
    const updatedClips = runMove({ destHasClip: 1, otherScenes: [1, 1, 1] });

    // The search actually happened — both other scenes were checked...
    expect(lookupMockObject("scratch_slot_0")?.get).toHaveBeenCalledWith(
      "has_clip",
    );
    expect(lookupMockObject("scratch_slot_1")?.get).toHaveBeenCalledWith(
      "has_clip",
    );
    // ...and, being occupied, neither is ever asked to create anything.
    expect(lookupMockObject("scratch_slot_0")?.call).not.toHaveBeenCalled();
    expect(lookupMockObject("scratch_slot_1")?.call).not.toHaveBeenCalled();
    expect(lookupMockObject("dest_slot")?.call).toHaveBeenCalledWith(
      "delete_clip",
    );
    expectOverwriteWarning();
    expectMovedToDestination(updatedClips);
  });

  // add_new_notes throws after Live already created a real clip: the
  // destination now holds an unfinished clip, not nothing, so the warning has
  // to say that rather than just calling the occupant lost.
  it("reports a post-creation failure as an incomplete clip left behind", () => {
    const updatedClips = runMove({ destHasClip: 1, incompleteCreate: true });

    const warning = capturedWarnings().find((w) =>
      w.includes(`clip ${SOURCE} was not moved`),
    );

    expect(warning).toContain("incomplete clip is there now");
    expect(warning).toContain(`t${DEST_TRACK}/s${DEST_SCENE}`);
    expect(warning).toContain("source clip in the arrangement is untouched");
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  // Nothing was ever occupied here, so the warning has neither an "is gone"
  // nor a "was not touched" occupant note to make.
  it("reports a failed create at an already-empty destination, naming nothing lost", () => {
    const updatedClips = runMove({
      isMidi: 0,
      filePath: "/samples/offline.wav",
      destIsMidi: 0,
      destHasClip: 0,
      destCreateFails: true,
    });

    const warning = capturedWarnings().find((w) =>
      w.includes(`clip ${SOURCE} was not moved`),
    );

    expect(warning).toBe(
      `clip ${SOURCE} was not moved: create failed at t${DEST_TRACK}/s${DEST_SCENE} (Live created no clip - an audio clip needs an audio track). The source clip in the arrangement is untouched.`,
    );
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  // The create is tried in the scratch slot first, so a failure there never
  // touches the occupant at all — the strongest outcome the safe path buys.
  it("keeps the occupant untouched when the scratch slot's own create fails", () => {
    const updatedClips = runMove({
      destHasClip: 1,
      otherScenes: [0],
      scratchCreateFails: true,
    });

    expect(lookupMockObject("dest_slot")?.call).not.toHaveBeenCalledWith(
      "delete_clip",
    );

    const warning = capturedWarnings().find((w) =>
      w.includes(`clip ${SOURCE} was not moved`),
    );

    expect(warning).toContain(`t${DEST_TRACK}/s0`);
    expect(warning).toContain(`t${DEST_TRACK}/s${DEST_SCENE} was not touched`);
    expect(warning).toContain("source clip in the arrangement is untouched");
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  // duplicate_clip_to declining is a defensive case — same-track, type-matched
  // copies aren't expected to fail — but nothing here is left in a bad state
  // if it somehow does: the built clip stays in the scratch slot, unreported
  // as a move, and both real clips are untouched.
  it("keeps both clips untouched when the atomic swap itself declines", () => {
    const updatedClips = runMove({
      destHasClip: 1,
      otherScenes: [0],
      scratchCopyDeclines: true,
    });

    expect(lookupMockObject("dest_slot")?.call).not.toHaveBeenCalledWith(
      "delete_clip",
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE} was not moved: the copy onto t${DEST_TRACK}/s${DEST_SCENE} did not land`,
      ),
    );
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  // An offline audio clip (sample moved or deleted) still reports a non-empty
  // file_path, so it passes every guard and only fails once Live actually
  // tries the create — by which point the occupant is already deleted.
  it("reports the destination's loss when the create fails, and keeps the source", () => {
    const updatedClips = runMove({
      isMidi: 0,
      filePath: "/samples/offline.wav",
      destIsMidi: 0,
      destHasClip: 1,
      destCreateFails: true,
    });

    expect(lookupMockObject("dest_slot")?.call).toHaveBeenCalledWith(
      "delete_clip",
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE} was not moved: create failed at t${DEST_TRACK}/s${DEST_SCENE}`,
      ),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("gone and can't be recovered"),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("source clip in the arrangement is untouched"),
    );
    // The source is only reported kept, not actually deleted from the track.
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalled();
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  // Live can't delete a take-lane clip, so the move re-creates it in the slot
  // and empties the take where it stands.
  it("empties a take-lane source instead of deleting it", () => {
    const updatedClips = runMove({ sourcePath: TAKE_LANE_SOURCE });

    expect(updatedClips[0]?.id).toBe(NEW_ID);
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalled();

    const source = lookupMockObject(SOURCE_ID);

    expect(source?.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      -16,
      48,
    );
    expect(source?.set).toHaveBeenCalledWith("name", "(moved) Verse");
    expect(source?.set).toHaveBeenCalledWith("muted", 1);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${SOURCE_ON_LANE} was emptied instead of deleted`,
      ),
    );
  });

  // Every refusal keeps the clip where it is and still reports it, so the rest
  // of a batch update isn't lost with the move.
  it.each([
    [
      "an audio clip with no sample",
      { isMidi: 0, destIsMidi: 0 },
      "it's an audio clip with no sample file",
    ],
    [
      "a MIDI clip aimed at an audio track",
      { destIsMidi: 0 },
      `track ${DEST_TRACK} is audio`,
    ],
  ])("refuses %s", (_label, opts: MoveOptions, expected) => {
    const updatedClips = runMove(opts);

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(`clip ${SOURCE} was not moved: ${expected}`),
    );
    expect(lookupMockObject("dest_slot")?.call).not.toHaveBeenCalled();
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  it("refuses a destination slot that does not exist", () => {
    const updatedClips = runMove({ destSlotExists: false });

    expect(capturedWarnings()).toContain(
      `clip ${SOURCE} was not moved: destination t${DEST_TRACK}/s${DEST_SCENE} does not exist`,
    );
    expect(
      lookupMockObject(`track_${SOURCE_TRACK}`)?.call,
    ).not.toHaveBeenCalled();
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });

  it("keeps the clip when its track can't be determined", () => {
    mockNonExistentObjects();
    const updatedClips: ClipResult[] = [];

    handleArrangementToSlotMove({
      clip: {
        id: SOURCE_ID,
        path: "",
        trackIndex: null,
        getProperty: vi.fn(),
      } as unknown as LiveAPI,
      toSlot: { trackIndex: DEST_TRACK, sceneIndex: DEST_SCENE },
      updatedClips,
      noteResult: null,
    });

    expect(capturedWarnings()).toContain(
      `clip id ${SOURCE_ID} was not moved: could not determine its track`,
    );
    expect(updatedClips[0]?.id).toBe(SOURCE_ID);
  });
});
