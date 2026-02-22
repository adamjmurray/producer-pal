// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
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

describe("handleSessionSlotMove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should move session clip to new slot", () => {
    const mockClip = {
      id: "123",
      trackIndex: 0,
      sceneIndex: 0,
      getProperty: vi.fn(),
    };

    const sourceClipSlot = registerMockObject(
      "live_set/tracks/0/clip_slots/0",
      { path: livePath.track(0).clipSlot(0) },
    );

    registerMockObject("live_set/tracks/1/clip_slots/2", {
      path: livePath.track(1).clipSlot(2),
      properties: { has_clip: 0 },
    });

    registerMockObject("live_set/tracks/1/clip_slots/2/clip", {
      path: livePath.track(1).clipSlot(2).clip(),
    });

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 1, sceneIndex: 2 },
      updatedClips,
      finalNoteCount: 5,
    });

    expect(sourceClipSlot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      "id live_set/tracks/1/clip_slots/2",
    );
    expect(sourceClipSlot.call).toHaveBeenCalledWith("delete_clip");
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({
      id: "live_set/tracks/1/clip_slots/2/clip",
      noteCount: 5,
      trackIndex: 1,
      sceneIndex: 2,
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
      finalNoteCount: null,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "could not determine slot position for clip 123",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({ id: "123" });
  });

  it("should no-op when moving to same slot", () => {
    const mockClip = {
      id: "123",
      trackIndex: 2,
      sceneIndex: 3,
      getProperty: vi.fn(),
    };

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 2, sceneIndex: 3 },
      updatedClips,
      finalNoteCount: null,
    });

    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({
      id: "123",
      trackIndex: 2,
      sceneIndex: 3,
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
      finalNoteCount: null,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "destination slot 99/99 does not exist",
    );
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({ id: "123" });
  });

  it("should warn when overwriting existing clip at destination", () => {
    const mockClip = {
      id: "123",
      trackIndex: 0,
      sceneIndex: 0,
      getProperty: vi.fn(),
    };

    registerMockObject("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
    });

    registerMockObject("live_set/tracks/0/clip_slots/1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 1 },
    });

    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 0, sceneIndex: 1 },
      updatedClips,
      finalNoteCount: null,
    });

    expect(outlet).toHaveBeenCalledWith(1, "overwriting existing clip at 0/1");
    expect(updatedClips).toHaveLength(1);
    expect(updatedClips[0]).toMatchObject({
      id: "live_set/tracks/0/clip_slots/1/clip",
      trackIndex: 0,
      sceneIndex: 1,
    });
  });

  it("should include noteCount in result when provided", () => {
    const mockClip = {
      id: "123",
      trackIndex: 0,
      sceneIndex: 0,
      getProperty: vi.fn(),
    };

    registerMockObject("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
    });

    registerMockObject("live_set/tracks/0/clip_slots/1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 0 },
    });

    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 0, sceneIndex: 1 },
      updatedClips,
      finalNoteCount: 12,
    });

    expect(updatedClips[0]).toMatchObject({
      noteCount: 12,
      trackIndex: 0,
      sceneIndex: 1,
    });
  });

  it("should omit noteCount from result when null", () => {
    const mockClip = {
      id: "123",
      trackIndex: 0,
      sceneIndex: 0,
      getProperty: vi.fn(),
    };

    registerMockObject("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
    });

    registerMockObject("live_set/tracks/0/clip_slots/1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 0 },
    });

    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
    });

    const updatedClips: ClipResult[] = [];

    handleSessionSlotMove({
      clip: mockClip as unknown as LiveAPI,
      toSlot: { trackIndex: 0, sceneIndex: 1 },
      updatedClips,
      finalNoteCount: null,
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
      finalNoteCount: null,
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
      finalNoteCount: null,
      isNonSurvivor: false,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "toSlot ignored when arrangement parameters are specified",
    );
  });
});
