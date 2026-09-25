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
import { duplicateClipWithPositions } from "../clip/duplicate-clip-with-positions.ts";
import { copyLabels } from "../sources/copy-labels.ts";
import { duplicateClipSlot } from "../clip/duplicate-clip-slot.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";

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
        if (copyLands) {
          registerMockObject(COPY_ID, { path: destClipPath });
        }

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
  it("reports a MIDI clip aimed at an audio track on the slot's entry", () => {
    const { sourceClipSlot } = setupSlotDuplication({ destIsMidi: 0 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      path: "t1/s0",
      ok: false,
      reason:
        "track t1 (id live_set/tracks/1) is audio; a MIDI clip needs a MIDI track",
    });
    expect(capturedWarnings()).toStrictEqual([]);
    expect(sourceClipSlot.call).not.toHaveBeenCalled();
  });

  it("reports an audio clip aimed at a MIDI track on the slot's entry", () => {
    setupSlotDuplication({ clipIsMidi: 0 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      path: "t1/s0",
      ok: false,
      reason:
        "track t1 (id live_set/tracks/1) is MIDI; an audio clip needs an audio track",
    });
  });

  // A frozen track still reports has_midi_input, so the type check passes and
  // Live refuses the copy anyway.
  it("reports a frozen destination track on the slot's entry", () => {
    const { sourceClipSlot } = setupSlotDuplication({ destIsFrozen: 1 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      path: "t1/s0",
      ok: false,
      reason: "track t1 (id live_set/tracks/1) is frozen; unfreeze it first",
    });
    expect(sourceClipSlot.call).not.toHaveBeenCalled();
  });

  it("does not warn about freezing when the destination track is not frozen", () => {
    setupSlotDuplication({ destIsFrozen: 0 });

    // is_frozen is falsy, so the frozen guard must not fire (kills its
    // forced-true mutant).
    expect(duplicateClipSlot(0, 0, 1, 0)).not.toHaveProperty("ok");
  });

  // Without the landing check this walks into getMinimalClipInfo with an
  // unresolvable clip and throws an internal path error.
  it("reports instead of failing when no clip lands in the destination", () => {
    setupSlotDuplication({ copyLands: false });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      path: "t1/s0",
      ok: false,
      reason: "Live made no copy there",
    });
  });

  // The destination already holds a clip, so a path lookup finds one either
  // way; only its id tells the copy apart from the clip that was always there.
  it("warns and skips when the occupied destination still holds its own clip", () => {
    const { occupant } = setupSlotDuplication({
      destHasClip: 1,
      copyLands: false,
    });

    expect(duplicateClipSlot(0, 0, 1, 0, "Copy")).toStrictEqual({
      path: "t1/s0",
      ok: false,
      reason: "Live made no copy there",
    });
    // The clip that was already there is not the copy, so it keeps its name.
    expect(occupant?.set).not.toHaveBeenCalled();
  });

  // The copy destroys the clip that was there, so the entry has to say so —
  // the same wording update-clip's slot move uses.
  it("says the copy replaced the clip already in the slot", () => {
    setupSlotDuplication({ destHasClip: 1 });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      id: COPY_ID,
      path: "t1/s0",
      reason: "overwrote the existing clip at t1/s0",
    });
  });

  it("says nothing about overwriting when the slot was empty", () => {
    setupSlotDuplication({ destHasClip: 0 });

    expect(duplicateClipSlot(0, 0, 1, 0)).not.toHaveProperty("reason");
  });
});

describe("duplicateClipWithPositions to clip slots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the slot of a copy Live declined in the results", async () => {
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
        arrangementPositions: [],
        arrangementRefusals: [],
      },
      LiveAPI.from(SOURCE_CLIP_ID),
      SOURCE_CLIP_ID,
      copyLabels({}, 1),
      undefined,
      undefined,
      undefined,
      undefined,
      {},
    );

    expect(result).toStrictEqual([
      { id: COPY_ID, path: "t1/s0" },
      {
        path: "t2/s0",
        ok: false,
        reason: "track t2 (id live_set/tracks/2) is frozen; unfreeze it first",
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });
});

