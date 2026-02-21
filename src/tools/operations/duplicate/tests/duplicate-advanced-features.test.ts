// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import {
  children,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

let appView: RegisteredMockObject;

describe("duplicate - routeToSource with duplicate track names", () => {
  it("should handle duplicate track names without crashing", () => {
    registerMockObject("track2", {
      path: livePath.track(1),
      properties: {
        name: "Synth",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
    });

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
    registerMockObject("live_set/tracks/2", {
      path: livePath.track(2),
      properties: {
        devices: [],
        clip_slots: [],
        arrangement_clips: [],
        available_output_routing_types: [
          { display_name: "Master", identifier: "master_id" },
          { display_name: "Synth", identifier: "synth_1_id" },
          { display_name: "Synth", identifier: "synth_2_id" },
          { display_name: "Bass", identifier: "bass_id" },
        ],
      },
    });

    // Test that the function doesn't crash with duplicate names
    const result = duplicate({
      type: "track",
      id: "track2", // Duplicate second "Synth" track
      routeToSource: true,
    });

    // Just verify it completed without crashing
    expect(result).toMatchObject({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: expect.any(Array),
    });
  });

  it("should handle unique track names without crashing (backward compatibility)", () => {
    registerMockObject("track1", {
      path: livePath.track(0),
      properties: {
        name: "UniqueTrack",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
    });

    registerMockObject("live_set", { path: livePath.liveSet });

    registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: {
        devices: [],
        clip_slots: [],
        arrangement_clips: [],
        available_output_routing_types: [
          { display_name: "Master", identifier: "master_id" },
          { display_name: "UniqueTrack", identifier: "unique_track_id" },
        ],
      },
    });

    // Test that the function doesn't crash with unique names
    const result = duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    });

    // Just verify it completed without crashing
    expect(result).toMatchObject({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: expect.any(Array),
    });
  });

  it("should warn when track is not found in routing options", () => {
    registerMockObject("track1", {
      path: livePath.track(0),
      properties: {
        name: "NonExistentTrack",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
    });

    registerMockObject("live_set", { path: livePath.liveSet });

    const newTrack = registerMockObject("live_set/tracks/1", {
      path: livePath.track(1),
      properties: {
        devices: [],
        clip_slots: [],
        arrangement_clips: [],
        available_output_routing_types: [
          { display_name: "Master", identifier: "master_id" },
          { display_name: "OtherTrack", identifier: "other_track_id" },
        ],
      },
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

describe("duplicate - switchView functionality", () => {
  beforeEach(() => {
    appView = registerMockObject("app-view", {
      path: livePath.view.app,
    });
  });

  it("should switch to arrangement view when duplicating to arrangement destination", () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { length: 4 },
    });

    registerMockObject("live_set/tracks/0", {
      path: livePath.track(0),
      methods: {
        duplicate_clip_to_arrangement: () => [
          "id",
          livePath.track(0).arrangementClip(0),
        ],
      },
    });

    registerMockObject("live_set tracks 0 arrangement_clips 0", {
      path: livePath.track(0).arrangementClip(0),
      properties: { is_arrangement_clip: 1, start_time: 0 },
    });

    duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "1|1",
      switchView: true,
    });

    expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
  });

  it("should switch to session view when duplicating to session destination", () => {
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
      destination: "session",
      switchView: true,
      toSlot: "0/1",
    });

    expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
  });

  it("should switch to session view when duplicating tracks", () => {
    setupTrackForSwitchView();

    duplicate({
      type: "track",
      id: "track1",
      switchView: true,
    });

    expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
  });

  it("should switch to session view when duplicating scenes", () => {
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
      switchView: true,
    });

    expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
  });

  it("should not switch views when switchView=false", () => {
    setupTrackForSwitchView();

    duplicate({
      type: "track",
      id: "track1",
      switchView: false,
    });

    expect(appView.call).not.toHaveBeenCalledWith(
      "show_view",
      expect.anything(),
    );
  });

  it("should work with multiple duplicates when switchView=true", () => {
    setupTrackForSwitchView();
    // Register second new track for count=2
    registerMockObject("live_set/tracks/2", {
      path: livePath.track(2),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      count: 2,
      switchView: true,
    });

    expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
    expect(result).toHaveLength(2);
  });
});

/**
 * Helper to set up common mocks for track switchView tests
 * @returns The new track mock object handle
 */
function setupTrackForSwitchView(): RegisteredMockObject {
  registerMockObject("track1", { path: livePath.track(0) });
  registerMockObject("live_set", { path: livePath.liveSet });

  return registerMockObject("live_set/tracks/1", {
    path: livePath.track(1),
    properties: { devices: [], clip_slots: [], arrangement_clips: [] },
  });
}
