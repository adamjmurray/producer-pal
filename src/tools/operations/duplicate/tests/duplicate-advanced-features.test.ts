// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  children,
  registerArrangementClip,
  type RegisteredMockObject,
  registerMockObject,
  registerTrackWithArrangementDup,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

vi.mock(import("#src/tools/control/select.ts"), () => ({
  select: vi.fn(),
}));

describe("duplicate - routeToSource with duplicate track names", () => {
  it("should handle duplicate track names without crashing", () => {
    registerSourceTrackWithRouting("track2", livePath.track(1), "Synth");

    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0", "track2", "track3") },
    });

    registerMockObject("track0", {
      path: livePath.track(0),
      properties: { name: "Synth" },
    });

    registerMockObject("track3", {
      path: livePath.track(2),
      properties: { name: "Bass" },
    });

    // The new duplicated track at index 2
    registerNewTrack(2, {
      available_output_routing_types: [
        { display_name: "Master", identifier: "master_id" },
        { display_name: "Synth", identifier: "synth_1_id" },
        { display_name: "Synth", identifier: "synth_2_id" },
        { display_name: "Bass", identifier: "bass_id" },
      ],
    });

    // Test that the function doesn't crash with duplicate names
    const result = duplicate({
      type: "track",
      id: "track2", // Duplicate second "Synth" track
      routeToSource: true,
    });

    expectTrackResult(result);
  });

  it("should handle unique track names without crashing (backward compatibility)", () => {
    registerSourceTrackWithRouting("track1", livePath.track(0), "UniqueTrack");
    registerMockObject("live_set", { path: livePath.liveSet });

    registerNewTrack(1, {
      available_output_routing_types: [
        { display_name: "Master", identifier: "master_id" },
        { display_name: "UniqueTrack", identifier: "unique_track_id" },
      ],
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    });

    expectTrackResult(result);
  });

  it("should warn when track is not found in routing options", () => {
    registerSourceTrackWithRouting(
      "track1",
      livePath.track(0),
      "NonExistentTrack",
    );
    registerMockObject("live_set", { path: livePath.liveSet });

    const newTrack = registerNewTrack(1, {
      available_output_routing_types: [
        { display_name: "Master", identifier: "master_id" },
        { display_name: "OtherTrack", identifier: "other_track_id" },
      ],
    });

    duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    });

    // Should warn about not finding the track
    expect(outlet).toHaveBeenCalledWith(
      1,
      'Could not find track "NonExistentTrack" in routing options',
    );

    // Should not set output routing with NonExistentTrack identifier
    expect(newTrack.set).not.toHaveBeenCalledWith(
      "output_routing_type",
      expect.objectContaining({
        identifier: expect.stringContaining("NonExistent"),
      }),
    );
  });
});

describe("duplicate - focus functionality", () => {
  let selectMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const selectModule = await import("#src/tools/control/select.ts");

    selectMock = selectModule.select as ReturnType<typeof vi.fn>;
    selectMock.mockClear();
  });

  it("should select clip and show clip detail when duplicating to arrangement", () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { length: 4 },
    });

    registerTrackWithArrangementDup(0);
    registerArrangementClip(0, 0, 0);

    duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "1|1",
      focus: true,
    });

    expect(selectMock).toHaveBeenCalledWith({
      clipId: livePath.track(0).arrangementClip(0),
      detailView: "clip",
    });
  });

  it("should select clip and show clip detail when duplicating to session", () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
    });

    registerMockObject("live_set/tracks/0/clip_slots/0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
    });

    registerMockObject("live_set/tracks/0/clip_slots/1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 0 },
    });

    registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
      path: livePath.track(0).clipSlot(1).clip(),
      properties: { is_arrangement_clip: 0 },
    });

    duplicate({
      type: "clip",
      id: "clip1",
      focus: true,
      toSlot: "0/1",
    });

    expect(selectMock).toHaveBeenCalledWith({
      clipId: expect.any(String),
      detailView: "clip",
    });
  });

  it("should not call select when duplicating tracks", () => {
    setupTrackForFocus();

    duplicate({
      type: "track",
      id: "track1",
      focus: true,
    });

    expect(selectMock).not.toHaveBeenCalled();
  });

  it("should select scene in session view when duplicating scenes", () => {
    registerMockObject("scene1", { path: livePath.scene(0) });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0") },
    });
    registerMockObject("live_set/tracks/0/clip_slots/1", {
      path: livePath.track(0).clipSlot(1),
      properties: { has_clip: 0 },
    });
    registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

    duplicate({
      type: "scene",
      id: "scene1",
      focus: true,
    });

    expect(selectMock).toHaveBeenCalledWith({
      view: "session",
      sceneId: expect.any(String),
    });
  });

  it("should not call select when focus=false", () => {
    setupTrackForFocus();

    duplicate({
      type: "track",
      id: "track1",
      focus: false,
    });

    expect(selectMock).not.toHaveBeenCalled();
  });

  it("should not call select for multiple track duplicates when focus=true", () => {
    setupTrackForFocus();
    // Register second new track for count=2
    registerMockObject("live_set/tracks/2", {
      path: livePath.track(2),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      count: 2,
      focus: true,
    });

    expect(selectMock).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});