describe("duplicateClipSlot past the last scene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * A Set with two scenes whose t1/s3 slot only appears once create_scene has
   * made the scenes up to it.
   * @param opts - Test options
   * @param opts.copyLands - Whether duplicate_clip_to makes the copy
   * @param opts.slotAppears - Whether the new scenes bring the slot with them
   * @returns The Live Set mock
   */
  function setupShortSet(
    opts: { copyLands?: boolean; slotAppears?: boolean } = {},
  ): RegisteredMockObject {
    const { copyLands = true, slotAppears = true } = opts;

    mockNonExistentObjects();

    const destClipPath = livePath.track(1).clipSlot(3).clip();

    registerMockObject(SOURCE_CLIP_ID, {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_midi_clip: 1 },
    });
    registerMockObject("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
      methods: {
        duplicate_clip_to: () => {
          if (copyLands) {
            registerMockObject(COPY_ID, { path: destClipPath });
          }

          return null;
        },
      },
    });
    registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });

    return registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { scenes: ["id", 1, "id", 2] },
      methods: {
        create_scene: () =>
          slotAppears
            ? registerMockObject("live_set/tracks/1/clip_slots/3", {
                path: livePath.track(1).clipSlot(3),
                properties: { has_clip: 0 },
              })
            : null,
      },
    }) as RegisteredMockObject;
  }

  it("makes the scenes up to the destination and says which", () => {
    const liveSet = setupShortSet();

    expect(duplicateClipSlot(0, 0, 1, 3)).toStrictEqual({
      id: COPY_ID,
      path: "t1/s3",
      created: "s2-s3",
    });
    expect(liveSet.call).toHaveBeenCalledTimes(2);
  });

  // The scenes stay when the copy doesn't land, so the skip has to name them.
  it("names the scenes it made when Live declines the copy", () => {
    setupShortSet({ copyLands: false });

    expect(duplicateClipSlot(0, 0, 1, 3)).toStrictEqual({
      path: "t1/s3",
      ok: false,
      reason: "Live made no copy there; created s2-s3 to reach it",
    });
  });

  it("names the scenes it made when the slot still isn't there", () => {
    setupShortSet({ slotAppears: false });

    expect(duplicateClipSlot(0, 0, 1, 3)).toStrictEqual({
      path: "t1/s3",
      ok: false,
      reason: "no clip slot there; created s2-s3 to reach it",
    });
  });

  it("refuses a destination past the scene cap, making nothing", () => {
    const liveSet = setupShortSet();

    expect(duplicateClipSlot(0, 0, 1, MAX_AUTO_CREATED_SCENES)).toStrictEqual({
      path: `t1/s${MAX_AUTO_CREATED_SCENES}`,
      ok: false,
      reason:
        `scene "s${MAX_AUTO_CREATED_SCENES}" is out of range: ` +
        `scenes auto-create only through "s${MAX_AUTO_CREATED_SCENES - 1}"`,
    });
    expect(liveSet.call).not.toHaveBeenCalled();
  });
});

describe("duplicateClipSlot with a missing slot or clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when source clip slot does not exist", () => {
    (global as Record<string, unknown>).LiveAPI = createClipSlotMockLiveAPI({
      sourceExists: false,
      sourceHasClip: false,
      destExists: true,
    });

    expect(() => duplicateClipSlot(0, 0, 1, 0)).toThrow(
      "no clip slot at t0/s0",
    );
  });

  it("throws error when source clip slot has no clip", () => {
    (global as Record<string, unknown>).LiveAPI = createClipSlotMockLiveAPI({
      sourceExists: true,
      sourceHasClip: false,
      destExists: true,
    });

    expect(() => duplicateClipSlot(0, 0, 1, 0)).toThrow("no clip at t0/s0");
  });

  it("reports a destination clip slot that does not exist", () => {
    // Per destination, so the copies a multi-slot toPath already made survive.
    (global as Record<string, unknown>).LiveAPI = createClipSlotMockLiveAPI({
      sourceExists: true,
      sourceHasClip: true,
      destExists: false,
    });

    expect(duplicateClipSlot(0, 0, 1, 0)).toStrictEqual({
      path: "t1/s0",
      ok: false,
      reason: "no clip slot there",
    });
  });
});

interface ClipSlotMockOptions {
  sourceExists: boolean;
  sourceHasClip: boolean;
  destExists: boolean;
}

interface ClipSlotMockLiveAPIInstance {
  path: string;
  exists: () => boolean;
  getProperty: (prop: string) => boolean | null;
  getChildIds: (name: string) => string[];
  child: (name: string) => ClipSlotMockLiveAPIInstance;
  id: string;
}

interface ClipSlotMockLiveAPIConstructor {
  new (path: string): ClipSlotMockLiveAPIInstance;
  from: (
    idOrPath: string | { toString: () => string },
  ) => ClipSlotMockLiveAPIInstance;
}

/**
 * Helper to create a mock LiveAPI class for clip slot duplication tests
 * @param options - Mock configuration options
 * @param options.sourceExists - Whether source clip slot exists
 * @param options.sourceHasClip - Whether source has a clip
 * @param options.destExists - Whether destination clip slot exists
 * @returns Mock LiveAPI constructor
 */
function createClipSlotMockLiveAPI({
  sourceExists,
  sourceHasClip,
  destExists,
}: ClipSlotMockOptions): ClipSlotMockLiveAPIConstructor {
  class MockLiveAPI implements ClipSlotMockLiveAPIInstance {
    path: string;

    constructor(path: string) {
      this.path = path;
    }

    static from(idOrPath: string | { toString: () => string }): MockLiveAPI {
      return new MockLiveAPI(String(idOrPath));
    }

    child(name: string): MockLiveAPI {
      return new MockLiveAPI(`${this.path} ${name}`);
    }

    exists(): boolean {
      if (this.path.includes("tracks 0 clip_slots 0")) {
        return sourceExists;
      }

      if (this.path.includes("tracks 1 clip_slots 0")) {
        return destExists;
      }

      return true;
    }

    getProperty(prop: string): boolean | null {
      if (prop === "has_clip" && this.path.includes("tracks 0 clip_slots 0")) {
        return sourceHasClip;
      }

      return null;
    }

    // One scene, so s0 is never past the end and no scene is created here.
    getChildIds(): string[] {
      return ["id 1"];
    }

    get id(): string {
      return this.path.replaceAll(" ", "/");
    }
  }

  return MockLiveAPI;
}
