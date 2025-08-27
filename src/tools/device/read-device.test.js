// src/tools/device/read-device.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiGet, liveApiId } from "../../mock-live-api.js";
import { readDevice } from "./read-device.js";

describe("readDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should read basic device properties", () => {
    liveApiId.mockImplementation(function () {
      return "device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Operator"];
        case "class_display_name":
          return ["Operator"];
        case "type":
          return [1]; // instrument
        case "can_have_chains":
          return [0];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    const result = readDevice({ deviceId: "device-123" });

    expect(result).toEqual({
      id: "device-123",
      name: "Operator",
      type: "instrument",
    });
  });

  it("should throw error for non-existent device", () => {
    liveApiId.mockImplementation(function () {
      return "0";
    });

    expect(() => readDevice({ deviceId: "invalid-id" })).toThrow(
      "Device with ID invalid-id not found",
    );
  });

  it("should read instrument rack device", () => {
    liveApiId.mockImplementation(function () {
      return "rack-device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Instrument Rack"];
        case "class_display_name":
          return ["Instrument Rack"];
        case "type":
          return [1]; // instrument
        case "can_have_chains":
          return [1];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    // Mock getChildren to return empty arrays for chains
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "chains") {
        return [];
      }
      return [];
    });

    const result = readDevice({
      deviceId: "rack-device-123",
      include: ["chains"],
    });

    expect(result).toEqual({
      id: "rack-device-123",
      name: "Instrument Rack",
      type: "instrument-rack",
      chains: [],
    });
  });

  it("should read drum rack device", () => {
    liveApiId.mockImplementation(function () {
      return "drum-rack-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Drum Rack"];
        case "class_display_name":
          return ["Drum Rack"];
        case "type":
          return [1]; // instrument
        case "can_have_chains":
          return [1];
        case "can_have_drum_pads":
          return [1];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    // Mock getChildren to return empty arrays for drum_pads and return_chains
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "drum_pads") {
        return [];
      }
      if (method === "getChildren" && args[0] === "return_chains") {
        return [];
      }
      return [];
    });

    const result = readDevice({
      deviceId: "drum-rack-123",
      include: ["drum-chains"],
    });

    expect(result).toEqual({
      id: "drum-rack-123",
      name: "Drum Rack",
      type: "drum-rack",
      drumPads: [],
    });
  });

  it("should read audio effect rack device", () => {
    liveApiId.mockImplementation(function () {
      return "device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Audio Effect Rack"];
        case "class_display_name":
          return ["Audio Effect Rack"];
        case "type":
          return [2]; // audio effect
        case "can_have_chains":
          return [1];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    // Mock getChildren to return empty arrays for chains and return_chains
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "chains") {
        return [];
      }
      if (method === "getChildren" && args[0] === "return_chains") {
        return [];
      }
      return [];
    });

    const result = readDevice({
      deviceId: "device-123",
      include: ["*"],
    });

    expect(result).toEqual({
      id: "device-123",
      name: "Audio Effect Rack",
      type: "audio-effect-rack",
      chains: [],
    });
  });

  it("should handle deactivated devices", () => {
    liveApiId.mockImplementation(function () {
      return "device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["EQ Eight"];
        case "class_display_name":
          return ["EQ Eight"];
        case "type":
          return [2]; // audio effect
        case "can_have_chains":
          return [0];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [0]; // deactivated
        default:
          return [];
      }
    });

    const result = readDevice({ deviceId: "device-123" });

    expect(result).toEqual({
      id: "device-123",
      name: "EQ Eight",
      type: "audio-effect",
      deactivated: true,
    });
  });

  it("should handle custom display names", () => {
    liveApiId.mockImplementation(function () {
      return "device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["My Custom Operator"];
        case "class_display_name":
          return ["Operator"];
        case "type":
          return [1]; // instrument
        case "can_have_chains":
          return [0];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    const result = readDevice({ deviceId: "device-123" });

    expect(result).toEqual({
      id: "device-123",
      name: "Operator",
      type: "instrument",
      displayName: "My Custom Operator",
    });
  });

  it("should identify midi effect rack", () => {
    liveApiId.mockImplementation(function () {
      return "device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["MIDI Effect Rack"];
        case "class_display_name":
          return ["MIDI Effect Rack"];
        case "type":
          return [4]; // midi effect
        case "can_have_chains":
          return [1];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    // Mock getChildren to return empty arrays for chains
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "chains") {
        return [];
      }
      return [];
    });

    const result = readDevice({ deviceId: "device-123" });

    expect(result).toEqual({
      id: "device-123",
      name: "MIDI Effect Rack",
      type: "midi-effect-rack",
      chains: [],
    });
  });

  it("should identify simple midi effect", () => {
    liveApiId.mockImplementation(function () {
      return "device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Arpeggiator"];
        case "class_display_name":
          return ["Arpeggiator"];
        case "type":
          return [4]; // midi effect
        case "can_have_chains":
          return [0];
        case "can_have_drum_pads":
          return [0];
        case "is_active":
          return [1];
        default:
          return [];
      }
    });

    const result = readDevice({ deviceId: "device-123" });

    expect(result).toEqual({
      id: "device-123",
      name: "Arpeggiator",
      type: "midi-effect",
    });
  });
});
