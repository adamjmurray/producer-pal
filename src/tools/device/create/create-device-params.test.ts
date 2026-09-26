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

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
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

/**
 * Register a freshly-created device at track 0 / device 2 holding a Threshold
 * param that displays -60 to 0 dB, plus the track that inserts it.
 * @returns The track and the Threshold param mocks
 */
function registerThresholdDevice(): {
  track: RegisteredMockObject;
  threshold: RegisteredMockObject;
} {
  const track = registerMockObject("track-0", {
    path: livePath.track(0),
    methods: { insert_device: () => ["id", "comp-new"] },
  });

  registerMockObject("comp-new", {
    path: livePath.track(0).device(2),
    type: "Device",
    properties: { parameters: children("threshold") },
  });

  const threshold = registerMockObject("threshold", {
    properties: {
      name: "Threshold",
      original_name: "Threshold",
      is_quantized: 0,
      value: 0,
      min: 0,
      max: 1,
    },
    methods: {
      str_for_value: (v: unknown) => `${Math.round(Number(v) * 60) - 60} dB`,
    },
  });

  return { track, threshold };
}

describe("createDevice params", () => {
  describe("params after creation", () => {
    it("loads a sample on a created Simpler via params", async () => {
      const simpler = registerSimplerCreationFixture();

      await createDevice({
        device: "Simpler",
        path: "t0",
        params: [{ name: "sample", value: "/tmp/kick.wav" }],
      });

      expect(simpler.call).toHaveBeenCalledWith(
        "replace_sample",
        "/tmp/kick.wav",
      );
    });

    it("reports what each written param reads as after creation", async () => {
      registerThresholdDevice();

      const result = await createDevice({
        device: "Compressor",
        path: "t0",
        params: [{ name: "Threshold", value: "-20 dB" }],
      });

      expect(result).toStrictEqual({
        id: "comp-new",
        path: "t0/d2",
        params: [{ id: "threshold", name: "Threshold", value: -20 }],
      });
    });

    it("reports no params when the list is empty", async () => {
      registerThresholdDevice();

      expect(
        await createDevice({
          device: "Compressor",
          path: "t0",
          params: [],
        }),
      ).toStrictEqual({ id: "comp-new", path: "t0/d2" });
    });

    it("reports a param that names nothing on the new device", async () => {
      const mockConsole = await import("#src/shared/max/v8-max-console.ts");

      vi.mocked(mockConsole.warn).mockClear();

      registerSimplerCreationFixture();

      const result = await createDevice({
        device: "Simpler",
        path: "t0",
        params: [{ name: "nonexistent", value: "42" }],
      });

      expect(result).toStrictEqual({
        id: "simpler-new",
        path: "t0/d2",
        params: [
          {
            name: "nonexistent",
            ok: false,
            detail: "not found on t0/d2 (id simpler-new)",
          },
        ],
      });
      // The entry is the whole report: it warns nowhere.
      expect(vi.mocked(mockConsole.warn)).not.toHaveBeenCalled();
    });

    it("keeps the params the caller sent paired with the list it sent", async () => {
      registerThresholdDevice();

      const result = await createDevice({
        device: "Compressor",
        path: "t0",
        params: [
          { name: "nope", value: "1" },
          // Below the param's floor, so the entry can only say -60 dB by
          // reading Live back — an echo of the argument would say -100.
          { name: "Threshold", value: "-100 dB" },
        ],
      });

      expect(result).toStrictEqual({
        id: "comp-new",
        path: "t0/d2",
        params: [
          {
            name: "nope",
            ok: false,
            detail: "not found on t0/d2 (id comp-new)",
          },
          {
            id: "threshold",
            name: "Threshold",
            value: -60,
            detail: expect.stringContaining(
              "so -100 was set to the nearest valid value",
            ),
          },
        ],
      });
    });

    // Refused before the device is created, so a bad params list doesn't leave
    // a new device behind for the caller to clean up before retrying.
    it("refuses a params entry with an empty value, creating nothing", async () => {
      registerSimplerCreationFixture();

      await expect(
        createDevice({
          device: "Simpler",
          path: "t0",
          params: [{ name: "Volume", value: "" }],
        }),
      ).rejects.toThrow('params entry "Volume" has an empty value');
    });

    it("writes only the last of the same name twice", async () => {
      const { threshold } = registerThresholdDevice();

      const result = await createDevice({
        device: "Compressor",
        path: "t0",
        params: [
          { name: "Threshold", value: "-20 dB" },
          { name: "threshold", value: "-30 dB" },
        ],
      });

      expect(threshold.set).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual({
        id: "comp-new",
        path: "t0/d2",
        params: [
          {
            name: "Threshold",
            ok: false,
            detail: 'set again by "threshold" later in the list',
          },
          { id: "threshold", name: "Threshold", value: -30 },
        ],
      });
    });

    it("writes only the last of an id and a name reaching one param", async () => {
      const { threshold } = registerThresholdDevice();

      const result = await createDevice({
        device: "Compressor",
        path: "t0",
        params: [
          { id: "threshold", value: "-40 dB" },
          { name: "Threshold", value: "-30 dB" },
        ],
      });

      expect(threshold.set).toHaveBeenCalledTimes(1);
      expect(threshold.set).toHaveBeenCalledWith(
        "value",
        expect.closeTo(0.5, 6),
      );
      expect(result).toStrictEqual({
        id: "comp-new",
        path: "t0/d2",
        params: [
          {
            id: "threshold",
            ok: false,
            detail: 'set again by "Threshold" later in the list',
          },
          { id: "threshold", name: "Threshold", value: -30 },
        ],
      });
    });

    it("does not call replace_sample on a non-Simpler when sample is in params", async () => {
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

      await createDevice({
        device: "EQ Eight",
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
                    methods: {
                      // Live reports the file it resolved to, not the string
                      // it was handed.
                      replace_sample: (path: unknown) => {
                        samples[sampleId]!.properties.file_path =
                          `/Library${String(path)}`;
                      },
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

    it("builds a full kit in one call (chain + Simpler auto-create per pad)", async () => {
      const { simplers } = setupDrumKitFixture();

      const result = await createDevice({
        device: "Drum Rack",
        path: "t0",
        params: [
          { name: "pC1/sample", value: "/kick.wav" },
          { name: "pC#1/d0/sample", value: "/snare.wav" },
        ],
      });

      // Each pad's entry carries the path it was addressed by and the sample
      // its Simpler reports — the fixture's Simplers resolve to their own
      // path, so an entry echoing the written value would not match.
      expect(result).toStrictEqual({
        path: "t0/d0",
        id: "drum-rack",
        params: [
          { name: "pC1/sample", value: "/Library/kick.wav" },
          { name: "pC#1/d0/sample", value: "/Library/snare.wav" },
        ],
      });
      expect(simplers["chain-0-simpler"]!.call).toHaveBeenCalledWith(
        "replace_sample",
        "/kick.wav",
      );
      expect(simplers["chain-1-simpler"]!.call).toHaveBeenCalledWith(
        "replace_sample",
        "/snare.wav",
      );
    });

    it("sets a pad's gainDb after its sample in the same call", async () => {
      const { simplers, samples } = setupDrumKitFixture();

      await createDevice({
        device: "Drum Rack",
        path: "t0",
        params: [
          { name: "pC1/sample", value: "/kick.wav" },
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
