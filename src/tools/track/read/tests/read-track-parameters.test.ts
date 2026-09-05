// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  expectDrumRackWithStrippedChains,
  mockTrackProperties,
  setupDrumRackMocks,
} from "./helpers/read-track-test-helpers.ts";
import {
  createChainMockProperties,
  createDeviceMockProperties,
  createRackDeviceMockProperties,
} from "./helpers/read-track-device-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

/**
 * Register one empty chain under a device, the shape every chain-stripping case
 * needs (the chain's own contents are irrelevant — only that it exists).
 * @param chainId - Mock-registry id for the chain
 * @param deviceIndex - Index of the owning device on track 0
 * @param name - The chain's display name
 */
function registerEmptyChain(
  chainId: string,
  deviceIndex: number,
  name: string,
): void {
  registerMockObject(chainId, {
    path: livePath.track(0).device(deviceIndex).chain(0),
    type: "Chain",
    properties: createChainMockProperties({ name, color: 0, deviceIds: [] }),
  });
}

describe("readTrack", () => {
  describe("id parameter", () => {
    it("reads track by id", () => {
      registerMockObject("123", {
        path: livePath.track(2),
        type: "Track",
        properties: mockTrackProperties({
          name: "Track by ID",
          color: 16711680, // Red
          arm: 1,
        }),
      });

      const result = readTrack({ id: "123" });

      expect(result).toStrictEqual({
        id: "123",
        path: "t2",
        type: "midi",
        name: "Track by ID",
        sessionClipCount: 0,
        arrangementClipCount: 0,
        deviceCount: 0,
        isArmed: true,
      });
    });

    // A permanent alias, not a migration: models reach for the prefixed
    // spelling on their own, so it keeps working.
    it("still reads a track by the trackId alias", () => {
      registerMockObject("123", {
        path: livePath.track(2),
        type: "Track",
        properties: mockTrackProperties({ name: "Track by ID" }),
      });

      expect(readTrack({ trackId: "123" })).toStrictEqual({
        arrangementClipCount: 0,
        deviceCount: 0,
        sessionClipCount: 0,
        type: "midi",
        id: "123",
        path: "t2",
        name: "Track by ID",
      });
    });

    it("reads return track by id", () => {
      registerMockObject("456", {
        path: livePath.returnTrack(1),
        type: "Track",
        properties: mockTrackProperties({
          name: "Return by ID",
          has_midi_input: 0,
          color: 65280, // Green
          can_be_armed: 0,
        }),
      });

      const result = readTrack({ id: "456" });

      expect(result).toStrictEqual({
        id: "456",
        path: "rt1",
        name: "Return by ID",
        sessionClipCount: 0,
        arrangementClipCount: 0,
        deviceCount: 0,
      });
    });

    it("reads master track by id", () => {
      registerMockObject("789", {
        path: livePath.masterTrack(),
        type: "Track",
        properties: mockTrackProperties({
          name: "Master by ID",
          has_midi_input: 0,
          color: 16777215, // White
          can_be_armed: 0,
        }),
      });

      const result = readTrack({ id: "789" });

      expect(result).toStrictEqual({
        id: "789",
        path: "mt",
        name: "Master by ID",
        sessionClipCount: 0,
        arrangementClipCount: 0,
        deviceCount: 0,
      });
    });

    it("throws error when id does not exist", () => {
      mockNonExistentObjects();

      expect(() => {
        readTrack({ id: "nonexistent" });
      }).toThrow('id "nonexistent" does not exist');
    });

    it("throws error when neither id nor trackIndex provided", () => {
      expect(() => {
        readTrack({});
      }).toThrow("id or path is required");
    });

    it("ignores trackType when id is provided", () => {
      registerMockObject("999", {
        path: livePath.track(0),
        type: "Track",
        properties: mockTrackProperties({
          name: "Track ignores type",
        }),
      });

      // trackType should be ignored when trackId is provided
      const result = readTrack({ id: "999", trackType: "return" });

      // Should read as regular track (from path) not return track
      expect(result.path).toBe("t0");
    });
  });

  describe("path parameter", () => {
    it("reads a regular track", () => {
      registerMockObject("123", {
        path: livePath.track(2),
        type: "Track",
        properties: mockTrackProperties({ name: "By Path" }),
      });

      expect(readTrack({ path: "t2" })).toStrictEqual({
        id: "123",
        path: "t2",
        type: "midi",
        name: "By Path",
        sessionClipCount: 0,
        arrangementClipCount: 0,
        deviceCount: 0,
      });
    });

    it("reads a return track", () => {
      registerMockObject("456", {
        path: livePath.returnTrack(1),
        type: "Track",
        properties: mockTrackProperties({
          name: "Return by Path",
          has_midi_input: 0,
          can_be_armed: 0,
        }),
      });

      expect(readTrack({ path: "rt1" })).toStrictEqual({
        id: "456",
        path: "rt1",
        name: "Return by Path",
        sessionClipCount: 0,
        arrangementClipCount: 0,
        deviceCount: 0,
      });
    });

    it("reads the main track", () => {
      registerMockObject("789", {
        path: livePath.masterTrack(),
        type: "Track",
        properties: mockTrackProperties({
          name: "Main by Path",
          has_midi_input: 0,
          can_be_armed: 0,
        }),
      });

      expect(readTrack({ path: "mt" })).toStrictEqual({
        id: "789",
        path: "mt",
        name: "Main by Path",
        sessionClipCount: 0,
        arrangementClipCount: 0,
        deviceCount: 0,
      });
    });

    // A read has nothing left to return, so a bad path throws rather than
    // warning the way the write tools' lists do.
    it("throws when the path names nothing", () => {
      mockNonExistentObjects();

      expect(() => readTrack({ path: "t9" })).toThrow('nothing at path "t9"');
    });

    it("throws when the path names something else", () => {
      expect(() => readTrack({ path: "s0" })).toThrow(
        'invalid path "s0" - names a scene, not a track',
      );
    });

    it.each([
      ["id", { id: "123" }],
      ["trackIndex", { trackIndex: 0 }],
    ])("refuses a path sent with %s", (_name, other) => {
      expect(() => readTrack({ path: "t0", ...other })).toThrow(
        "path names the track on its own",
      );
    });

    // Same as an id: the object found says what category it is, so a trackType
    // alongside has nothing to decide.
    it("ignores trackType", () => {
      registerMockObject("123", {
        path: livePath.track(0),
        type: "Track",
        properties: mockTrackProperties({ name: "Regular" }),
      });

      const result = readTrack({ path: "t0", trackType: "return" });

      expect(result.path).toBe("t0");
    });
  });

  describe("drum-map include option", () => {
    it("includes drumMap but strips chains when using drum-map", () => {
      setupDrumRackMocks();

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "drum-map"],
      });

      expectDrumRackWithStrippedChains(result);
    });

    it("drum racks don't have main chains even with chains included", () => {
      setupDrumRackMocks({ kickDeviceId: "kick_device2" });

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "drum-map"],
      });

      expectDrumRackWithStrippedChains(result);
    });

    it("strips chains from all device types when using drum-map", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          devices: children(
            "midi_effect_rack",
            "instrument_rack",
            "audio_effect_rack",
          ),
        }),
      });
      registerMockObject("midi_effect_rack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "MIDI Effect Rack",
          className: "MidiEffectGroupDevice",
          classDisplayName: "MIDI Effect Rack",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          chainIds: ["midi_chain"],
        }),
      });
      registerMockObject("instrument_rack", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Instrument Rack",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["inst_chain"],
        }),
      });
      registerMockObject("audio_effect_rack", {
        path: livePath.track(0).device(2),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Audio Effect Rack",
          className: "AudioEffectGroupDevice",
          classDisplayName: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          chainIds: ["audio_chain"],
        }),
      });
      registerEmptyChain("midi_chain", 0, "MIDI Chain");
      registerEmptyChain("inst_chain", 1, "Inst Chain");
      registerEmptyChain("audio_chain", 2, "Audio Chain");

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "drum-map"],
      });

      // All devices should have chains stripped
      const devices = result.devices as Record<string, unknown>[];

      expect(devices).toHaveLength(3);
      expect(devices[0]).toStrictEqual({
        id: "midi_effect_rack",
        path: "t0/d0",
        type: "midi-effect-rack",
      });
      expect(devices[0]!.chains).toBeUndefined();

      expect(devices[1]).toStrictEqual({
        id: "instrument_rack",
        path: "t0/d1",
        type: "instrument-rack",
      });
      expect(devices[1]!.chains).toBeUndefined();

      expect(devices[2]).toStrictEqual({
        id: "audio_effect_rack",
        path: "t0/d2",
        type: "audio-effect-rack",
      });
      expect(devices[2]!.chains).toBeUndefined();
    });

    it("strips chains from devices when using drum-map without chains", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          devices: children("instrument_rack"),
        }),
      });
      registerMockObject("instrument_rack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Instrument Rack",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["chain1"],
        }),
      });
      registerEmptyChain("chain1", 0, "Chain 1");

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "drum-map"],
      });

      // Should have devices but NO chains (drum-map strips chains)
      const devices = result.devices as Record<string, unknown>[];

      expect(devices[0]).toStrictEqual({
        id: "instrument_rack",
        path: "t0/d0",
        type: "instrument-rack",
      });
      expect(devices[0]!.chains).toBeUndefined();
    });

    it("handles drum-map with no drum racks gracefully", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          devices: children("wavetable"),
        }),
      });
      registerMockObject("wavetable", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Wavetable",
          className: "InstrumentVector",
          classDisplayName: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "drum-map"],
      });

      // Should have devices but no drumMap
      expect(result.devices).toStrictEqual([
        {
          id: "wavetable",
          path: "t0/d0",
          type: "instrument: Wavetable",
        },
      ]);
      expect(result.drumMap).toBeUndefined();
      expect(
        (result.devices as Record<string, unknown>[])[0]!.chains,
      ).toBeUndefined();
    });
  });
});
