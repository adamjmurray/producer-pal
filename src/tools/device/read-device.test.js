import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
} from "../../test/mock-live-api.js";
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
      type: "instrument: Operator",
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
      include: ["drum-pads"],
    });

    expect(result).toEqual({
      id: "drum-rack-123",
      type: "drum-rack",
      drumPads: [], // Included because drum-pads was requested
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
        case "parameters":
          return []; // empty parameters for "*" include
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
      type: "audio-effect-rack",
      chains: [],
      parameters: [],
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
      type: "audio-effect: EQ Eight",
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
      type: "instrument: Operator",
      name: "My Custom Operator",
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
      type: "midi-effect: Arpeggiator",
    });
  });

  it("should include collapsed: true when device is collapsed", () => {
    liveApiId.mockImplementation(function () {
      // Return valid IDs for both device and view
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id device-123 view") return "view-123";
      return "0";
    });
    liveApiGet.mockImplementation(function (prop) {
      // Handle view is_collapsed property
      if (this._path === "id device-123 view" && prop === "is_collapsed") {
        return [1]; // collapsed
      }
      // Handle device properties
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
      type: "instrument: Operator",
      collapsed: true,
    });
  });

  it("should not include collapsed when device is not collapsed", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "id device-123") return "device-123";
      if (this._path === "id device-123 view") return "view-123";
      return "0";
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "id device-123 view" && prop === "is_collapsed") {
        return [0]; // not collapsed
      }
      switch (prop) {
        case "name":
          return ["Operator"];
        case "class_display_name":
          return ["Operator"];
        case "type":
          return [1];
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
      type: "instrument: Operator",
    });
  });

  // NOTE: Tests for drum rack with soloed/muted pads and return chains
  // are too complex to mock reliably with the current test infrastructure.
  // These code paths in device-reader.js (lines 358, 422-450) would require
  // extensive LiveAPI mocking including drum pads, chains, and their properties.
  // Skipping these for now to focus on easier wins for test coverage.
  // Params tests are in read-device-params.test.js
});

describe("readDevice with path parameter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when neither deviceId nor path is provided", () => {
    expect(() => readDevice({})).toThrow(
      "Either deviceId or path must be provided",
    );
  });

  it("should throw error when both deviceId and path are provided", () => {
    expect(() => readDevice({ deviceId: "device-123", path: "1/0" })).toThrow(
      "Provide either deviceId or path, not both",
    );
  });

  it("should read device by path", () => {
    liveApiId.mockImplementation(function () {
      return "device-456";
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

    const result = readDevice({ path: "1/0" });

    expect(result).toEqual({
      id: "device-456",
      path: "1/0",
      type: "instrument: Operator",
    });
  });

  it("should throw error for non-existent device by path", () => {
    liveApiId.mockImplementation(function () {
      return "0";
    });

    expect(() => readDevice({ path: "1/0" })).toThrow(
      "Device not found at path: live_set tracks 1 devices 0",
    );
  });

  it("should read chain by path", () => {
    liveApiId.mockImplementation(function () {
      return "chain-789";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Chain 1"];
        case "mute":
          return [0];
        case "solo":
          return [0];
        default:
          return [];
      }
    });
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "devices") {
        return [];
      }
      return [];
    });

    const result = readDevice({ path: "1/0/0" });

    expect(result).toEqual({
      path: "1/0/0",
      name: "Chain 1",
      devices: [],
    });
  });

  it("should throw error for non-existent chain by path", () => {
    liveApiId.mockImplementation(function () {
      return "0";
    });

    expect(() => readDevice({ path: "1/0/0" })).toThrow(
      "Chain not found at path: 1/0/0",
    );
  });

  it("should read return chain by path", () => {
    liveApiId.mockImplementation(function () {
      return "return-chain-101";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Return A"];
        case "mute":
          return [0];
        case "solo":
          return [0];
        default:
          return [];
      }
    });
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "devices") {
        return [];
      }
      return [];
    });

    const result = readDevice({ path: "1/0/r0" });

    expect(result).toEqual({
      path: "1/0/r0",
      name: "Return A",
      devices: [],
    });
  });

  it("should read muted chain by path", () => {
    liveApiId.mockImplementation(function () {
      return "chain-muted";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Muted Chain"];
        case "mute":
          return [1]; // muted
        case "solo":
          return [0];
        default:
          return [];
      }
    });
    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "getChildren" && args[0] === "devices") {
        return [];
      }
      return [];
    });

    const result = readDevice({ path: "1/0/0" });

    expect(result).toEqual({
      path: "1/0/0",
      name: "Muted Chain",
      state: "muted",
      devices: [],
    });
  });

  it("should throw error for empty path (treated as no path)", () => {
    expect(() => readDevice({ path: "" })).toThrow(
      "Either deviceId or path must be provided",
    );
  });

  it("should throw error for track-only path", () => {
    expect(() => readDevice({ path: "1" })).toThrow(
      "Path must include at least a device index",
    );
  });

  it("should read device from return track by path", () => {
    liveApiId.mockImplementation(function () {
      return "return-device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Reverb"];
        case "class_display_name":
          return ["Reverb"];
        case "type":
          return [2]; // audio effect
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

    const result = readDevice({ path: "r0/0" });

    expect(result).toEqual({
      id: "return-device-123",
      path: "r0/0",
      type: "audio-effect: Reverb",
    });
  });

  it("should read device from master track by path", () => {
    liveApiId.mockImplementation(function () {
      return "master-device-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Limiter"];
        case "class_display_name":
          return ["Limiter"];
        case "type":
          return [2]; // audio effect
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

    const result = readDevice({ path: "m/0" });

    expect(result).toEqual({
      id: "master-device-123",
      path: "m/0",
      type: "audio-effect: Limiter",
    });
  });

  it("should throw error when device not found at drum pad path", () => {
    liveApiId.mockImplementation(function () {
      return "0"; // non-existent
    });

    expect(() => readDevice({ path: "1/0/pC3" })).toThrow(
      "Device not found at path: live_set tracks 1 devices 0",
    );
  });

  // NOTE: Tests for drum pad reading (readDrumPadByPath, buildDrumPadInfo, etc.)
  // are complex to mock reliably. The drum pad lookup requires setting up mock
  // objects with getProperty("note") returning MIDI note values that match the
  // note name conversion. These code paths would require extensive LiveAPI mocking.
});
