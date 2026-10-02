// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../../read-device.ts";
import { setupDrumPadMocks } from "./read-device-drum-mocks.ts";
import { setupBasicDeviceMock } from "../read-device-test-helpers.ts";

function setupKit(): void {
  setupDrumPadMocks({
    padIds: ["pad-36"],
    padProperties: {
      "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
    },
    chainProperties: { "chain-1": { name: "Layer 1", deviceIds: ["simpler"] } },
    deviceProperties: {
      simpler: { name: "Simpler", class_display_name: "Simpler" },
    },
  });
  registerMockObject("drum-rack-1", {
    properties: {
      name: "Drum Rack",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      is_active: 1,
      drum_pads: ["id", "pad-36"],
      chains: ["id", "chain-1"],
      return_chains: [],
    },
  });
  registerMockObject("simpler", {
    properties: {
      name: "Simpler",
      class_display_name: "Simpler",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: [],
      multi_sample_mode: 0,
      sample: ["id", "sample-1"],
    },
  });
  registerMockObject("sample-1", {
    path: "id sample-1",
    type: "Sample",
    properties: { file_path: "/kick.wav" },
  });
}

describe("readOneDevice on a Drum Rack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("returns pads with their layers for chains alone", () => {
    setupKit();

    const result = readOneDevice({
      id: "drum-rack-1",
      include: ["chains"],
      maxDepth: 1,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        drumPads: [
          expect.objectContaining({
            pitch: "C1",
            chains: [
              expect.objectContaining({
                name: "Layer 1",
                devices: [expect.objectContaining({ id: "simpler" })],
              }),
            ],
          }),
        ],
      }),
    );
    expect(result).toStrictEqual(
      readOneDevice({
        id: "drum-rack-1",
        include: ["drum-pads", "chains"],
        maxDepth: 1,
      }),
    );
  });

  it("returns each pad's sample when sample is included", () => {
    setupKit();

    const result = readOneDevice({
      id: "drum-rack-1",
      include: ["chains", "sample"],
      maxDepth: 1,
    });
    const pads = result.drumPads as { chains: { devices: unknown[] }[] }[];

    expect(pads[0]!.chains[0]!.devices[0]).toStrictEqual(
      expect.objectContaining({ sample: "/kick.wav" }),
    );
  });
});

describe("readOneDevice paramSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("turns params on by itself", () => {
    setupBasicDeviceMock();

    expect(
      readOneDevice({ id: "device-123", paramSearch: "vol" }),
    ).toHaveProperty("parameters");
  });
});
