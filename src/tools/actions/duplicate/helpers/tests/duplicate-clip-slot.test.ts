// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicateClipWithPositions } from "../clip/duplicate-clip-position-helpers.ts";
import { duplicateClipSlot } from "../clip/duplicate-clip-slot-helpers.ts";

/** Source clip, in slot 0/0 */
const SOURCE_CLIP_ID = "56";
/** Clip Live creates in the destination slot when the copy lands */
const COPY_ID = "61";
/** Clip already sitting in the destination slot */
const OCCUPANT_ID = "60";

/**
 * Register a source clip in slot 0/0 and a destination slot, with
 * duplicate_clip_to creating a clip only when the copy is set to land.
 * Unregistered objects are non-existent, so the destination holds a clip only
 * when this helper puts one there.
 * @param opts - Test options
 * @param opts.destHasClip - Whether the destination slot already has a clip
 * @param opts.copyLands - Whether duplicate_clip_to makes the copy
 * @param opts.clipIsMidi - Whether the source clip is MIDI
 * @param opts.destIsMidi - Whether the destination track takes MIDI
 * @param opts.destIsFrozen - Whether the destination track is frozen
 * @returns The source clip slot and the destination's existing clip mocks
 */
function setupSlotDuplication(
  opts: {
    destHasClip?: number;
    copyLands?: boolean;
    clipIsMidi?: number;
    destIsMidi?: number;
    destIsFrozen?: number;
  } = {},
): {
  sourceClipSlot: RegisteredMockObject;
  occupant: RegisteredMockObject | undefined;
} {
  const {
    destHasClip = 0,
    copyLands = true,
    clipIsMidi = 1,
    destIsMidi = 1,
    destIsFrozen = 0,
  } = opts;

  mockNonExistentObjects();

  const destClipPath = livePath.track(1).clipSlot(0).clip();

  registerMockObject(SOURCE_CLIP_ID, {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { is_midi_clip: clipIsMidi },
  });

  const sourceClipSlot = registerMockObject("live_set/tracks/0/clip_slots/0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 1 },
    methods: {
      duplicate_clip_to: () => {
        if (copyLands) registerMockObject(COPY_ID, { path: destClipPath });

        return null;
      },
    },
  });

  registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: { has_midi_input: destIsMidi, is_frozen: destIsFrozen },
  });

  registerMockObject("live_set/tracks/1/clip_slots/0", {
    path: livePath.track(1).clipSlot(0),
    properties: { has_clip: destHasClip },
  });

  const occupant = destHasClip
    ? registerMockObject(OCCUPANT_ID, { path: destClipPath })
    : undefined;

  return { sourceClipSlot, occupant };
}

describe("duplicateClipSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the copy that landed", () => {
    const { sourceClipSlot } = setupSlotDuplication();

    const result = duplicateClipSlot(0, 0, 1, 0, "Copy", "#FF0000");

    expect(sourceClipSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      "id live_set/tracks/1/clip_slots/0",
    );
    expect(result).toStrictEqual({ id: COPY_ID, path: "t1/s0" });
  });

  // Live's duplicate_clip_to returns success and copies nothing on a type
  // mismatch, so without this the result names a clip that was never made.
  it("warns and skips a MIDI clip duplicated to an audio track", () => {
    const { sourceClipSlot } = setupSlotDuplication({ destIsMidi: 0 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toBeNull();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "MIDI clip 56 was not duplicated: track 1 is audio",
    );
    expect(sourceClipSlot.call).not.toHaveBeenCalled();
  });

  it("warns and skips an audio clip duplicated to a MIDI track", () => {
    setupSlotDuplication({ clipIsMidi: 0 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toBeNull();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "audio clip 56 was not duplicated: track 1 is MIDI",
    );
  });

  // A frozen track still reports has_midi_input, so the type check passes and
  // Live refuses the copy anyway.
  it("warns and skips a duplicate to a frozen track", () => {
    const { sourceClipSlot } = setupSlotDuplication({ destIsFrozen: 1 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toBeNull();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "MIDI clip 56 was not duplicated: track 1 is frozen",
    );
    expect(sourceClipSlot.call).not.toHaveBeenCalled();
  });

  it("does not warn about freezing when the destination track is not frozen", () => {
    setupSlotDuplication({ destIsFrozen: 0 });

    // is_frozen is falsy, so the frozen guard must not fire (kills its
    // forced-true mutant).
    expect(duplicateClipSlot(0, 0, 1, 0)).not.toBeNull();
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("is frozen"),
    );
  });

  // Without the landing check this walks into getMinimalClipInfo with an
  // unresolvable clip and throws an internal path error.
  it("warns instead of failing when no clip lands in the destination", () => {
    setupSlotDuplication({ copyLands: false });

    expect(duplicateClipSlot(0, 0, 1, 0)).toBeNull();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "clip 56 was not duplicated: no clip landed at 1/0",
    );
  });

  // The destination already holds a clip, so a path lookup finds one either
  // way; only its id tells the copy apart from the clip that was always there.
  it("warns and skips when the occupied destination still holds its own clip", () => {
    const { occupant } = setupSlotDuplication({
      destHasClip: 1,
      copyLands: false,
    });

    expect(duplicateClipSlot(0, 0, 1, 0, "Copy")).toBeNull();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "clip 56 was not duplicated: no clip landed at 1/0",
    );
    // The clip that was already there is not the copy, so it keeps its name.
    expect(occupant?.set).not.toHaveBeenCalled();
  });

  it("reports the copy when it replaces the clip already in the slot", () => {
    setupSlotDuplication({ destHasClip: 1 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      id: COPY_ID,
      path: "t1/s0",
    });
  });
});

describe("duplicateClipWithPositions to session slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves the copies Live declined out of the results", async () => {
    setupSlotDuplication();

    // Track 2 is frozen, so its copy is skipped while track 1's still lands.
    registerMockObject("live_set/tracks/2", {
      path: livePath.track(2),
      properties: { has_midi_input: 1, is_frozen: 1 },
    });
    registerMockObject("live_set/tracks/2/clip_slots/0", {
      path: livePath.track(2).clipSlot(0),
      properties: { has_clip: 0 },
    });

    const result = await duplicateClipWithPositions(
      {
        destination: "session",
        slots: [
          { trackIndex: 1, sceneIndex: 0 },
          { trackIndex: 2, sceneIndex: 0 },
        ],
        arrangementTargets: [],
      },
      LiveAPI.from(SOURCE_CLIP_ID),
      SOURCE_CLIP_ID,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {},
    );

    expect(result).toStrictEqual([{ id: COPY_ID, path: "t1/s0" }]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      "MIDI clip 56 was not duplicated: track 2 is frozen",
    );
  });
});
