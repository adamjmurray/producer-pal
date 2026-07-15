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
import { type ClipResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import {
  handlePositionOperations,
  handleSessionSlotMove,
} from "../helpers/update-clip-session-helpers.ts";

vi.mock(import("../helpers/update-clip-arrangement-helpers.ts"), () => ({
  handleArrangementOperations: vi.fn(),
}));

/**
 * Create a mock clip and register destination slot mocks, then call handleSessionSlotMove.
 * @param opts - Test options
 * @param opts.trackIndex - Source clip track index
 * @param opts.sceneIndex - Source clip scene index
 * @param opts.toTrackIndex - Destination track index
 * @param opts.toSceneIndex - Destination scene index
 * @param opts.destHasClip - Whether destination slot has an existing clip
 * @param opts.noteResult - Note result to pass
 * @param opts.registerSource - Whether to register the source clip slot
 * @param opts.registerDest - Whether to register destination mocks
 * @returns Object with mockClip, updatedClips, and source clip slot mock
 */
function runSessionMove(opts: {
  trackIndex?: number;
  sceneIndex?: number;
  toTrackIndex: number;
  toSceneIndex: number;
  destHasClip?: number;
  noteResult?: { noteCount: number } | null;
  registerSource?: boolean;
  registerDest?: boolean;
}) {
  const {
    trackIndex = 0,
    sceneIndex = 0,
    toTrackIndex,
    toSceneIndex,
    destHasClip = 0,
    noteResult = null,
    registerSource = true,
    registerDest = true,
  } = opts;

  const mockClip = {
    id: "123",
    trackIndex,
    sceneIndex,
    getProperty: vi.fn(),
  };

  const sourceSlot = registerSource
    ? registerMockObject(
        `live_set/tracks/${trackIndex}/clip_slots/${sceneIndex}`,
        {
          path: livePath.track(trackIndex).clipSlot(sceneIndex),
        },
      )
    : undefined;

  if (registerDest) {
    registerMockObject(
      `live_set/tracks/${toTrackIndex}/clip_slots/${toSceneIndex}`,
      {
        path: livePath.track(toTrackIndex).clipSlot(toSceneIndex),
        properties: { has_clip: destHasClip },
      },
    );
    registerMockObject(
      `live_set/tracks/${toTrackIndex}/clip_slots/${toSceneIndex}/clip`,
      {
        path: livePath.track(toTrackIndex).clipSlot(toSceneIndex).clip(),
      },
    );
  }

  const updatedClips: ClipResult[] = [];

  handleSessionSlotMove({
    clip: mockClip as unknown as LiveAPI,
    toSlot: { trackIndex: toTrackIndex, sceneIndex: toSceneIndex },
    updatedClips,
    noteResult,
  });

  return {
    mockClip,
    updatedClips,
    sourceSlot: sourceSlot as RegisteredMockObject,
  };
}

describe("handleSessionSlotMove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should move session clip to new slot", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      toTrackIndex: 1,
      toSceneIndex: 2,
      noteResult: { noteCount: 5 },
    });

    expect(sourceSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      "id live_set/tracks/1/clip_slots/2",
    );
    expect(sourceSlot.call).toHaveBeenCalledWith("delete_clip");
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({
      id: "live_set/tracks/1/clip_slots/2/clip",
      noteCount: 5,
      slot: "1/2",
    });
  });

  it("should warn and skip for clip with unknown slot position", () => {
    const mockClip = {
      id: "123",
      trackIndex: null,
      sceneIndex: null,
      getProperty: vi.fn(),
    };

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips,
      noteResult: null,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "could not determine slot position for clip 123",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({ id: "123" });
  });

  it("should warn when only the track index is unknown", () => {
    const updatedClips: ClipResult[] = [];

    // sceneIndex is a real number: the guard must still fire (|| not &&, and the
    // whole conditional must not be forced false).
    handleSessionSlotMove({
      clip: {
        id: "123",
        trackIndex: null,
        sceneIndex: 0,
        getProperty: vi.fn(),
      } as unknown as LiveAPI,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips,
      noteResult: null,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "could not determine slot position for clip 123",
    );
  });

  it("should warn when only the scene index is unknown", () => {
    const updatedClips: ClipResult[] = [];

    // trackIndex is a real number, sceneIndex is null: the second operand of the
    // guard must stay live (kills the srcSceneIndex == null -> false mutant).
    handleSessionSlotMove({
      clip: {
        id: "123",
        trackIndex: 0,
        sceneIndex: null,
        getProperty: vi.fn(),
      } as unknown as LiveAPI,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips,
      noteResult: null,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "could not determine slot position for clip 123",
    );
  });

  it("should move (not no-op) when only the scene index matches", () => {
    const { updatedClips, sourceSlot } = runSessionMove({
      trackIndex: 0,
      sceneIndex: 1,
      toTrackIndex: 2,
      toSceneIndex: 1,
    });

    // Same-scene but different track is NOT the same slot: the trackIndex ===
    // comparison must stay live (forced-true would treat it as a no-op).
    expect(sourceSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.any(String),
    );
    expect(updatedClips[0]).toMatchObject({
      id: "live_set/tracks/2/clip_slots/1/clip",
      slot: "2/1",
    });
  });

  it("should not warn about overwriting when the destination is empty", () => {
    runSessionMove({ toTrackIndex: 1, toSceneIndex: 5, destHasClip: 0 });

    // has_clip is falsy, so the overwrite warning must not fire (kills the
    // forced-true mutant on the has_clip guard).
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("overwriting existing clip"),
    );
  });

  it("should no-op when moving to same slot", () => {
    const { updatedClips } = runSessionMove({
      trackIndex: 2,
      sceneIndex: 3,
      toTrackIndex: 2,
      toSceneIndex: 3,
    });

    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({
      id: "123",
      slot: "2/3",
    });
    // No duplicate_clip_to should have been called
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("overwriting"),
    );
  });

  it("should warn when destination slot does not exist", () => {
    mockNonExistentObjects();

    const mockClip = {
      id: "123",
      trackIndex: 0,
      sceneIndex: 0,
      getProperty: vi.fn(),
    };

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 99, sceneIndex: 99 },
      updatedClips,
      noteResult: null,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "destination slot 99/99 does not exist",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({ id: "123" });
  });

  it("should warn when overwriting existing clip at destination", () => {
    const { updatedClips } = runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
      destHasClip: 1,
    });

    expect(outlet).toHaveBeenCalledWith(1, "overwriting existing clip at 0/1");
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({
      id: "live_set/tracks/0/clip_slots/1/clip",
      slot: "0/1",
    });
  });

  it("should include noteCount in result when provided", () => {
    const { updatedClips } = runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
      noteResult: { noteCount: 12 },
    });

    expect(updatedClips[0]).toMatchObject({
      noteCount: 12,
      slot: "0/1",
    });
  });

  it("should omit noteCount from result when null", () => {
    const { updatedClips } = runSessionMove({
      toTrackIndex: 0,
      toSceneIndex: 1,
    });

    expect(updatedClips[0]).not.toHaveProperty("noteCount");
  });
});

