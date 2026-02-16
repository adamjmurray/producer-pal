// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children, expectedClip } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { mockTrackProperties } from "../helpers/read-track-test-helpers.ts";
import { setupTrackPathMappedMocks } from "../helpers/read-track-path-mapped-test-helpers.ts";
import { readTrack } from "../read-track.ts";

function createSoloedMidiTrackProperties(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    has_midi_input: 1,
    name: "Track 1",
    color: 16711680, // Red
    mute: 0,
    solo: 1,
    arm: 1,
    can_be_armed: 1,
    playing_slot_index: 2,
    fired_slot_index: 3,
    clip_slots: [],
    devices: [],
    ...overrides,
  };
}

function mockThisDeviceOnTrack1(): void {
  registerMockObject("this_device", {
    path: "this_device",
    returnPath: String(livePath.track(1).device(0)),
    type: "Device",
  });
}

function registerTrackWithSessionSlots(name: string): void {
  registerMockObject("track3", {
    path: livePath.track(2),
    type: "Track",
    properties: {
      has_midi_input: 1,
      name,
      color: 255, // Blue
      mute: 0,
      solo: 0,
      arm: 0,
      playing_slot_index: 0,
      fired_slot_index: -1,
      back_to_arranger: 1,
      clip_slots: children("slot1", "slot2", "slot3"),
      devices: [],
    },
  });
}

function registerSessionClipMocksForTrack2(): void {
  registerMockObject("clip1", {
    path: livePath.track(2).clipSlot(0).clip(),
  });
  registerMockObject("0", {
    path: livePath.track(2).clipSlot(1).clip(),
    type: "Clip",
  });
  registerMockObject("clip2", {
    path: livePath.track(2).clipSlot(2).clip(),
  });
}

