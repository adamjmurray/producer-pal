import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiType,
} from "#src/test/mock-live-api.js";
import "#src/live-api-adapter/live-api-extensions.js";
import {
  extractDevicePath,
  buildChainPath,
  buildReturnChainPath,
  buildDrumPadPath,
  resolvePathToLiveApi,
  resolveInsertionPath,
} from "./device-path-helpers.js";

describe("device-path-helpers", () => {
  describe("extractDevicePath", () => {
    describe("regular track devices", () => {
      it("extracts path for track device", () => {
        expect(extractDevicePath("live_set tracks 1 devices 0")).toBe("t1/d0");
      });

      it("extracts path for nested chain device", () => {
        expect(
          extractDevicePath("live_set tracks 2 devices 0 chains 1 devices 2"),
        ).toBe("t2/d0/c1/d2");
      });

      it("extracts path for deeply nested device", () => {
        expect(
          extractDevicePath(
            "live_set tracks 0 devices 1 chains 2 devices 3 chains 4 devices 5",
          ),
        ).toBe("t0/d1/c2/d3/c4/d5");
      });

      it("extracts path for chain only (no device)", () => {
        expect(extractDevicePath("live_set tracks 1 devices 0 chains 2")).toBe(
          "t1/d0/c2",
        );
      });
    });

    describe("return track devices", () => {
      it("extracts path for return track device", () => {
        expect(extractDevicePath("live_set return_tracks 0 devices 0")).toBe(
          "rt0/d0",
        );
      });

      it("extracts path for return track nested device", () => {
        expect(
          extractDevicePath(
            "live_set return_tracks 1 devices 0 chains 0 devices 1",
          ),
        ).toBe("rt1/d0/c0/d1");
      });
    });

    describe("master track devices", () => {
      it("extracts path for master track device", () => {
        expect(extractDevicePath("live_set master_track devices 0")).toBe(
          "mt/d0",
        );
      });

      it("extracts path for master track nested device", () => {
        expect(
          extractDevicePath("live_set master_track devices 0 chains 0"),
        ).toBe("mt/d0/c0");
      });

      it("extracts path for master track deeply nested", () => {
        expect(
          extractDevicePath(
            "live_set master_track devices 0 chains 1 devices 2",
          ),
        ).toBe("mt/d0/c1/d2");
      });
    });

    describe("return chains in racks", () => {
      it("extracts path for return chain", () => {
        expect(
          extractDevicePath("live_set tracks 1 devices 0 return_chains 0"),
        ).toBe("t1/d0/rc0");
      });

      it("extracts path for device in return chain", () => {
        expect(
          extractDevicePath(
            "live_set tracks 1 devices 0 return_chains 0 devices 1",
          ),
        ).toBe("t1/d0/rc0/d1");
      });

      it("extracts path for return chain in return track rack", () => {
        expect(
          extractDevicePath(
            "live_set return_tracks 0 devices 0 return_chains 1",
          ),
        ).toBe("rt0/d0/rc1");
      });
    });

    describe("invalid paths", () => {
      it("returns null for invalid path without track prefix", () => {
        expect(extractDevicePath("devices 0")).toBe(null);
        expect(extractDevicePath("some random string")).toBe(null);
      });

      it("returns null for empty string", () => {
        expect(extractDevicePath("")).toBe(null);
      });
    });
  });

  describe("buildChainPath", () => {
    it("builds chain path from device path", () => {
      expect(buildChainPath("t1/d0", 2)).toBe("t1/d0/c2");
    });

    it("builds chain path for return track device", () => {
      expect(buildChainPath("rt0/d0", 0)).toBe("rt0/d0/c0");
    });

    it("builds chain path for master track device", () => {
      expect(buildChainPath("mt/d0", 1)).toBe("mt/d0/c1");
    });

    it("builds nested chain path", () => {
      expect(buildChainPath("t1/d0/c0/d1", 3)).toBe("t1/d0/c0/d1/c3");
    });
  });

  describe("buildReturnChainPath", () => {
    it("builds return chain path", () => {
      expect(buildReturnChainPath("t1/d0", 0)).toBe("t1/d0/rc0");
    });

    it("builds return chain path for return track device", () => {
      expect(buildReturnChainPath("rt0/d0", 1)).toBe("rt0/d0/rc1");
    });

    it("builds return chain path for master track device", () => {
      expect(buildReturnChainPath("mt/d0", 0)).toBe("mt/d0/rc0");
    });
  });

  describe("buildDrumPadPath", () => {
    it("builds drum pad path with natural note", () => {
      expect(buildDrumPadPath("t1/d0", "C1")).toBe("t1/d0/pC1");
    });

    it("builds drum pad path with sharp note", () => {
      expect(buildDrumPadPath("t1/d0", "F#2")).toBe("t1/d0/pF#2");
    });

    it("builds drum pad path with flat note", () => {
      expect(buildDrumPadPath("t2/d1", "Bb0")).toBe("t2/d1/pBb0");
    });

    it("builds drum pad path for return track device", () => {
      expect(buildDrumPadPath("rt0/d0", "C3")).toBe("rt0/d0/pC3");
    });

    it("builds drum pad path with explicit chain index", () => {
      expect(buildDrumPadPath("t1/d0", "C1", 1)).toBe("t1/d0/pC1/c1");
    });

    it("builds catch-all drum pad path", () => {
      expect(buildDrumPadPath("t1/d0", "*")).toBe("t1/d0/p*");
    });
  });

  describe("resolvePathToLiveApi", () => {
    describe("device paths", () => {
      it("resolves regular track device", () => {
        expect(resolvePathToLiveApi("t1/d0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "device",
        });
      });

      it("resolves return track device", () => {
        expect(resolvePathToLiveApi("rt0/d0")).toStrictEqual({
          liveApiPath: "live_set return_tracks 0 devices 0",
          targetType: "device",
        });
      });

      it("resolves master track device", () => {
        expect(resolvePathToLiveApi("mt/d0")).toStrictEqual({
          liveApiPath: "live_set master_track devices 0",
          targetType: "device",
        });
      });

      it("resolves nested device in chain", () => {
        expect(resolvePathToLiveApi("t1/d0/c0/d1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 chains 0 devices 1",
          targetType: "device",
        });
      });

      it("resolves deeply nested device", () => {
        expect(resolvePathToLiveApi("t2/d0/c1/d2/c3/d4")).toStrictEqual({
          liveApiPath:
            "live_set tracks 2 devices 0 chains 1 devices 2 chains 3 devices 4",
          targetType: "device",
        });
      });
    });

    describe("chain paths", () => {
      it("resolves chain path", () => {
        expect(resolvePathToLiveApi("t1/d0/c0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 chains 0",
          targetType: "chain",
        });
      });

      it("resolves nested chain path", () => {
        expect(resolvePathToLiveApi("t1/d0/c0/d1/c2")).toStrictEqual({
          liveApiPath:
            "live_set tracks 1 devices 0 chains 0 devices 1 chains 2",
          targetType: "chain",
        });
      });

      it("resolves master track chain", () => {
        expect(resolvePathToLiveApi("mt/d0/c0")).toStrictEqual({
          liveApiPath: "live_set master_track devices 0 chains 0",
          targetType: "chain",
        });
      });
    });

    describe("return chain paths", () => {
      it("resolves return chain in rack", () => {
        expect(resolvePathToLiveApi("t1/d0/rc0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 return_chains 0",
          targetType: "return-chain",
        });
      });

      it("resolves device in return chain", () => {
        expect(resolvePathToLiveApi("t1/d0/rc0/d1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 return_chains 0 devices 1",
          targetType: "device",
        });
      });

      it("resolves return chain in return track rack", () => {
        expect(resolvePathToLiveApi("rt0/d0/rc1")).toStrictEqual({
          liveApiPath: "live_set return_tracks 0 devices 0 return_chains 1",
          targetType: "return-chain",
        });
      });
    });

    describe("drum pad paths", () => {
      it("resolves drum pad path", () => {
        expect(resolvePathToLiveApi("t1/d0/pC1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "C1",
          remainingSegments: [],
        });
      });

      it("resolves drum pad with chain index", () => {
        expect(resolvePathToLiveApi("t1/d0/pC1/c0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "C1",
          remainingSegments: ["c0"],
        });
      });

      it("resolves drum pad with chain and device", () => {
        expect(resolvePathToLiveApi("t1/d0/pC1/c0/d0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "C1",
          remainingSegments: ["c0", "d0"],
        });
      });

      it("resolves drum pad with sharp note", () => {
        expect(resolvePathToLiveApi("t1/d0/pF#2")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "F#2",
          remainingSegments: [],
        });
      });

      it("resolves drum pad with flat note", () => {
        expect(resolvePathToLiveApi("t2/d1/pBb0")).toStrictEqual({
          liveApiPath: "live_set tracks 2 devices 1",
          targetType: "drum-pad",
          drumPadNote: "Bb0",
          remainingSegments: [],
        });
      });
    });

    describe("error handling", () => {
      it("throws on empty path", () => {
        expect(() => resolvePathToLiveApi("")).toThrow(
          "Path must be a non-empty string",
        );
      });

      it("throws on null path", () => {
        expect(() => resolvePathToLiveApi(null)).toThrow(
          "Path must be a non-empty string",
        );
      });

      it("throws on track-only path", () => {
        expect(() => resolvePathToLiveApi("t1")).toThrow(
          "Path must include at least a device index",
        );
      });

      it("throws on invalid track prefix", () => {
        expect(() => resolvePathToLiveApi("abc/d0")).toThrow(
          "Invalid track segment",
        );
      });

      it("throws on invalid return track index", () => {
        expect(() => resolvePathToLiveApi("rtx/d0")).toThrow(
          "Invalid return track index",
        );
      });

      it("throws on invalid device index", () => {
        expect(() => resolvePathToLiveApi("t1/dabc")).toThrow(
          "Invalid device index",
        );
      });

      it("throws on invalid chain index", () => {
        expect(() => resolvePathToLiveApi("t1/d0/cabc")).toThrow(
          "Invalid chain index",
        );
      });

      it("throws on invalid return chain index", () => {
        expect(() => resolvePathToLiveApi("t1/d0/rcx")).toThrow(
          "Invalid return chain index",
        );
      });

      it("throws on empty drum pad note", () => {
        expect(() => resolvePathToLiveApi("t1/d0/p")).toThrow(
          "Invalid drum pad note",
        );
      });
    });
  });

  describe("resolveInsertionPath", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      liveApiId.mockReturnValue("valid-id");
      // Default: chains exist so auto-creation isn't triggered
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "chains") return ["id", "chain-0", "id", "chain-1"];
        if (prop === "can_have_drum_pads") return [0];

        return [];
      });
    });

    it("resolves track and chain paths correctly", () => {
      const cases = [
        ["t0", "live_set tracks 0", null],
        ["t0/d3", "live_set tracks 0", 3],
        ["t0/d0/c0", "live_set tracks 0 devices 0 chains 0", null],
        ["t0/d0/c0/d1", "live_set tracks 0 devices 0 chains 0", 1],
      ];

      for (const [path, expectedPath, expectedPos] of cases) {
        const result = resolveInsertionPath(path);

        expect(result.container._path).toBe(expectedPath);
        expect(result.position).toBe(expectedPos);
      }
    });

    it("resolves drum pad paths (append and with position)", () => {
      const drumChainId = "drum-chain-36";

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "drum-rack";

        return this._path?.startsWith("id ")
          ? this._path.slice(3)
          : (this._id ?? "valid-id");
      });
      liveApiType.mockReturnValue("DrumGroupDevice");
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set tracks 0 devices 0" && prop === "chains")
          return ["id", drumChainId];
        if ((this._id ?? this.id) === drumChainId && prop === "in_note")
          return [36];

        return [];
      });
      expect(resolveInsertionPath("t0/d0/pC1").position).toBeNull();
      // "t0/d0/pC1/c2" means chain index 2 within C1 (no position)
      expect(resolveInsertionPath("t0/d0/pC1/c2").position).toBeNull();
      // "t0/d0/pC1/c0/d3" means chain index 0, position 3
      expect(resolveInsertionPath("t0/d0/pC1/c0/d3").position).toBe(3);
    });

    it("throws on invalid paths", () => {
      expect(() => resolveInsertionPath("")).toThrow(
        "Path must be a non-empty string",
      );
      expect(() => resolveInsertionPath(null)).toThrow(
        "Path must be a non-empty string",
      );
      expect(() => resolveInsertionPath("t0/dabc")).toThrow(
        "Invalid device position",
      );
      expect(() => resolveInsertionPath("t0/d-1")).toThrow(
        "Invalid device position",
      );
    });

    describe("chain auto-creation", () => {
      it("auto-creates chain when it does not exist", () => {
        let chainCount = 0;

        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") {
            // Return current chains based on chainCount
            const ids = [];

            for (let i = 0; i < chainCount; i++) {
              ids.push("id", `chain-${i}`);
            }

            return ids;
          }

          if (prop === "can_have_chains") return [1]; // Is a rack
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "insert_chain") {
            chainCount++;

            return ["id", `chain-${chainCount - 1}`];
          }
        });

        const result = resolveInsertionPath("t0/d0/c0");

        expect(liveApiCall).toHaveBeenCalledWith("insert_chain");
        expect(result.container._path).toBe(
          "live_set tracks 0 devices 0 chains 0",
        );
      });

      it("auto-creates multiple chains up to requested index", () => {
        let chainCount = 0;

        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") {
            const ids = [];

            for (let i = 0; i < chainCount; i++) ids.push("id", `chain-${i}`);

            return ids;
          }

          if (prop === "can_have_chains") return [1]; // Is a rack
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "insert_chain") {
            chainCount++;

            return ["id", `chain-${chainCount - 1}`];
          }
        });

        resolveInsertionPath("t0/d0/c2");
        // Should create chains 0, 1, 2
        expect(liveApiCall).toHaveBeenCalledTimes(3);
      });

      it("throws for Drum Rack chain auto-creation", () => {
        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") return []; // No chains
          if (prop === "can_have_chains") return [1]; // Is a rack
          if (prop === "can_have_drum_pads") return [1]; // Is drum rack

          return [];
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          "Auto-creating chains in Drum Racks is not supported",
        );
      });

      it("throws for non-existent return chain", () => {
        liveApiId.mockImplementation(function () {
          if (this._path?.includes("return_chains")) return "0";

          return "valid-id";
        });

        expect(() => resolveInsertionPath("t0/d0/rc0")).toThrow(
          "Return chain in path",
        );
      });

      it("does not auto-create when chain already exists", () => {
        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") return ["id", "chain-0", "id", "chain-1"];
          if (prop === "can_have_chains") return [1]; // Is a rack
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });

        resolveInsertionPath("t0/d0/c0");
        expect(liveApiCall).not.toHaveBeenCalledWith("insert_chain");
      });

      it("throws when too many chains would be auto-created", () => {
        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") return []; // No chains exist
          if (prop === "can_have_chains") return [1]; // Is a rack
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });

        // Chain index 20 would require creating 21 chains (0-20), exceeds limit of 16
        expect(() => resolveInsertionPath("t0/d0/c20")).toThrow(
          "Cannot auto-create 21 chains (max: 16)",
        );
      });

      it("throws for device that cannot have chains", () => {
        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") return []; // No chains
          if (prop === "can_have_chains") return [0]; // Not a rack

          return [];
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          "does not support chains",
        );
      });

      it("throws when insert_chain fails unexpectedly", () => {
        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") return []; // No chains
          if (prop === "can_have_chains") return [1]; // Is a rack
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "insert_chain") {
            return 1; // Failure return value
          }
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          "Failed to create chain 1/1",
        );
      });

      it("auto-creates chain on master track device", () => {
        let chainCount = 0;

        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") {
            const ids = [];

            for (let i = 0; i < chainCount; i++) {
              ids.push("id", `chain-${i}`);
            }

            return ids;
          }

          if (prop === "can_have_chains") return [1];
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "insert_chain") {
            chainCount++;

            return ["id", `chain-${chainCount - 1}`];
          }
        });

        const result = resolveInsertionPath("mt/d0/c0");

        expect(liveApiCall).toHaveBeenCalledWith("insert_chain");
        expect(result.container._path).toBe(
          "live_set master_track devices 0 chains 0",
        );
      });

      it("auto-creates chain on return track device", () => {
        let chainCount = 0;

        liveApiGet.mockImplementation(function (prop) {
          if (prop === "chains") {
            const ids = [];

            for (let i = 0; i < chainCount; i++) {
              ids.push("id", `chain-${i}`);
            }

            return ids;
          }

          if (prop === "can_have_chains") return [1];
          if (prop === "can_have_drum_pads") return [0];

          return [];
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "insert_chain") {
            chainCount++;

            return ["id", `chain-${chainCount - 1}`];
          }
        });

        const result = resolveInsertionPath("rt0/d0/c0");

        expect(liveApiCall).toHaveBeenCalledWith("insert_chain");
        expect(result.container._path).toBe(
          "live_set return_tracks 0 devices 0 chains 0",
        );
      });

      it("throws when device does not exist during chain navigation", () => {
        liveApiId.mockImplementation(function () {
          // Track exists but device doesn't
          if (this._path === "live_set tracks 0") return "track-id";
          if (this._path === "live_set tracks 0 devices 0") return "0"; // Non-existent

          return "valid-id";
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          'Device in path "t0/d0/c0" does not exist',
        );
      });
    });
  });
});