describe("handlePositionOperations", () => {
  it("should warn when toSlot used on arrangement clip", () => {
    const mockClip = {
      id: "789",
      getProperty: vi.fn((prop: string) => {
        if (prop === "is_arrangement_clip") return 1;

        return 0;
      }),
    };

    const updatedClips: ClipResult[] = [];

    handlePositionOperations({
      clip: mockClip as unknown as LiveAPI,
      isAudioClip: false,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      tracksWithMovedClips: new Map(),
      context: {},
      updatedClips,
      noteResult: null,
      isNonSurvivor: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "toSlot parameter ignored for arrangement clip (id 789)",
    );
  });

  it("should warn when toSlot used with arrangement parameters", () => {
    const mockClip = {
      id: "123",
      getProperty: vi.fn(() => 0),
    };

    const updatedClips: ClipResult[] = [];

    handlePositionOperations({
      clip: mockClip as unknown as LiveAPI,
      isAudioClip: false,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      arrangementStartBeats: 8,
      tracksWithMovedClips: new Map(),
      context: {},
      updatedClips,
      noteResult: null,
      isNonSurvivor: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "toSlot ignored when arrangement parameters are specified",
    );
  });

  it("should warn when toSlot used with arrangement LENGTH only", () => {
    const updatedClips: ClipResult[] = [];

    // Only arrangementLengthBeats is set (no start): the second operand of the
    // arrangement-params guard must stay live (kills its -> false mutant).
    handlePositionOperations({
      clip: { id: "123", getProperty: vi.fn(() => 0) } as unknown as LiveAPI,
      isAudioClip: false,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      arrangementLengthBeats: 8,
      tracksWithMovedClips: new Map(),
      context: {},
      updatedClips,
      noteResult: null,
      isNonSurvivor: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "toSlot ignored when arrangement parameters are specified",
    );
  });

  it("should not warn about arrangement toSlot when no toSlot is given", () => {
    const updatedClips: ClipResult[] = [];

    // Arrangement clip but no toSlot: the else-if (toSlot != null && isArrangement)
    // must stay false (kills forced-true and the && -> || mutant).
    handlePositionOperations({
      clip: {
        id: "789",
        getProperty: vi.fn((prop: string) =>
          prop === "is_arrangement_clip" ? 1 : 0,
        ),
      } as unknown as LiveAPI,
      isAudioClip: false,
      arrangementStartBeats: 8,
      tracksWithMovedClips: new Map(),
      context: {},
      updatedClips,
      noteResult: null,
      isNonSurvivor: false,
    });

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("toSlot parameter ignored for arrangement clip"),
    );
  });
});