describe("readTrack", () => {
  it("throws when the track does not exist", () => {
    registerMockObject("0", { path: livePath.track(99), type: "Track" });

    expect(() => readTrack({ trackIndex: 99 })).toThrow(
      "readTrack: trackIndex 99 does not exist",
    );
  });

  it("returns track information for MIDI tracks", () => {
    setupTrackPathMappedMocks({
      trackId: "track1",
      objects: {
        Track: createSoloedMidiTrackProperties(),
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toStrictEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      state: "soloed",
      isArmed: true,
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("returns track information for audio tracks", () => {
    setupTrackPathMappedMocks({
      trackPath: String(livePath.track(1)),
      trackId: "track2",
      objects: {
        Track: {
          has_midi_input: 0,
          name: "Audio Track",
          color: 65280, // Green
          mute: 1,
          solo: 0,
          arm: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          clip_slots: [],
          devices: [],
        },
      },
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result).toStrictEqual({
      id: "track2",
      type: "audio",
      name: "Audio Track",
      trackIndex: 1,
      state: "muted",
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("returns track group information", () => {
    setupTrackPathMappedMocks({
      trackId: "track1",
      objects: {
        Track: createSoloedMidiTrackProperties({
          can_be_armed: 0, // Group tracks can't be armed
          is_foldable: 1,
          is_grouped: 1,
          group_track: ["id", 456],
        }),
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toStrictEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      state: "soloed",
      isGroup: true,
      isGroupMember: true,
      groupId: "456",
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("should detect Producer Pal host track", () => {
    mockThisDeviceOnTrack1();

    registerMockObject("track1", {
      path: livePath.track(1),
      type: "Track",
      properties: mockTrackProperties(),
    });
    registerMockObject("track0", {
      path: livePath.track(0),
      type: "Track",
      properties: mockTrackProperties(),
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result.hasProducerPalDevice).toBe(true);

    const result2 = readTrack({ trackIndex: 0 });

    expect(result2.hasProducerPalDevice).toBeUndefined();
  });

  it("should omit instrument property when null for Producer Pal host track", () => {
    mockThisDeviceOnTrack1();

    registerMockObject("track1", {
      path: livePath.track(1),
      type: "Track",
      properties: mockTrackProperties({
        devices: [], // No devices means instrument will be null
      }),
    });
    registerMockObject("track0", {
      path: livePath.track(0),
      type: "Track",
      properties: mockTrackProperties({
        devices: [],
      }),
    });

    // Producer Pal host track with null instrument - should omit the property
    const hostResult = readTrack({ trackIndex: 1 });

    expect(hostResult.hasProducerPalDevice).toBe(true);
    expect(hostResult).not.toHaveProperty("instrument");

    // Regular track with null instrument - should include the property
    const regularResult = readTrack({ trackIndex: 0 });

    expect(regularResult.hasProducerPalDevice).toBeUndefined();
    expect(regularResult).toHaveProperty("instrument");
    expect(regularResult.instrument).toBe(null);
  });

  it("returns sessionClips information when the track has clips in Session view", () => {
    registerTrackWithSessionSlots("Track with Clips");
    registerSessionClipMocksForTrack2();

    const result = readTrack({ trackIndex: 2 });

    expect(result).toStrictEqual({
      id: "track3",
      type: "midi",
      name: "Track with Clips",
      trackIndex: 2,
      playingSlotIndex: 0,
      arrangementClips: [],
      sessionClips: [
        {
          ...expectedClip({ id: "clip1", trackIndex: 2, sceneIndex: 0 }),
          color: undefined,
        },
        {
          ...expectedClip({ id: "clip2", trackIndex: 2, sceneIndex: 2 }),
          color: undefined,
        },
      ].map(({ color: _color, ...clip }) => clip),
      instrument: null,
    });
  });

  it("returns arrangementClips when the track has clips in Arrangement view", () => {
    registerMockObject("track3", {
      path: livePath.track(2),
      type: "Track",
      properties: {
        has_midi_input: 1,
        name: "Track with Arrangement Clips",
        color: 255,
        clip_slots: children("slot1", "slot2", "slot3"),
        arrangement_clips: children("arr_clip1", "arr_clip2"),
        devices: [],
      },
    });
    registerMockObject("arr_clip1", {
      path: livePath.track(2).arrangementClip(0),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
      },
    });
    registerMockObject("arr_clip2", {
      path: livePath.track(2).arrangementClip(1),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
      },
    });

    const result = readTrack({ trackIndex: 2 });

    const arrangementClips = result.arrangementClips as Array<{ id: string }>;

    expect(arrangementClips).toHaveLength(2);
    expect(arrangementClips[0]!.id).toBe("arr_clip1");
    expect(arrangementClips[1]!.id).toBe("arr_clip2");
  });

  it("returns session clip count when includeSessionClips is false", () => {
    registerTrackWithSessionSlots("Track with Clips");
    registerSessionClipMocksForTrack2();

    const result = readTrack({
      trackIndex: 2,
      include: ["clip-notes", "chains", "instruments"],
    });

    // Since clips exist at slots 0 and 2, we should get a count of 2
    expect(result.sessionClipCount).toBe(2);
  });

  it("returns arrangement clip count when includeArrangementClips is false", () => {
    registerMockObject("track3", {
      path: livePath.track(2),
      type: "Track",
      properties: {
        has_midi_input: 1,
        name: "Track with Arrangement Clips",
        color: 255,
        clip_slots: [],
        arrangement_clips: children("arr_clip1", "arr_clip2"),
        devices: [],
      },
    });

    const result = readTrack({
      trackIndex: 2,
      include: ["clip-notes", "chains", "instruments"],
    });

    expect(result.arrangementClipCount).toBe(2);
  });

  it("returns arrangement clip count when includeArrangementClips is false (additional test)", () => {
    registerMockObject("track2", {
      path: livePath.track(1),
      type: "Track",
      properties: {
        has_midi_input: 1,
        name: "Arrangement ID Test Track",
        color: 255,
        clip_slots: [],
        arrangement_clips: children("arr_clip3", "arr_clip4", "arr_clip5"),
        devices: [],
      },
    });

    // Call with includeArrangementClips explicitly false to get count
    const result = readTrack({
      trackIndex: 1,
      include: ["clip-notes", "chains", "instruments"], // excludes "arrangement-clips"
    });

    // Verify that we get a count instead of clip details
    expect(result.arrangementClipCount).toBe(3);

    // Verify consistency with track ID format
    expect(result.id).toBe("track2");
  });
});
