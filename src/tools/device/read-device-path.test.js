import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
} from "../../test/mock-live-api.js";
import { readDevice } from "./read-device.js";

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

  it("should read chain by path with id property", () => {
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
        case "choke_group":
          return [0]; // no choke group
        case "color":
          return []; // undefined - no color
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
      id: "chain-789",
      path: "1/0/0",
      name: "Chain 1",
      devices: [],
    });
  });

  it("should read chain with color property", () => {
    liveApiId.mockImplementation(function () {
      return "chain-with-color";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Colored Chain"];
        case "mute":
          return [0];
        case "solo":
          return [0];
        case "choke_group":
          return [0];
        case "color":
          return [0xff5500]; // orange color (255*65536 + 85*256 + 0)
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
      id: "chain-with-color",
      path: "1/0/0",
      name: "Colored Chain",
      color: "#FF5500",
      devices: [],
    });
  });

  it("should read drum chain with chokeGroup property", () => {
    liveApiId.mockImplementation(function () {
      return "drum-chain-123";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Drum Chain"];
        case "mute":
          return [0];
        case "solo":
          return [0];
        case "choke_group":
          return [5]; // choke group 5
        case "color":
          return [0x00ff00]; // green color
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
      id: "drum-chain-123",
      path: "1/0/0",
      name: "Drum Chain",
      color: "#00FF00",
      chokeGroup: 5,
      devices: [],
    });
  });

  it("should omit chokeGroup when value is 0", () => {
    liveApiId.mockImplementation(function () {
      return "chain-no-choke";
    });
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["No Choke Chain"];
        case "mute":
          return [0];
        case "solo":
          return [0];
        case "choke_group":
          return [0]; // no choke group
        case "color":
          return []; // undefined - no color
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

    expect(result.chokeGroup).toBeUndefined();
  });

  it("should throw error for non-existent chain by path", () => {
    liveApiId.mockImplementation(function () {
      return "0";
    });

    expect(() => readDevice({ path: "1/0/0" })).toThrow(
      "Chain not found at path: 1/0/0",
    );
  });

  it("should read return chain by path with enriched properties", () => {
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
        case "choke_group":
          return [0]; // return chains don't have choke groups
        case "color":
          return [0x0088ff]; // blue color
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
      id: "return-chain-101",
      path: "1/0/r0",
      name: "Return A",
      color: "#0088FF",
      devices: [],
    });
  });

  it("should read muted chain by path with enriched properties", () => {
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
        case "choke_group":
          return [0];
        case "color":
          return []; // undefined - no color
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
      id: "chain-muted",
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
