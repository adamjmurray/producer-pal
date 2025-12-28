import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { readLiveSet } from "../read-live-set.js";

describe("readLiveSet - routing", () => {
  it("includes routing information in tracks when includeRoutings is true", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }
      if (this._path === "live_set tracks 0") {
        return "track1";
      }
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Routing Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        available_input_routing_channels: [
          '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}]}',
        ],
        available_input_routing_types: [
          '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}]}',
        ],
        available_output_routing_channels: [
          '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}',
        ],
        available_output_routing_types: [
          '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
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
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "chains", "routings"],
    });

    expect(result.tracks[0]).toEqual(
      expect.objectContaining({
        name: "Test Track",
        inputRoutingChannel: { name: "In 1", inputId: "1" },
        inputRoutingType: { name: "Ext. In", inputId: "17" },
        outputRoutingChannel: { name: "Master", outputId: "26" },
        outputRoutingType: { name: "Track Out", outputId: "25" },
        monitoringState: "auto",
      }),
    );

    // Verify that available routing properties are NOT included (read-live-set doesn't support them)
    expect(result.tracks[0]).not.toHaveProperty(
      "availableInputRoutingChannels",
    );
    expect(result.tracks[0]).not.toHaveProperty("availableInputRoutingTypes");
    expect(result.tracks[0]).not.toHaveProperty(
      "availableOutputRoutingChannels",
    );
    expect(result.tracks[0]).not.toHaveProperty("availableOutputRoutingTypes");
  });

  it("excludes routing information from tracks when includeRoutings is false", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }
      if (this._path === "live_set tracks 0") {
        return "track1";
      }
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Routing Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "chains"],
    });

    expect(result.tracks[0]).toEqual(
      expect.objectContaining({
        name: "Test Track",
      }),
    );
    // Verify routing properties are not present
    expect(result.tracks[0].availableInputRoutingChannels).toBeUndefined();
    expect(result.tracks[0].availableInputRoutingTypes).toBeUndefined();
    expect(result.tracks[0].availableOutputRoutingChannels).toBeUndefined();
    expect(result.tracks[0].availableOutputRoutingTypes).toBeUndefined();
    expect(result.tracks[0].inputRoutingChannel).toBeUndefined();
    expect(result.tracks[0].inputRoutingType).toBeUndefined();
    expect(result.tracks[0].outputRoutingChannel).toBeUndefined();
    expect(result.tracks[0].outputRoutingType).toBeUndefined();
    expect(result.tracks[0].monitoringState).toBeUndefined();
  });
});
