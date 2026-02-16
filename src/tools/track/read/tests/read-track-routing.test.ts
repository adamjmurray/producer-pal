// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createRoutingMockProperties } from "../helpers/read-track-test-helpers.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

function expectStandardOutputRouting(result: Record<string, unknown>): void {
  expect(result.availableOutputRoutingChannels).toStrictEqual([
    { name: "Master", outputId: "26" },
    { name: "A", outputId: "27" },
  ]);
  expect(result.availableOutputRoutingTypes).toStrictEqual([
    { name: "Track Out", outputId: "25" },
    { name: "Send Only", outputId: "28" },
  ]);
}

describe("readTrack", () => {
  describe("includeRoutings", () => {
    it("excludes routing properties by default", () => {
      setupTrackMock({
        trackId: "track1",
        properties: createRoutingMockProperties(),
      });

      const result = readTrack({ trackIndex: 0 });

      expect(result.availableInputRoutingChannels).toBeUndefined();
      expect(result.availableInputRoutingTypes).toBeUndefined();
      expect(result.availableOutputRoutingChannels).toBeUndefined();
      expect(result.availableOutputRoutingTypes).toBeUndefined();
      expect(result.inputRoutingChannel).toBeUndefined();
      expect(result.inputRoutingType).toBeUndefined();
      expect(result.outputRoutingChannel).toBeUndefined();
      expect(result.outputRoutingType).toBeUndefined();
    });

    it("includes routing properties when includeRoutings is true", () => {
      setupTrackMock({
        trackId: "track1",
        properties: createRoutingMockProperties({
          current_monitoring_state: [1],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["routings", "available-routings"],
      });

      expect(result.availableInputRoutingChannels).toStrictEqual([
        { name: "In 1", inputId: "1" },
        { name: "In 2", inputId: "2" },
      ]);
      expect(result.availableInputRoutingTypes).toStrictEqual([
        { name: "Ext. In", inputId: "17" },
        { name: "Resampling", inputId: "18" },
      ]);
      expectStandardOutputRouting(result);
      expect(result.inputRoutingChannel).toStrictEqual({
        name: "In 1",
        inputId: "1",
      });
      expect(result.inputRoutingType).toStrictEqual({
        name: "Ext. In",
        inputId: "17",
      });
      expect(result.outputRoutingChannel).toStrictEqual({
        name: "Master",
        outputId: "26",
      });
      expect(result.outputRoutingType).toStrictEqual({
        name: "Track Out",
        outputId: "25",
      });
      expect(result.monitoringState).toBe("auto");
    });

    it("handles null routing properties gracefully", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          available_input_routing_channels: null,
          available_input_routing_types: null,
          available_output_routing_channels: null,
          available_output_routing_types: null,
          input_routing_channel: null,
          input_routing_type: null,
          output_routing_channel: null,
          output_routing_type: null,
          current_monitoring_state: [999],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["routings", "available-routings"],
      });

      expect(result.availableInputRoutingChannels).toStrictEqual([]);
      expect(result.availableInputRoutingTypes).toStrictEqual([]);
      expect(result.availableOutputRoutingChannels).toStrictEqual([]);
      expect(result.availableOutputRoutingTypes).toStrictEqual([]);
      expect(result.inputRoutingChannel).toBeNull();
      expect(result.inputRoutingType).toBeNull();
      expect(result.outputRoutingChannel).toBeNull();
      expect(result.outputRoutingType).toBeNull();
      expect(result.monitoringState).toBe("unknown");
    });

    it("excludes input routing properties for group tracks when includeRoutings is true", () => {
      setupTrackMock({
        trackId: "group1",
        properties: {
          is_foldable: 1, // This makes it a group track
          can_be_armed: 0, // Group tracks can't be armed
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
          current_monitoring_state: [1],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["routings", "available-routings"],
      });

      // Group tracks should omit input routing properties entirely
      expect(result.availableInputRoutingChannels).toBeUndefined();
      expect(result.availableInputRoutingTypes).toBeUndefined();
      expect(result.inputRoutingChannel).toBeUndefined();
      expect(result.inputRoutingType).toBeUndefined();

      // But should still have output routing properties
      expectStandardOutputRouting(result);
      expect(result.outputRoutingChannel).toStrictEqual({
        name: "Master",
        outputId: "26",
      });
      expect(result.outputRoutingType).toStrictEqual({
        name: "Track Out",
        outputId: "25",
      });

      // Group track specific properties
      expect(result.isGroup).toBe(true);
      expect(result.isArmed).toBeUndefined();
      expect(result.monitoringState).toBeUndefined(); // Group tracks cannot be armed, so monitoring state is omitted
    });

    it("returns unknown monitoring state for unsupported values", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          current_monitoring_state: [999], // Invalid monitoring state value
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["routings", "available-routings"],
      });

      // Should return "unknown" for unsupported monitoring state values
      expect(result.monitoringState).toBe("unknown");

      // Other routing properties should still work
      expect(result.availableInputRoutingChannels).toStrictEqual([]);
      expect(result.availableInputRoutingTypes).toStrictEqual([]);
      expect(result.availableOutputRoutingChannels).toStrictEqual([]);
      expect(result.availableOutputRoutingTypes).toStrictEqual([]);
    });

    it("omits monitoring state for tracks that cannot be armed", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          can_be_armed: 0, // Track cannot be armed (group/master/return tracks)
          current_monitoring_state: 1, // This should not be accessed
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "devices",
          "session-clips",
          "arrangement-clips",
          "routings",
        ],
      });

      // Should omit monitoringState property without accessing current_monitoring_state
      expect(result.monitoringState).toBeUndefined();
      expect(result.isArmed).toBeUndefined();
    });
  });
});
