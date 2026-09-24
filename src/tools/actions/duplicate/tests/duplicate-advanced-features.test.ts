// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  type RegisteredMockObject,
  registerMockObject,
  registerSessionClipDuplication,
  registerTrackCopySet,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

describe("duplicate - routeToSource with duplicate track names", () => {
  it("should handle duplicate track names without crashing", async () => {
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
    registerNewTrack(2, [
      { display_name: "Master", identifier: "master_id" },
      { display_name: "Synth", identifier: "synth_1_id" },
      { display_name: "Synth", identifier: "synth_2_id" },
      { display_name: "Bass", identifier: "bass_id" },
    ]);

    // Test that the function doesn't crash with duplicate names
    const result = await duplicate({
      type: "track",
      id: "track2", // Duplicate second "Synth" track
      routeToSource: true,
    });

    expectTrackResult(
      result,
      'source track t1 (id track2): armed it, set its input to "No Input"',
    );
  });

  it("should handle unique track names without crashing (backward compatibility)", async () => {
    registerSourceTrackWithRouting("track1", livePath.track(0), "UniqueTrack");
    registerMockObject("live_set", { path: livePath.liveSet });

    registerNewTrack(1, [
      { display_name: "Master", identifier: "master_id" },
      { display_name: "UniqueTrack", identifier: "unique_track_id" },
    ]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    });

    expectTrackResult(
      result,
      'source track t0 (id track1): armed it, set its input to "No Input"',
    );
  });

  it("says on the copy's entry when the source name is not an output option", async () => {
    registerSourceTrackWithRouting(
      "track1",
      livePath.track(0),
      "NonExistentTrack",
    );
    registerMockObject("live_set", { path: livePath.liveSet });

    const newTrack = registerNewTrack(1, [
      { display_name: "Master", identifier: "master_id" },
      { display_name: "OtherTrack", identifier: "other_track_id" },
    ]);

    const result = (await duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    })) as { reason?: string };

    expect(result.reason).toContain(
      'not routed to the source: no output option named "NonExistentTrack"',
    );
    // The copy's entry carries it, so nothing warns about it.
    expect(capturedWarnings()).toStrictEqual([]);

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
  const selectMock = setupSelectMock();

  it("should select clip and show clip detail when duplicating to arrangement", async () => {
    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { length: 4 },
    });

    registerTrackWithArrangementDup(0);
    registerArrangementClip(0, 0, 0);

    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "1|1",
      focus: true,
    });

    expect(selectMock.get()).toHaveBeenCalledWith({
      id: livePath.track(0).arrangementClip(0),
      detailView: "clip",
    });
  });

  it("should select clip and show clip detail when duplicating to session", async () => {
    registerSessionClipDuplication({
      destClipProperties: { is_arrangement_clip: 0 },
    });

    await duplicate({
      type: "clip",
      id: "clip1",
      focus: true,
      toSlot: "0/1",
    });

    expect(selectMock.get()).toHaveBeenCalledWith({
      id: expect.any(String),
      detailView: "clip",
    });
  });

  it("should not call select when duplicating tracks", async () => {
    setupTrackForFocus();

    await duplicate({
      type: "track",
      id: "track1",
      focus: true,
    });

    expect(selectMock.get()).not.toHaveBeenCalled();
  });

  it("should select scene in session view when duplicating scenes", async () => {
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

    await duplicate({
      type: "scene",
      id: "scene1",
      focus: true,
    });

    expect(selectMock.get()).toHaveBeenCalledWith({
      view: "session",
      id: expect.any(String),
    });
  });

  it("should not call select when focus=false", async () => {
    setupTrackForFocus();

    await duplicate({
      type: "track",
      id: "track1",
      focus: false,
    });

    expect(selectMock.get()).not.toHaveBeenCalled();
  });

  it("should not call select for multiple track duplicates when focus=true", async () => {
    setupTrackForFocus();
    // Register second new track for count=2
    registerMockObject("live_set/tracks/2", {
      path: livePath.track(2),
      properties: { devices: [], clip_slots: [], arrangement_clips: [] },
    });

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      focus: true,
    });

    expect(selectMock.get()).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});

describe("duplicate - comma-separated names", () => {
  it("should assign different names to each track when comma-separated", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      name: "Lead,Pad",
    });

    // Each copy lands right after the source, so the one made last sits first.
    expect(tracks.get("copy-2")?.set).toHaveBeenCalledWith("name", "Lead");
    expect(tracks.get("copy-1")?.set).toHaveBeenCalledWith("name", "Pad");
    expect(result).toHaveLength(2);
  });

  it("should not set name for extras beyond the comma-separated list", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);

    await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      name: "Lead",
    });

    // Single name (no comma) applies to all
    expect(tracks.get("copy-1")?.set).toHaveBeenCalledWith("name", "Lead");
    expect(tracks.get("copy-2")?.set).toHaveBeenCalledWith("name", "Lead");
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
      input_routing_type: JSON.stringify({
        input_routing_type: { display_name: "All Ins" },
      }),
      arm: 0,
      available_input_routing_types: JSON.stringify({
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      }),
    },
  });
}

/**
 * Register a new (duplicated) track with standard empty properties.
 * @param trackIndex - Track index for the new track
 * @param outputRoutingTypes - The output routing options the track reports
 * @returns The registered mock object
 */
function registerNewTrack(
  trackIndex: number,
  outputRoutingTypes?: Array<{ display_name: string; identifier: string }>,
): RegisteredMockObject {
  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties: {
      devices: [],
      clip_slots: [],
      arrangement_clips: [],
      // Live hands routing lists back JSON-encoded, and getProperty parses
      // them; a bare array reads as no routing options at all.
      ...(outputRoutingTypes == null
        ? {}
        : {
            available_output_routing_types: JSON.stringify({
              available_output_routing_types: outputRoutingTypes,
            }),
          }),
    },
  });
}

/**
 * Assert the result matches the expected track duplication shape.
 * @param result - The duplicate() return value
 * @param reason - What the copy's entry should say beyond its own fields
 */
function expectTrackResult(result: unknown, reason: string): void {
  expect(result).toStrictEqual({
    path: expect.any(String),
    id: expect.any(String),
    clips: expect.any(Array),
    reason,
  });
}
