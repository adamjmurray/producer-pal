// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "./create-device.ts";

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

/**
 * Register a freshly-created Simpler at track 0 / device 2, plus track 0
 * itself with an `insert_device` method returning that Simpler's id.
 *
 * @returns The Simpler mock
 */
function registerSimplerCreationFixture(): RegisteredMockObject {
  const simpler = registerMockObject("simpler-new", {
    path: livePath.track(0).device(2),
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      parameters: children(),
    },
  });

  registerMockObject("track-0", {
    path: livePath.track(0),
    methods: { insert_device: () => ["id", "simpler-new"] },
  });

  return simpler;
}

describe("createDevice params", () => {
  describe("params after creation", () => {
    it("loads a sample on a created Simpler via params", () => {
      const simpler = registerSimplerCreationFixture();

      createDevice({
        deviceName: "Simpler",
        path: "t0",
        params: [{ name: "sample", value: "/tmp/kick.wav" }],
      });

      expect(simpler.call).toHaveBeenCalledWith(
        "replace_sample",
        "/tmp/kick.wav",
      );
    });

    it("prefixes param warnings with createDevice, not updateDevice", async () => {
      const mockConsole = await import("#src/shared/v8-max-console.ts");

      vi.mocked(mockConsole.warn).mockClear();

      registerSimplerCreationFixture();

      createDevice({
        deviceName: "Simpler",
        path: "t0",
        params: [{ name: "nonexistent", value: "42" }],
      });

      const calls = vi.mocked(mockConsole.warn).mock.calls.flat().join("\n");

      expect(calls).toMatch(/createDevice: param "nonexistent" not found/);
      expect(calls).not.toMatch(/updateDevice:/);
    });

    it("does not call replace_sample on a non-Simpler when sample is in params", () => {
      const eqEight = registerMockObject("eq-new", {
        path: livePath.track(0).device(2),
        type: "Device",
        properties: {
          class_display_name: "EQ Eight",
          parameters: children(),
        },
      });

      registerMockObject("track-0", {
        path: livePath.track(0),
        methods: { insert_device: () => ["id", "eq-new"] },
      });

      createDevice({
        deviceName: "EQ Eight",
        path: "t0",
        params: [{ name: "sample", value: "/tmp/kick.wav" }],
      });

      expect(eqEight.call).not.toHaveBeenCalledWith(
        "replace_sample",
        expect.anything(),
      );
    });
  });

  describe("drum kit builder (path-prefixed params)", () => {
    /**
     * Set up a fresh, empty Drum Rack created on track 0. Referencing a pad note
     * auto-creates its chain; the pad's first device slot auto-creates a Simpler
     * that records the sample it receives. The created Simpler ships with a
     * loaded sample child so a follow-up gainDb write has something to target.
     * @returns A map of created Simpler ids → their mocks, plus their sample children
     */
    function setupDrumKitFixture(): {
      simplers: Record<string, RegisteredMockObject>;
      samples: Record<string, RegisteredMockObject>;
    } {
      const simplers: Record<string, RegisteredMockObject> = {};
      const samples: Record<string, RegisteredMockObject> = {};
      const chainIdArray: string[] = [];

      registerMockObject("track-0", {
        path: livePath.track(0),
        properties: { devices: children() },
        methods: { insert_device: () => ["id", "drum-rack"] },
      });

      registerMockObject("drum-rack", {
        path: livePath.track(0).device(0),
        type: "RackDevice",
        properties: { chains: chainIdArray, can_have_drum_pads: 1 },
        methods: {
          insert_chain: () => {
            const newId = `chain-${chainIdArray.length / 2}`;

            chainIdArray.push("id", newId);
            const props: Record<string, unknown> = { in_note: -1, devices: [] };
            const chainMock = registerMockObject(newId, {
              type: "DrumChain",
              properties: props,
              methods: {
                insert_device: () => {
                  const simplerId = `${newId}-simpler`;
                  const sampleId = `${simplerId}-sample`;

                  (props.devices as unknown[]).push("id", simplerId);
                  simplers[simplerId] = registerMockObject(simplerId, {
                    type: "SimplerDevice",
                    properties: {
                      class_display_name: "Simpler",
                      multi_sample_mode: 0,
                      parameters: children(),
                      sample: ["id", sampleId],
                    },
                  });
                  samples[sampleId] = registerMockObject(sampleId, {
                    type: "Sample",
                    properties: { file_path: "/loaded.wav", gain: 1 },
                  });

                  return ["id", simplerId];
                },
              },
            });

            chainMock.set.mockImplementation((prop: string, value: unknown) => {
              props[prop] = value;
            });

            return ["id", newId];
          },
        },
      });

      return { simplers, samples };
    }

    it("builds a full kit in one call (chain + Simpler auto-create per pad)", () => {
      const { simplers } = setupDrumKitFixture();

      const result = createDevice({
        deviceName: "Drum Rack",
        path: "t0",
        params: [
          { name: "pC1/d0/sample", value: "/kick.wav" },
          { name: "pC#1/d0/sample", value: "/snare.wav" },
        ],
      });

      expect(result).toMatchObject({ id: "drum-rack" });
      expect(simplers["chain-0-simpler"]!.call).toHaveBeenCalledWith(
        "replace_sample",
        "/kick.wav",
      );
      expect(simplers["chain-1-simpler"]!.call).toHaveBeenCalledWith(
        "replace_sample",
        "/snare.wav",
      );
    });

    it("sets a pad's gainDb after its sample in the same call", () => {
      const { simplers, samples } = setupDrumKitFixture();

      createDevice({
        deviceName: "Drum Rack",
        path: "t0",
        params: [
          { name: "pC1/d0/sample", value: "/kick.wav" },
          { name: "pC1/d0/gainDb", value: "-6" },
        ],
      });

      expect(simplers["chain-0-simpler"]!.call).toHaveBeenCalledWith(
        "replace_sample",
        "/kick.wav",
      );
      // gainDb resolves to the now-existing Simpler and sets its sample's gain.
      expect(samples["chain-0-simpler-sample"]!.set).toHaveBeenCalledWith(
        "gain",
        expect.any(Number),
      );
    });
  });
});
