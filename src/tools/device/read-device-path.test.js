import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiType,
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

    const result = readDevice({ path: "1/0/0" });

    expect(result).toEqual({
      id: "chain-789",
      path: "1/0/0",
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

    const result = readDevice({ path: "1/0/0" });

    expect(result).toEqual({
      id: "chain-with-color",
      path: "1/0/0",
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

    const result = readDevice({ path: "1/0/0" });

    expect(result).toEqual({
      id: "chain-123",
      path: "1/0/0",
      type: "Chain",
      name: "Test Chain",
      color: "#00FF00",
      devices: [],
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

    const result = readDevice({ path: "1/0/0" });

    // Regular chains (type: "Chain") don't have chokeGroup - only DrumChain type does
    expect(result.type).toBe("Chain");
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

    const result = readDevice({ path: "1/0/r0" });

    expect(result).toEqual({
      id: "return-chain-101",
      path: "1/0/r0",
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

    const result = readDevice({ path: "1/0/0" });

    expect(result).toEqual({
      id: "chain-muted",
      path: "1/0/0",
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

  describe("drum pad paths", () => {
    // Helper functions for mock property lookup
    const getPadProperty = (id, prop, padProperties) => {
      const padProps = padProperties[id] ?? {};
      const propMap = {
        note: [padProps.note ?? 36],
        name: [padProps.name ?? "Kick"],
        mute: [padProps.mute ?? 0],
        solo: [padProps.solo ?? 0],
        chains: (padProps.chainIds ?? []).flatMap((c) => ["id", c]),
      };
      return propMap[prop];
    };

    const getChainProperty = (id, prop, chainProperties) => {
      const chainProps = chainProperties[id] ?? {};
      const propMap = {
        name: [chainProps.name ?? "Chain"],
        mute: [chainProps.mute ?? 0],
        solo: [chainProps.solo ?? 0],
        muted_via_solo: [0],
        choke_group: [chainProps.choke_group ?? 0],
        out_note: [chainProps.out_note ?? 36],
        color: chainProps.color ? [chainProps.color] : [],
        devices: (chainProps.deviceIds ?? []).flatMap((d) => ["id", d]),
      };
      return propMap[prop];
    };

    const getDeviceProperty = (id, prop, deviceProperties) => {
      const devProps = deviceProperties[id] ?? {};
      const propMap = {
        name: [devProps.name ?? "Device"],
        class_display_name: [devProps.class_display_name ?? "Device"],
        type: [devProps.type ?? 1],
        can_have_chains: [0],
        can_have_drum_pads: [0],
        is_active: [1],
        devices: [],
      };
      return propMap[prop];
    };

    // Helper to set up drum pad mocks using the LiveAPI ID-based pattern
    const setupDrumPadMocks = (config) => {
      const {
        deviceId = "drum-rack-1",
        padIds = ["pad-36"],
        padProperties = {},
        chainProperties = {},
        deviceProperties = {},
      } = config;

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0") return deviceId;
        return this._id ?? "0";
      });

      // Mock chain type - chains in drum pads are DrumChain type
      liveApiType.mockImplementation(function () {
        const id = this._id ?? this.id;
        if (id?.startsWith("chain-")) {
          return chainProperties[id]?.type ?? "DrumChain";
        }
        return undefined; // Let default mock handle other types
      });

      liveApiGet.mockImplementation(function (prop) {
        const id = this._id ?? this.id;

        if (id === deviceId || this._path?.includes("devices 0")) {
          if (prop === "can_have_drum_pads") return [1];
          if (prop === "drum_pads") return padIds.flatMap((p) => ["id", p]);
        }

        if (id?.startsWith("pad-"))
          return getPadProperty(id, prop, padProperties);
        if (id?.startsWith("chain-"))
          return getChainProperty(id, prop, chainProperties);
        if (id?.startsWith("device-"))
          return getDeviceProperty(id, prop, deviceProperties);

        return [];
      });
    };

    it("should read drum pad by path", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, name: "Kick" } },
      });

      const result = readDevice({ path: "1/0/pC1", include: [] });

      expect(result).toEqual({
        path: "1/0/pC1",
        name: "Kick",
        note: 36,
        pitch: "C1",
      });
    });

    it("should read muted drum pad", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, name: "Kick", mute: 1 } },
      });

      const result = readDevice({ path: "1/0/pC1", include: [] });

      expect(result.state).toBe("muted");
    });

    it("should read soloed drum pad", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, name: "Kick", solo: 1 } },
      });

      const result = readDevice({ path: "1/0/pC1", include: [] });

      expect(result.state).toBe("soloed");
    });

    it("should read drum pad with chains when includeChains is requested", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: {
          "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
        },
        chainProperties: {
          "chain-1": {
            name: "Layer 1",
            color: 0xff0000,
            choke_group: 2,
            out_note: 48,
          },
        },
      });

      const result = readDevice({ path: "1/0/pC1", include: ["chains"] });

      expect(result.chains).toHaveLength(1);
      expect(result.chains[0]).toEqual({
        id: "chain-1",
        path: "1/0/pC1/0",
        type: "DrumChain",
        name: "Layer 1",
        color: "#FF0000",
        mappedPitch: "C2",
        chokeGroup: 2,
        devices: [],
      });
    });

    it("should read drum pad chain by path", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: {
          "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
        },
        chainProperties: {
          "chain-1": { name: "Layer 1", color: 0x00ff00, out_note: 60 },
        },
      });

      const result = readDevice({ path: "1/0/pC1/0" });

      expect(result).toEqual({
        id: "chain-1",
        path: "1/0/pC1/0",
        type: "DrumChain",
        name: "Layer 1",
        color: "#00FF00",
        mappedPitch: "C3",
        devices: [],
      });
    });

    it("should throw error when drum pad not found", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, name: "Kick" } }, // C1, not C3
      });

      expect(() => readDevice({ path: "1/0/pC3" })).toThrow(
        "Drum pad C3 not found",
      );
    });

    it("should throw error for invalid chain index in drum pad", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, name: "Kick", chainIds: [] } },
      });

      expect(() => readDevice({ path: "1/0/pC1/5" })).toThrow(
        "Invalid chain index in path: 1/0/pC1/5",
      );
    });

    it("should read device inside drum pad chain", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: {
          "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
        },
        chainProperties: {
          "chain-1": { name: "Layer 1", deviceIds: ["device-1"] },
        },
        deviceProperties: {
          "device-1": {
            name: "Simpler",
            class_display_name: "Simpler",
            type: 1,
          },
        },
      });

      const result = readDevice({ path: "1/0/pC1/0/0" });

      expect(result.id).toBe("device-1");
      expect(result.type).toBe("instrument: Simpler");
    });

    it("should throw error for invalid device index in drum pad chain", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: {
          "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
        },
        chainProperties: { "chain-1": { name: "Layer 1", deviceIds: [] } },
      });

      expect(() => readDevice({ path: "1/0/pC1/0/5" })).toThrow(
        "Invalid device index in path: 1/0/pC1/0/5",
      );
    });
  });
});