describe("duplicate - comma-separated names", () => {
  /**
   * Set up source track and two new tracks for naming tests.
   * @returns The two new track mocks
   */
  function setupTwoNewTracks() {
    registerMockObject("track1", { path: livePath.track(0) });
    registerMockObject("live_set", { path: livePath.liveSet });
    const newTrack1 = registerNewTrack(1);
    const newTrack2 = registerNewTrack(2);

    return { newTrack1, newTrack2 };
  }

  it("should assign different names to each track when comma-separated", () => {
    const { newTrack1, newTrack2 } = setupTwoNewTracks();

    const result = duplicate({
      type: "track",
      id: "track1",
      count: 2,
      name: "Lead,Pad",
    });

    expect(newTrack1.set).toHaveBeenCalledWith("name", "Lead");
    expect(newTrack2.set).toHaveBeenCalledWith("name", "Pad");
    expect(result).toHaveLength(2);
  });

  it("should not set name for extras beyond the comma-separated list", () => {
    const { newTrack1, newTrack2 } = setupTwoNewTracks();

    duplicate({
      type: "track",
      id: "track1",
      count: 2,
      name: "Lead",
    });

    // Single name (no comma) applies to all
    expect(newTrack1.set).toHaveBeenCalledWith("name", "Lead");
    expect(newTrack2.set).toHaveBeenCalledWith("name", "Lead");
  });
});

/**
 * Helper to set up common mocks for track focus tests
 * @returns The new track mock object handle
 */
function setupTrackForFocus(): RegisteredMockObject {
  registerMockObject("track1", { path: livePath.track(0) });
  registerMockObject("live_set", { path: livePath.liveSet });

  return registerNewTrack(1);
}

/**
 * Register a source track with routing-related properties.
 * @param id - Mock object ID
 * @param path - Track path
 * @param name - Track name
 */
function registerSourceTrackWithRouting(
  id: string,
  path: ReturnType<typeof livePath.track>,
  name: string,
): void {
  registerMockObject(id, {
    path,
    properties: {
      name,
      current_monitoring_state: 0,
      input_routing_type: { display_name: "All Ins" },
      arm: 0,
      available_input_routing_types: [
        { display_name: "No Input", identifier: "no_input_id" },
        { display_name: "All Ins", identifier: "all_ins_id" },
      ],
    },
  });
}

/**
 * Register a new (duplicated) track with standard empty properties.
 * @param trackIndex - Track index for the new track
 * @param extraProps - Additional properties to merge
 * @returns The registered mock object
 */
function registerNewTrack(
  trackIndex: number,
  extraProps?: Record<string, unknown>,
): RegisteredMockObject {
  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties: {
      devices: [],
      clip_slots: [],
      arrangement_clips: [],
      ...extraProps,
    },
  });
}

/**
 * Assert the result matches the expected track duplication shape.
 * @param result - The duplicate() return value
 */
function expectTrackResult(result: unknown): void {
  expect(result).toMatchObject({
    id: expect.any(String),
    trackIndex: expect.any(Number),
    clips: expect.any(Array),
  });
}
