import { describe, expect, it } from "vitest";
import {
  liveApiId,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import { readTrack } from "./read-track.js";
import { mockTrackProperties } from "./read-track.test-helpers.js";

describe("readTrack", () => {
  describe("includeRoutings", () => {
    it("excludes routing properties by default", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          available_input_routing_channels: [
            '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
          ],
          available_input_routing_types: [
            '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
          ],
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
          ],
          input_routing_channel: [
            '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
          ],
          input_routing_type: [
            '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
        }),
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
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          available_input_routing_channels: [
            '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
          ],
          available_input_routing_types: [
            '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
          ],
          available_output_routing_channels: [
            '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
          ],
          available_output_routing_types: [
            '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
          ],
          input_routing_channel: [
            '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
          ],
          input_routing_type: [
            '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
          ],
          output_routing_channel: [
            '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
          ],
          output_routing_type: [
            '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
          ],
          current_monitoring_state: [1],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      expect(result.availableInputRoutingChannels).toEqual([
        { name: "In 1", inputId: "1" },
        { name: "In 2", inputId: "2" },
      ]);
      expect(result.availableInputRoutingTypes).toEqual([
        { name: "Ext. In", inputId: "17" },
        { name: "Resampling", inputId: "18" },
      ]);
      expect(result.availableOutputRoutingChannels).toEqual([
        { name: "Master", outputId: "26" },
        { name: "A", outputId: "27" },
      ]);
      expect(result.availableOutputRoutingTypes).toEqual([
        { name: "Track Out", outputId: "25" },
        { name: "Send Only", outputId: "28" },
      ]);
      expect(result.inputRoutingChannel).toEqual({
        name: "In 1",
        inputId: "1",
      });
      expect(result.inputRoutingType).toEqual({
        name: "Ext. In",
        inputId: "17",
      });
      expect(result.outputRoutingChannel).toEqual({
        name: "Master",
        outputId: "26",
      });
      expect(result.outputRoutingType).toEqual({
        name: "Track Out",
        outputId: "25",
      });
      expect(result.monitoringState).toBe("auto");
    });

    it("handles null routing properties gracefully", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          available_input_routing_channels: null,
          available_input_routing_types: null,
          available_output_routing_channels: null,
          available_output_routing_types: null,
          input_routing_channel: null,
          input_routing_type: null,
          output_routing_channel: null,
          output_routing_type: null,
          current_monitoring_state: [999],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      expect(result.availableInputRoutingChannels).toEqual([]);
      expect(result.availableInputRoutingTypes).toEqual([]);
      expect(result.availableOutputRoutingChannels).toEqual([]);
      expect(result.availableOutputRoutingTypes).toEqual([]);
      expect(result.inputRoutingChannel).toBeNull();
      expect(result.inputRoutingType).toBeNull();
      expect(result.outputRoutingChannel).toBeNull();
      expect(result.outputRoutingType).toBeNull();
      expect(result.monitoringState).toBe("unknown");
    });

    it("excludes input routing properties for group tracks when includeRoutings is true", () => {
      liveApiId.mockReturnValue("group1");
      mockLiveApiGet({
        Track: mockTrackProperties({
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
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      // Group tracks should omit input routing properties entirely
      expect(result.availableInputRoutingChannels).toBeUndefined();
      expect(result.availableInputRoutingTypes).toBeUndefined();
      expect(result.inputRoutingChannel).toBeUndefined();
      expect(result.inputRoutingType).toBeUndefined();

      // But should still have output routing properties
      expect(result.availableOutputRoutingChannels).toEqual([
        { name: "Master", outputId: "26" },
        { name: "A", outputId: "27" },
      ]);
      expect(result.availableOutputRoutingTypes).toEqual([
        { name: "Track Out", outputId: "25" },
        { name: "Send Only", outputId: "28" },
      ]);
      expect(result.outputRoutingChannel).toEqual({
        name: "Master",
        outputId: "26",
      });
      expect(result.outputRoutingType).toEqual({
        name: "Track Out",
        outputId: "25",
      });

      // Group track specific properties
      expect(result.isGroup).toBe(true);
      expect(result.isArmed).toBeUndefined();
      expect(result.monitoringState).toBeUndefined(); // Group tracks cannot be armed, so monitoring state is omitted
    });

    it("returns unknown monitoring state for unsupported values", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          current_monitoring_state: [999], // Invalid monitoring state value
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["all-routings"],
      });

      // Should return "unknown" for unsupported monitoring state values
      expect(result.monitoringState).toBe("unknown");

      // Other routing properties should still work
      expect(result.availableInputRoutingChannels).toEqual([]);
      expect(result.availableInputRoutingTypes).toEqual([]);
      expect(result.availableOutputRoutingChannels).toEqual([]);
      expect(result.availableOutputRoutingTypes).toEqual([]);
    });

    it("omits monitoring state for tracks that cannot be armed", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          can_be_armed: [0], // Track cannot be armed (group/master/return tracks)
          current_monitoring_state: [1], // This should not be accessed
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "rack-chains",
          "instruments",
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
