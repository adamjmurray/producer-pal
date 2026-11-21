// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  liveVersion,
  registerFixedChainRack,
  registerLive12Rack,
} from "#src/tools/device/tests/helpers/fixed-chain-rack-fixtures.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { readDevice } from "../device-reader.ts";

const RACK_PATH = "live_set tracks 0 devices 0";

/**
 * The reads of `max_num_chains` a rack has answered.
 * @param rack - The registered rack mock
 * @returns How many times the property was read
 */
function limitReads(rack: ReturnType<typeof registerFixedChainRack>): number {
  return rack.get.mock.calls.filter(([name]) => name === "max_num_chains")
    .length;
}

describe("readDevice maxChains", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it.each([
    ["midSide", 2],
    ["multiband", 3],
  ] as const)("shows the limit of a Live 13 %s rack", (kind, limit) => {
    const rack = registerFixedChainRack(0, kind);

    rack.properties.class_display_name = "Audio Effect Rack";

    const result = readDevice(LiveAPI.from(RACK_PATH));

    expect(result.maxChains).toBe(limit);
    expect(limitReads(rack)).toBe(1);
  });

  it("shows it with no chains read", () => {
    registerFixedChainRack(0, "midSide");

    const result = readDevice(LiveAPI.from(RACK_PATH), {
      includeChains: false,
    });

    expect(result.maxChains).toBe(2);
    expect(result).not.toHaveProperty("chains");
  });

  it("leaves it out of an ordinary Live 13 rack", () => {
    const rack = registerFixedChainRack(0, "midSide");

    rack.properties.max_num_chains = 2147483647;

    expect(readDevice(LiveAPI.from(RACK_PATH))).not.toHaveProperty("maxChains");
    expect(limitReads(rack)).toBe(1);
  });

  it.each([1, [1]])(
    "leaves it out on Live 12, which answers %j, and never reads it",
    (answer) => {
      const rack = registerLive12Rack(0, 2, answer as number | [number]);

      Object.assign(rack.properties, {
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        class_display_name: "Audio Effect Rack",
      });

      expect(readDevice(LiveAPI.from(RACK_PATH))).not.toHaveProperty(
        "maxChains",
      );
      expect(limitReads(rack)).toBe(0);
    },
  );

  it("leaves it out on Live 13 when the property reads nothing", () => {
    const rack = registerFixedChainRack(0, "multiband");

    delete rack.properties.max_num_chains;

    expect(readDevice(LiveAPI.from(RACK_PATH))).not.toHaveProperty("maxChains");
  });

  it("reads no limit from a device that is not a rack", () => {
    liveVersion("13.0b25");

    const device = registerMockObject("device", {
      path: RACK_PATH,
      type: "Device",
      properties: {
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        class_display_name: "Reverb",
        name: "Reverb",
        can_have_chains: 0,
        can_have_drum_pads: 0,
        max_num_chains: 2,
      },
    });

    expect(readDevice(LiveAPI.from(RACK_PATH))).not.toHaveProperty("maxChains");
    expect(device.get.mock.calls.map(([name]) => name)).not.toContain(
      "max_num_chains",
    );
  });

  it("is not read for a walk that drops the rack, or for a drum rack", () => {
    const rack = registerFixedChainRack(0, "midSide");
    const device = LiveAPI.from(RACK_PATH);

    expect(readDevice(device, { chainsHidden: true })).not.toHaveProperty(
      "maxChains",
    );

    rack.properties.can_have_drum_pads = 1;
    rack.properties.type = LIVE_API_DEVICE_TYPE_INSTRUMENT;

    expect(readDevice(device)).not.toHaveProperty("maxChains");
    expect(limitReads(rack)).toBe(0);
  });
});
