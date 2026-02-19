// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "../read-device.ts";
import { setupBasicDeviceMock } from "./read-device-test-helpers.ts";

describe("readDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("should read basic device properties", () => {
    setupBasicDeviceMock({ class_display_name: "Operator", type: 1 });
    const result = readDevice({ deviceId: "device-123" });

    expect(result).toStrictEqual({
      id: "device-123",
      type: "instrument: Operator",
    });
  });

  it("should throw error for non-existent device", () => {
    mockNonExistentObjects();

    expect(() => readDevice({ deviceId: "invalid-id" })).toThrow(
      "Device with ID invalid-id not found",
    );
  });

  it("should read instrument rack device", () => {
    setupBasicDeviceMock({
      id: "rack-device-123",
      class_display_name: "Instrument Rack",
      type: 1,
      can_have_chains: 1,
    });
    const result = readDevice({
      deviceId: "rack-device-123",
      include: ["chains"],
    });

    expect(result).toStrictEqual({
      id: "rack-device-123",
      type: "instrument-rack",
      chains: [],
    });
  });

  it("should read drum rack device", () => {
    setupBasicDeviceMock({
      id: "drum-rack-123",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
    });
    const result = readDevice({
      deviceId: "drum-rack-123",
      include: ["drum-pads"],
    });

    expect(result).toStrictEqual({
      id: "drum-rack-123",
      type: "drum-rack",
      drumPads: [],
    });
  });

  it("should read audio effect rack device", () => {
    setupBasicDeviceMock({
      class_display_name: "Audio Effect Rack",
      type: 2,
      can_have_chains: 1,
    });
    const result = readDevice({ deviceId: "device-123", include: ["*"] });

    expect(result).toStrictEqual({
      id: "device-123",
      type: "audio-effect-rack",
      chains: [],
      parameters: [],
    });
  });

  it("should handle deactivated devices", () => {
    setupBasicDeviceMock({
      class_display_name: "EQ Eight",
      type: 2,
      is_active: 0,
    });
    const result = readDevice({ deviceId: "device-123" });

    expect(result).toStrictEqual({
      id: "device-123",
      type: "audio-effect: EQ Eight",
      deactivated: true,
    });
  });

  it("should handle custom display names", () => {
    setupBasicDeviceMock({
      name: "My Custom Operator",
      class_display_name: "Operator",
      type: 1,
    });
    const result = readDevice({ deviceId: "device-123" });

    expect(result).toStrictEqual({
      id: "device-123",
      type: "instrument: Operator",
      name: "My Custom Operator",
    });
  });

  it("should identify midi effect rack", () => {
    setupBasicDeviceMock({
      class_display_name: "MIDI Effect Rack",
      type: 4,
      can_have_chains: 1,
    });
    const result = readDevice({ deviceId: "device-123" });

    expect(result).toStrictEqual({
      id: "device-123",
      type: "midi-effect-rack",
    });
  });

  it("should identify simple midi effect", () => {
    setupBasicDeviceMock({ class_display_name: "Arpeggiator", type: 4 });
    const result = readDevice({ deviceId: "device-123" });

    expect(result).toStrictEqual({
      id: "device-123",
      type: "midi-effect: Arpeggiator",
    });
  });

  // collapsed — kept for potential future use (tests removed)

  // NOTE: Tests for drum rack with soloed/muted pads and return chains
  // are too complex to mock reliably with the current test infrastructure.
  // These code paths in device-reader.js (lines 358, 422-450) would require
  // extensive LiveAPI mocking including drum pads, chains, and their properties.
  // Skipping these for now to focus on easier wins for test coverage.
  // Params tests are in read-device-params.test.js
  // Path-based tests are in read-device-path.test.js

  describe("Simpler sample reading", () => {
    it("should include sample path for Simpler device with loaded sample", () => {
      setupBasicDeviceMock({
        class_display_name: "Simpler",
        type: 1,
        sample: "/path/to/sample.wav",
      });
      const result = readDevice({
        deviceId: "device-123",
        include: ["sample"],
      });

      expect(result).toStrictEqual({
        id: "device-123",
        type: "instrument: Simpler",
        sample: "/path/to/sample.wav",
        gainDb: -70, // Mock returns 0 for gain → liveGainToDb(0) = -70
      });
    });

    it("should not include sample for Simpler without sample include", () => {
      setupBasicDeviceMock({
        class_display_name: "Simpler",
        type: 1,
        sample: "/path/to/sample.wav",
      });
      const result = readDevice({ deviceId: "device-123" });

      expect(result).toStrictEqual({
        id: "device-123",
        type: "instrument: Simpler",
      });
    });

    it("should not include sample for non-Simpler instruments", () => {
      setupBasicDeviceMock({ class_display_name: "Operator", type: 1 });
      const result = readDevice({
        deviceId: "device-123",
        include: ["sample"],
      });

      expect(result).toStrictEqual({
        id: "device-123",
        type: "instrument: Operator",
      });
    });
  });

  describe("drum rack includes", () => {
    // Shared setup for drum rack with chain-based mocking (in_note)
    function setupDrumRackWithChain(): void {
      registerMockObject("drum-rack-123", {
        type: "Device",
        properties: {
          class_display_name: "Drum Rack",
          name: "Drum Rack",
          type: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          is_active: 1,
          parameters: [],
          chains: ["id", "chain-1"],
        },
      });

      registerMockObject("chain-1", {
        type: "DrumChain",
        properties: {
          name: "Kick",
          in_note: 36,
          mute: 0,
          solo: 0,
          muted_via_solo: 0,
          choke_group: 0,
          out_note: 36,
          devices: ["id", "dev-1"],
        },
      });

      registerMockObject("dev-1", {
        type: "Device",
        properties: {
          name: "Simpler",
          class_display_name: "Simpler",
          type: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
          is_active: 1,
          parameters: [],
        },
      });
    }

    it("should include drumMap and strip internally-fetched data", () => {
      setupDrumRackWithChain();

      const result = readDevice({
        deviceId: "drum-rack-123",
        include: ["drum-map"],
      });

      expect(result.drumMap).toStrictEqual({ C1: "Kick" });
      expect(result.drumPads).toBeUndefined();
    });

    it("should show deviceCount at maxDepth 0 for drum pad chains", () => {
      setupDrumRackWithChain();

      const result = readDevice({
        deviceId: "drum-rack-123",
        include: ["drum-pads"],
        maxDepth: 0,
      });

      const drumPads = result.drumPads as Record<string, unknown>[];

      expect(drumPads).toHaveLength(1);
      expect(drumPads[0]).toMatchObject({
        note: 36,
        pitch: "C1",
        name: "Kick",
      });
    });
  });
});
