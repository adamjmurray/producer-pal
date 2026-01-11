import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiType,
} from "#src/test/mock-live-api.js";
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
    expect(() => readDevice({ deviceId: "device-123", path: "t1/d0" })).toThrow(
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

    const result = readDevice({ path: "t1/d0" });

    expect(result).toStrictEqual({
      id: "device-456",
      path: "t1/d0",
      type: "instrument: Operator",
    });
  });

  it("should throw error for non-existent device by path", () => {
    liveApiId.mockImplementation(function () {
      return "0";
    });

    expect(() => readDevice({ path: "t1/d0" })).toThrow(
      "Device not found at path: live_set tracks 1 devices 0",
    );
  });

  it("should read chain by path with id property", () => {
    liveApiId.mockImplementation(function () {
      return "chain-789";
    });
    liveApiType.mockReturnValue("Chain");
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

    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-789",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Chain 1",
      devices: [],
    });
  });

  it("should read chain with color property", () => {
    liveApiId.mockImplementation(function () {
      return "chain-with-color";
    });
    liveApiType.mockReturnValue("Chain");
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

    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-with-color",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Colored Chain",
      color: "#FF5500",
      devices: [],
    });
  });

  it("should read chain with green color property", () => {
    liveApiId.mockImplementation(function () {
      return "chain-123";
    });
    liveApiType.mockReturnValue("Chain");
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Test Chain"];
        case "mute":
          return [0];
        case "solo":
          return [0];
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

    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-123",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Test Chain",
      color: "#00FF00",
      devices: [],
    });
  });

  it("should read chain with devices", () => {
    liveApiId.mockImplementation(function () {
      const id = this._id;

      if (id === "device-in-chain") return "device-in-chain";

      return "chain-with-devices";
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "device-in-chain") return "Device";

      return "Chain";
    });
    liveApiGet.mockImplementation(function (prop) {
      const id = this._id;

      // Device properties
      if (id === "device-in-chain") {
        switch (prop) {
          case "name":
            return ["Simpler"];
          case "class_display_name":
            return ["Simpler"];
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
      }

      // Chain properties
      switch (prop) {
        case "name":
          return ["Chain With Devices"];
        case "mute":
          return [0];
        case "solo":
          return [0];
        case "color":
          return [];
        case "devices":
          return ["id", "device-in-chain"];
        default:
          return [];
      }
    });

    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-with-devices",
      path: "t1/d0/c0",
      type: "Chain",
      name: "Chain With Devices",
      devices: [
        {
          id: "device-in-chain",
          type: "instrument: Simpler",
        },
      ],
    });
  });

  it("should omit chokeGroup for regular chains (not DrumChain type)", () => {
    liveApiId.mockImplementation(function () {
      return "chain-no-choke";
    });
    liveApiType.mockReturnValue("Chain");
    liveApiGet.mockImplementation(function (prop) {
      switch (prop) {
        case "name":
          return ["Regular Chain"];
        case "mute":
          return [0];
        case "solo":
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

    const result = readDevice({ path: "t1/d0/c0" });

    // Regular chains (type: "Chain") don't have chokeGroup - only DrumChain type does
    expect(result.type).toBe("Chain");
    expect(result.chokeGroup).toBeUndefined();
  });

  it("should throw error for non-existent chain by path", () => {
    liveApiId.mockImplementation(function () {
      return "0";
    });

    expect(() => readDevice({ path: "t1/d0/c0" })).toThrow(
      "Chain not found at path: t1/d0/c0",
    );
  });

  it("should read return chain by path with enriched properties", () => {
    liveApiId.mockImplementation(function () {
      return "return-chain-101";
    });
    liveApiType.mockReturnValue("Chain");
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

    const result = readDevice({ path: "t1/d0/rc0" });

    expect(result).toStrictEqual({
      id: "return-chain-101",
      path: "t1/d0/rc0",
      type: "Chain",
      name: "Return A",
      color: "#0088FF",
      devices: [],
    });
  });

  it("should read muted chain by path with enriched properties", () => {
    liveApiId.mockImplementation(function () {
      return "chain-muted";
    });
    liveApiType.mockReturnValue("Chain");
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

    const result = readDevice({ path: "t1/d0/c0" });

    expect(result).toStrictEqual({
      id: "chain-muted",
      path: "t1/d0/c0",
      type: "Chain",
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
    expect(() => readDevice({ path: "t1" })).toThrow(
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

    const result = readDevice({ path: "rt0/d0" });

    expect(result).toStrictEqual({
      id: "return-device-123",
      path: "rt0/d0",
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

    const result = readDevice({ path: "mt/d0" });

    expect(result).toStrictEqual({
      id: "master-device-123",
      path: "mt/d0",
      type: "audio-effect: Limiter",
    });
  });

  it("should throw error when device not found at drum pad path", () => {
    liveApiId.mockImplementation(function () {
      return "0"; // non-existent
    });

    expect(() => readDevice({ path: "t1/d0/pC3" })).toThrow(
      "Device not found at path: live_set tracks 1 devices 0",
    );
  });
});
