// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import {
  extractDevicePath,
  buildChainPath,
  buildReturnChainPath,
  buildDrumPadPath,
  resolvePathToLiveApi,
  resolveInsertionPath,
} from "./device-path-helpers.ts";

interface MockLiveApiContext {
  _path?: string;
  _id?: string;
  id?: string;
}

/**
 * Register a Drum Rack at t0/d0 holding one drum chain on C1 (note 36), the
 * layout every `pC1` path case resolves against.
 */
function registerDrumRackOnC1(): void {
  const drumChainId = "drum-chain-36";

  registerMockObject("drum-rack", {
    path: "live_set tracks 0 devices 0",
    type: "RackDevice",
    properties: {
      chains: ["id", drumChainId],
    },
  });
  registerMockObject(drumChainId, {
    type: "DrumChain",
    properties: { in_note: 36 },
  });
}

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

      it("keeps every digit of a multi-digit device index", () => {
        // Guards the `\d+` (not `\d`) quantifier on the devices/chains matcher.
        expect(extractDevicePath("live_set tracks 0 devices 12")).toBe(
          "t0/d12",
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

      it("keeps every digit of a multi-digit return track index", () => {
        // Guards the `(\d+)` (not `(\d)`) capture on the return-track prefix.
        expect(extractDevicePath("live_set return_tracks 12 devices 0")).toBe(
          "rt12/d0",
        );
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

      it("requires the track prefix to anchor at the start of the path", () => {
        // The prefix matchers are `^`-anchored: a live_set path buried after
        // other text is not a valid device path.
        expect(extractDevicePath("x live_set tracks 1 devices 0")).toBe(null);
        expect(extractDevicePath("x live_set return_tracks 0 devices 0")).toBe(
          null,
        );
        expect(extractDevicePath("x live_set master_track devices 0")).toBe(
          null,
        );
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
          remainingSegments: [],
        });
      });

      it("resolves return track device", () => {
        expect(resolvePathToLiveApi("rt0/d0")).toStrictEqual({
          liveApiPath: "live_set return_tracks 0 devices 0",
          targetType: "device",
          remainingSegments: [],
        });
      });

      it("resolves master track device", () => {
        expect(resolvePathToLiveApi("mt/d0")).toStrictEqual({
          liveApiPath: "live_set master_track devices 0",
          targetType: "device",
          remainingSegments: [],
        });
      });

      it("resolves nested device in chain", () => {
        expect(resolvePathToLiveApi("t1/d0/c0/d1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 chains 0 devices 1",
          targetType: "device",
          remainingSegments: [],
        });
      });

      it("resolves deeply nested device", () => {
        expect(resolvePathToLiveApi("t2/d0/c1/d2/c3/d4")).toStrictEqual({
          liveApiPath:
            "live_set tracks 2 devices 0 chains 1 devices 2 chains 3 devices 4",
          targetType: "device",
          remainingSegments: [],
        });
      });
    });

    describe("chain paths", () => {
      it("resolves chain path", () => {
        expect(resolvePathToLiveApi("t1/d0/c0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 chains 0",
          targetType: "chain",
          remainingSegments: [],
        });
      });

      it("resolves nested chain path", () => {
        expect(resolvePathToLiveApi("t1/d0/c0/d1/c2")).toStrictEqual({
          liveApiPath:
            "live_set tracks 1 devices 0 chains 0 devices 1 chains 2",
          targetType: "chain",
          remainingSegments: [],
        });
      });

      it("resolves master track chain", () => {
        expect(resolvePathToLiveApi("mt/d0/c0")).toStrictEqual({
          liveApiPath: "live_set master_track devices 0 chains 0",
          targetType: "chain",
          remainingSegments: [],
        });
      });
    });

    describe("return chain paths", () => {
      it("resolves return chain in rack", () => {
        expect(resolvePathToLiveApi("t1/d0/rc0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 return_chains 0",
          targetType: "return-chain",
          remainingSegments: [],
        });
      });

      it("resolves device in return chain", () => {
        expect(resolvePathToLiveApi("t1/d0/rc0/d1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 return_chains 0 devices 1",
          targetType: "device",
          remainingSegments: [],
        });
      });

      it("resolves return chain in return track rack", () => {
        expect(resolvePathToLiveApi("rt0/d0/rc1")).toStrictEqual({
          liveApiPath: "live_set return_tracks 0 devices 0 return_chains 1",
          targetType: "return-chain",
          remainingSegments: [],
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
      it("throws on an empty or non-string path", () => {
        // A truthy non-string trips the `typeof !== "string"` half of the guard
        // (not the `!path` half), so removing it would let `.split` throw a
        // different, less useful error.
        for (const path of ["", null, 123]) {
          expect(() => resolvePathToLiveApi(path as string)).toThrow(
            "invalid path: path is empty",
          );
        }
      });

      it("throws on track-only path", () => {
        // rt0 and mt used to answer with this too, because the return/master
        // case fell through to the device parser instead of naming a track.
        for (const path of ["t1", "rt0", "mt"]) {
          expect(() => resolvePathToLiveApi(path)).toThrow(
            `invalid path "${path}" - a track is not a device; add a device index (e.g. "${path}/d0")`,
          );
        }
      });

      it("throws when the first segment is empty (leading slash)", () => {
        expect(() => resolvePathToLiveApi("/d0")).toThrow(
          'invalid path "/d0" - it has an empty segment',
        );
      });

      it("throws on any malformed track segment, naming the valid forms", () => {
        // One message for all of them: the whole grammar lives in
        // object-path.ts so clip and device paths can't drift apart.
        for (const path of ["abc/d0", "rtx/d0", "tabc/d0"]) {
          expect(() => resolvePathToLiveApi(path)).toThrow(
            /is not a track or scene; expected "t<index>", "rt<index>", "mt", or "s<index>"/,
          );
        }
      });

      it("throws on a segment that names no device, chain, or pad", () => {
        for (const path of [
          "t1/dabc",
          "t1/d0/cabc",
          "t1/d0/rcx",
          "t1/d0/p",
          "t0/d0/xyz",
        ]) {
          expect(() => resolvePathToLiveApi(path)).toThrow(
            /is not a device, chain, or drum pad; expected "d<index>", "c<index>", "rc<index>", or "p<note>"/,
          );
        }
      });

      it("throws on a path that holds no device at all", () => {
        expect(() => resolvePathToLiveApi("s0")).toThrow(
          /a scene holds no devices/,
        );
        expect(() => resolvePathToLiveApi("t0/s1")).toThrow(
          /a session slot holds no devices/,
        );
      });
    });
  });

  describe("resolveInsertionPath", () => {
    let defaultDeviceMock: RegisteredMockObject;

    beforeEach(() => {
      vi.clearAllMocks();
      // Default: device has chains so auto-creation isn't triggered
      defaultDeviceMock = registerMockObject("default-device", {
        path: "live_set tracks 0 devices 0",
        properties: {
          chains: ["id", "chain-0", "id", "chain-1"],
          can_have_chains: 1,
          can_have_drum_pads: 0,
        },
      });
    });

    it("resolves track and chain paths correctly", () => {
      const cases: [string, string, number | null][] = [
        ["t0", "live_set tracks 0", null],
        ["t0/d3", "live_set tracks 0", 3],
        ["t0/d0/c0", "live_set tracks 0 devices 0 chains 0", null],
        ["t0/d0/c0/d1", "live_set tracks 0 devices 0 chains 0", 1],
      ];

      for (const [path, expectedPath, expectedPos] of cases) {
        const result = resolveInsertionPath(path);

        expect((result.container as MockLiveApiContext)._path).toBe(
          expectedPath,
        );
        expect(result.position).toBe(expectedPos);
      }
    });

    it("resolves drum pad paths (append and with position)", () => {
      registerDrumRackOnC1();

      expect(resolveInsertionPath("t0/d0/pC1").position).toBeNull();
      // "t0/d0/pC1/c2" means chain index 2 within C1 (no position)
      expect(resolveInsertionPath("t0/d0/pC1/c2").position).toBeNull();
      // "t0/d0/pC1/c0/d3" means chain index 0, position 3
      expect(resolveInsertionPath("t0/d0/pC1/c0/d3").position).toBe(3);
    });

    it("throws on invalid paths", () => {
      for (const path of ["", null, 123]) {
        expect(() => resolveInsertionPath(path as string)).toThrow(
          "invalid path: path is empty",
        );
      }

      // A negative or non-numeric device position is a parse error now, not a
      // position the resolver has to second-guess.
      expect(() => resolveInsertionPath("t0/dabc")).toThrow(
        /"dabc" is not a device, chain, or drum pad/,
      );
      expect(() => resolveInsertionPath("t0/d-1")).toThrow(
        /"d-1" is not a device, chain, or drum pad/,
      );
    });

    it("throws on path starting with /", () => {
      for (const path of ["/t0", "/"]) {
        expect(() => resolveInsertionPath(path)).toThrow(
          `invalid path "${path}" - it has an empty segment`,
        );
      }
    });

    it("names the param the path came from", () => {
      // A device duplicate/move gets its path from `toPath`, so reporting
      // "invalid path" sends a caller looking for a param it never sent.
      expect(() => resolveInsertionPath("x9/d0", "toPath")).toThrow(
        'invalid toPath "x9/d0" - "x9" is not a track or scene',
      );
      expect(() => resolveInsertionPath("x9/d0")).toThrow(
        'invalid path "x9/d0" - "x9" is not a track or scene',
      );
    });

    it("throws on invalid track segment for single-segment paths", () => {
      // "track0" and "t" used to slip through the old startsWith("t") check and
      // resolve to track NaN; the shared grammar requires t<digits>.
      for (const path of ["xyz", "abc", "scene0", "track0", "t"]) {
        expect(() => resolveInsertionPath(path)).toThrow(
          `"${path}" is not a track`,
        );
      }
    });

    describe("chain auto-creation", () => {
      /**
       * Sets up mocks for chain auto-creation tests.
       * @param devicePath - Path to register the device at
       * @returns Object with deviceMock and chainCount getter
       */
      function setupChainAutoCreateMocks(
        devicePath = "live_set tracks 0 devices 0",
      ) {
        const chainIds: string[] = [];

        const deviceMock = registerMockObject(`device-${devicePath}`, {
          path: devicePath,
          properties: {
            chains: chainIds,
            can_have_chains: 1,
            can_have_drum_pads: 0,
          },
          methods: {
            insert_chain: () => {
              const newId = `chain-${chainIds.length / 2}`;

              chainIds.push("id", newId);

              return ["id", newId];
            },
          },
        });

        return { deviceMock, getChainCount: () => chainIds.length / 2 };
      }

      it("auto-creates chain when it does not exist", () => {
        const { deviceMock } = setupChainAutoCreateMocks();

        const result = resolveInsertionPath("t0/d0/c0");

        expect(deviceMock.call).toHaveBeenCalledWith("insert_chain");
        expect((result.container as MockLiveApiContext)._path).toBe(
          "live_set tracks 0 devices 0 chains 0",
        );
      });

      it("auto-creates multiple chains up to requested index", () => {
        const { deviceMock } = setupChainAutoCreateMocks();

        resolveInsertionPath("t0/d0/c2");
        // Should create chains 0, 1, 2
        expect(deviceMock.call).toHaveBeenCalledTimes(3);
      });

      it("throws for Drum Rack chain auto-creation", () => {
        registerMockObject("drum-rack-device", {
          path: "live_set tracks 0 devices 0",
          properties: {
            chains: [],
            can_have_chains: 1,
            can_have_drum_pads: 1,
          },
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          "Auto-creating chains in Drum Racks is not supported",
        );
      });

      it("throws for non-existent return chain", () => {
        // Register return chain with id "0" so exists() returns false
        registerMockObject("0", {
          path: "live_set tracks 0 devices 0 return_chains 0",
        });

        expect(() => resolveInsertionPath("t0/d0/rc0")).toThrow(
          "Return chain in path",
        );
      });

      it("does not auto-create when chain already exists", () => {
        // Default device already has chains at indices 0 and 1
        resolveInsertionPath("t0/d0/c0");
        expect(defaultDeviceMock.call).not.toHaveBeenCalledWith("insert_chain");
      });

      it("throws when too many chains would be auto-created", () => {
        registerMockObject("empty-rack", {
          path: "live_set tracks 0 devices 0",
          properties: {
            chains: [],
            can_have_chains: 1,
            can_have_drum_pads: 0,
          },
        });

        // Chain index 20 would require creating 21 chains (0-20), exceeds limit of 16
        expect(() => resolveInsertionPath("t0/d0/c20")).toThrow(
          "Cannot auto-create 21 chains (max: 16)",
        );
      });

      it("throws for device that cannot have chains", () => {
        registerMockObject("non-rack-device", {
          path: "live_set tracks 0 devices 0",
          properties: {
            chains: [],
            can_have_chains: 0,
          },
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          "does not support chains",
        );
      });

      it("throws when insert_chain fails unexpectedly", () => {
        registerMockObject("failing-rack", {
          path: "live_set tracks 0 devices 0",
          properties: {
            chains: [],
            can_have_chains: 1,
            can_have_drum_pads: 0,
          },
          methods: {
            insert_chain: () => 1, // Failure return value
          },
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          "Failed to create chain 1/1",
        );
      });

      it("auto-creates chain on master track device", () => {
        const { deviceMock } = setupChainAutoCreateMocks(
          "live_set master_track devices 0",
        );

        const result = resolveInsertionPath("mt/d0/c0");

        expect(deviceMock.call).toHaveBeenCalledWith("insert_chain");
        expect((result.container as MockLiveApiContext)._path).toBe(
          "live_set master_track devices 0 chains 0",
        );
      });

      it("auto-creates chain on return track device", () => {
        const { deviceMock } = setupChainAutoCreateMocks(
          "live_set return_tracks 0 devices 0",
        );

        const result = resolveInsertionPath("rt0/d0/c0");

        expect(deviceMock.call).toHaveBeenCalledWith("insert_chain");
        expect((result.container as MockLiveApiContext)._path).toBe(
          "live_set return_tracks 0 devices 0 chains 0",
        );
      });

      it("throws when device does not exist during chain navigation", () => {
        // Override default device to be non-existent (id "0" makes exists() false)
        registerMockObject("0", {
          path: "live_set tracks 0 devices 0",
        });

        expect(() => resolveInsertionPath("t0/d0/c0")).toThrow(
          'Device in path "t0/d0/c0" does not exist',
        );
      });
    });

    describe("drum pad edge cases", () => {
      it("returns null when device does not exist during drum pad auto-creation", () => {
        // device.exists() returns false inside the chain auto-creation block
        // Register device with id "0" so exists() returns false
        registerMockObject("0", {
          path: "live_set tracks 0 devices 0",
        });

        const result = resolveInsertionPath("t0/d0/pC1");

        expect(result.container).toBeNull();
      });

      it("returns null when drum pad navigation returns non-chain target type", () => {
        // resolveDrumPadFromPath returns {target: null, targetType: "device"}
        // which is not "chain" so auto-creation is skipped → falls through to return null.
        // Path "t0/d0/pC1/c0/c1": remainingSegments=["c0","c1"].
        // "c0" is consumed as chain index, "c1" doesn't start with "d" →
        // resolveDrumPadFromPath returns {target: null, targetType: "device"}.
        registerDrumRackOnC1();

        const result = resolveInsertionPath("t0/d0/pC1/c0/c1");

        expect(result.container).toBeNull();
        expect(result.position).toBeNull();
      });
    });
  });
});
