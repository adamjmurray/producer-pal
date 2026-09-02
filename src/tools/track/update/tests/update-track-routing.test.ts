// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "../update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const routingProperties = {
  available_input_routing_types: [
    '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
  ],
  available_input_routing_channels: [
    '{"available_input_routing_channels": [{"display_name": "1", "identifier": 1}, {"display_name": "2", "identifier": 2}]}',
  ],
  available_output_routing_types: [
    '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Bass", "identifier": 30}, {"display_name": "Bass", "identifier": 31}]}',
  ],
  available_output_routing_channels: [
    '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
  ],
};

describe("updateTrack routing by name", () => {
  let track: RegisteredMockObject;

  beforeEach(() => {
    track = registerMockObject("123", {
      path: livePath.track(0),
      properties: routingProperties,
    });
  });

  it("resolves a display name to Live's identifier", () => {
    updateTrack({
      id: "123",
      inputRoutingType: "Resampling",
      inputRoutingChannel: "2",
      outputRoutingType: "Track Out",
      outputRoutingChannel: "Master",
    });

    expect(track.set).toHaveBeenCalledWith(
      "input_routing_type",
      '{"input_routing_type":{"identifier":18}}',
    );
    expect(track.set).toHaveBeenCalledWith(
      "input_routing_channel",
      '{"input_routing_channel":{"identifier":2}}',
    );
    expect(track.set).toHaveBeenCalledWith(
      "output_routing_type",
      '{"output_routing_type":{"identifier":25}}',
    );
    expect(track.set).toHaveBeenCalledWith(
      "output_routing_channel",
      '{"output_routing_channel":{"identifier":26}}',
    );
  });

  it("matches names case-insensitively and ignores surrounding space", () => {
    updateTrack({ id: "123", inputRoutingType: "  ext. in  " });

    expect(track.set).toHaveBeenCalledWith(
      "input_routing_type",
      '{"input_routing_type":{"identifier":17}}',
    );
  });

  it("still accepts a numeric identifier", () => {
    updateTrack({ id: "123", outputRoutingType: "30" });

    expect(track.set).toHaveBeenCalledWith(
      "output_routing_type",
      '{"output_routing_type":{"identifier":30}}',
    );
  });

  it("uses the first of several options sharing a name, and warns", () => {
    updateTrack({ id: "123", outputRoutingType: "Bass" });

    expect(track.set).toHaveBeenCalledWith(
      "output_routing_type",
      '{"output_routing_type":{"identifier":30}}',
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'track t0 has 2 output_routing_type options named "Bass"',
      ),
    );
  });

  it("warns and skips an unknown name", () => {
    updateTrack({ id: "123", outputRoutingType: "Nowhere" });

    expect(track.set).not.toHaveBeenCalledWith(
      "output_routing_type",
      expect.anything(),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('no output_routing_type named "Nowhere"'),
    );
  });

  it("falls back to the identifier when the available list is empty", () => {
    const bare = registerMockObject("456", { path: livePath.track(1) });

    updateTrack({ id: "456", outputRoutingType: "25" });

    expect(bare.set).toHaveBeenCalledWith(
      "output_routing_type",
      '{"output_routing_type":{"identifier":25}}',
    );
  });

  it("says none rather than an empty list when nothing is available", () => {
    registerMockObject("456", { path: livePath.track(1) });

    updateTrack({ id: "456", outputRoutingType: "Nowhere" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("available: none"),
    );
  });

  describe("deprecated *Id params", () => {
    it("still applies the routing", () => {
      updateTrack({
        id: "123",
        inputRoutingTypeId: "17",
        inputRoutingChannelId: "1",
        outputRoutingTypeId: "25",
        outputRoutingChannelId: "26",
      });

      expect(track.set).toHaveBeenCalledWith(
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(track.set).toHaveBeenCalledWith(
        "input_routing_channel",
        '{"input_routing_channel":{"identifier":1}}',
      );
      expect(track.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track.set).toHaveBeenCalledWith(
        "output_routing_channel",
        '{"output_routing_channel":{"identifier":26}}',
      );
    });

    it("loses to the new param when both are sent", () => {
      updateTrack({
        id: "123",
        outputRoutingType: "Track Out",
        outputRoutingTypeId: "30",
      });

      expect(track.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track.set).toHaveBeenCalledTimes(1);
    });
  });
});
