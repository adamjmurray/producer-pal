// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// peekInsertionContainerPath names a destination's container by Live path, and
// checkInsertionPath says what resolving it would do; neither makes a chain.

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerFixedChainRack } from "#src/tools/device/tests/helpers/fixed-chain-rack-fixtures.ts";
import { registerLayeredDrumRack } from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";
import {
  checkInsertionPath,
  peekInsertionContainerPath,
  resolveInsertionPath,
} from "../insertion-path.ts";

describe("peekInsertionContainerPath", () => {
  it.each([
    ["t2", "live_set tracks 2"],
    ["t2/d+", "live_set tracks 2"],
    ["t2/d3", "live_set tracks 2"],
    ["rt1/d0", "live_set return_tracks 1"],
    ["mt/d0", "live_set master_track"],
    ["t0/d1/c2/d0", "live_set tracks 0 devices 1 chains 2"],
    // The chain a `c+` would make isn't there to name: its rack is.
    ["t0/d1/c+", "live_set tracks 0 devices 1"],
  ])("names %s's container", (path, expected) => {
    expect(peekInsertionContainerPath(path)).toBe(expected);
  });

  it("answers null for a type segment that names no device", () => {
    registerMockObject("track0", {
      path: livePath.track(0),
      properties: { devices: [] },
    });

    expect(peekInsertionContainerPath("t0/afx5/c0/d0")).toBeNull();
  });

  describe("through a drum pad", () => {
    it("names the chain a pad's path reaches, whichever way it is spelled", () => {
      registerLayeredDrumRack();

      // Pad C1 holds chains 0 and 2; D1 holds chain 1.
      expect(peekInsertionContainerPath("t0/d0/pC1/d3")).toBe(
        "live_set tracks 0 devices 0 chains 0",
      );
      expect(peekInsertionContainerPath("t0/d0/pC1/c1/d0")).toBe(
        "live_set tracks 0 devices 0 chains 2",
      );
      expect(peekInsertionContainerPath("t0/d0/pD1")).toBe(
        "live_set tracks 0 devices 0 chains 1",
      );
    });

    it("names the rack for a new layer on a pad", () => {
      registerLayeredDrumRack();

      expect(peekInsertionContainerPath("t0/d0/pC1/c+")).toBe(
        "live_set tracks 0 devices 0",
      );
    });

    it("names a rack nested in a pad's chain for a c+ below it", () => {
      registerLayeredDrumRack({
        chainProperties: (index) =>
          index === 1 ? { devices: children("nested") } : {},
      });
      registerMockObject("nested", {
        path: livePath.track(0).device(0).chain(1).device(0),
      });

      expect(peekInsertionContainerPath("t0/d0/pD1/d0/c+")).toBe(
        "live_set tracks 0 devices 0 chains 1 devices 0",
      );
    });

    it("answers null for a pad with no chain to name", () => {
      registerLayeredDrumRack();

      expect(peekInsertionContainerPath("t0/d0/pE1/d0")).toBeNull();
    });
  });
});

const RACK_PATH = livePath.track(0).device(0);

/**
 * Register a rack at t0/d0 with two chains and a plain device beside it. Its
 * insert_chain is a spy that would add a chain, so a check that calls it shows.
 * @param drum - Whether the rack is a Drum Rack
 * @returns The rack mock
 */
function registerRack(drum = false): RegisteredMockObject {
  registerMockObject("track-0", {
    path: livePath.track(0),
    type: "Track",
    properties: { devices: children("rack", "plain") },
  });
  registerMockObject("plain", {
    path: livePath.track(0).device(1),
    type: "Device",
    properties: { can_have_chains: 0 },
  });

  for (const index of [0, 1]) {
    registerMockObject(`chain-${index}`, {
      path: `${RACK_PATH} chains ${index}`,
      type: drum ? "DrumChain" : "Chain",
      properties: { devices: children(), in_note: 36 + index },
    });
  }

  return registerMockObject("rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      chains: ["id", "chain-0", "id", "chain-1"],
      can_have_chains: 1,
      can_have_drum_pads: drum ? 1 : 0,
    },
    methods: { insert_chain: () => ["id", "chain-new"] },
  });
}

describe("checkInsertionPath", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  // The check and the resolution share one walk, so the words can't drift.
  describe("refuses what resolveInsertionPath refuses, in its words", () => {
    it.each([
      ["a Drum Rack's `c+`", "t0/d0/c+", true],
      ["a device with no chains for a `c+`", "t0/d1/c+", false],
      ["a chain in a Drum Rack", "t0/d0/c5/d+", true],
      ["a chain in a device with none", "t0/d1/c0/d+", false],
      ["too many chains to make", "t0/d0/c40/d+", false],
      ["a device that isn't there", "t0/d9/c0/d+", false],
    ])("%s", (_what, path, drum) => {
      const rack = registerRack(drum);
      let resolved: unknown;

      try {
        resolveInsertionPath(path, "toPath");
      } catch (error) {
        resolved = error;
      }

      rack.call.mockClear();

      expect(resolved).toBeInstanceOf(Error);
      expect(() => checkInsertionPath(path, "toPath")).toThrow(
        (resolved as Error).message,
      );
      expect(rack.call).not.toHaveBeenCalled();
    });

    it("refuses a return chain that isn't there", () => {
      registerRack();
      mockNonExistentObjects();

      expect(() => checkInsertionPath("t0/d0/rc0/d+", "toPath")).toThrow(
        'Return chain in path "t0/d0/rc0/d+" does not exist',
      );
    });

    // Resolving would say too that it left the chains it made; a check made none.
    it("refuses a device inside a chain it would have made", () => {
      const rack = registerRack();

      expect(() => checkInsertionPath("t0/d0/c5/d0/c0", "toPath")).toThrow(
        'Device in path "t0/d0/c5/d0/c0" does not exist',
      );
      expect(rack.call).not.toHaveBeenCalled();
    });

    it("refuses a track that isn't there", () => {
      mockNonExistentObjects();

      expect(() => checkInsertionPath("t9/d0/c0/d+", "toPath")).toThrow(
        'Track in path "t9/d0/c0/d+" does not exist',
      );
    });

    it.each(["t1/d0/c+", "t1/d0/c5/d+"])(
      "refuses %s on a full fixed-chain rack",
      (path) => {
        const rack = registerFixedChainRack(1, "multiband");

        expect(() => checkInsertionPath(path, "toPath")).toThrow(
          "Multiband Rack (id rack) has a fixed 3 chains",
        );
        expect(rack.call).not.toHaveBeenCalled();
      },
    );
  });

  describe("answers without making anything", () => {
    it("finds a chain that is there", () => {
      const rack = registerRack();

      const check = checkInsertionPath("t0/d0/c1/d0", "toPath");

      expect(check.container?.path).toBe(`${RACK_PATH} chains 1`);
      expect(check).toStrictEqual(
        expect.objectContaining({
          position: 0,
          makesChain: false,
          undetermined: false,
        }),
      );
      expect(rack.call).not.toHaveBeenCalled();
    });

    it.each(["t0/d0/c2/d0", "t0/d0/c9/d+", "t0/d0/c+"])(
      "says %s ends in a chain it would have made",
      (path) => {
        const rack = registerRack();

        const check = checkInsertionPath(path, "toPath");

        expect(check).toStrictEqual(
          expect.objectContaining({ container: null, makesChain: true }),
        );
        expect(rack.call).not.toHaveBeenCalled();
      },
    );

    it("names the track a bare destination reaches, there or not", () => {
      registerRack();

      expect(checkInsertionPath("t0/d+", "toPath").container?.path).toBe(
        livePath.track(0).toString(),
      );
    });

    it("finds a drum pad's chain that is there", () => {
      const rack = registerRack(true);

      const check = checkInsertionPath("t0/d0/pC1/d+", "toPath");

      expect(check.container?.path).toBe(`${RACK_PATH} chains 0`);
      expect(check.undetermined).toBe(false);
      expect(rack.call).not.toHaveBeenCalled();
    });

    it.each(["t0/d0/pD1/d+", "t0/d0/pD1/c+", "t0/d0/pC1/c+"])(
      "leaves %s, a pad chain only a write could make, undetermined",
      (path) => {
        const rack = registerRack(true);

        const check = checkInsertionPath(path, "toPath");

        expect(check).toStrictEqual(
          expect.objectContaining({ container: null, undetermined: true }),
        );
        expect(rack.call).not.toHaveBeenCalled();
      },
    );

    it("finds no chain for a pad path on a rack with no pads", () => {
      const rack = registerRack();

      expect(checkInsertionPath("t0/d0/pC1/d+", "toPath")).toStrictEqual(
        expect.objectContaining({
          container: null,
          makesChain: false,
          undetermined: false,
        }),
      );
      expect(rack.call).not.toHaveBeenCalled();
    });

    it("names the rack and index of a chain it would make", () => {
      const rack = registerRack();

      const { newChain } = checkInsertionPath("t0/d0/c+", "toPath");

      expect(newChain?.rack.path).toBe(rack.path);
      expect(newChain?.index).toBe(2);
      expect(checkInsertionPath("t0/d0/c7/d0", "toPath").newChain?.index).toBe(
        7,
      );
    });

    it("checks a `c+` under a rack nested in a pad against that rack", () => {
      registerRack(true);
      registerMockObject("chain-0", {
        path: `${RACK_PATH} chains 0`,
        type: "DrumChain",
        properties: { in_note: 36, devices: children("nested") },
      });
      registerMockObject("nested", {
        path: `${RACK_PATH} chains 0 devices 0`,
        type: "RackDevice",
        properties: { can_have_chains: 1, can_have_drum_pads: 0, chains: [] },
      });

      expect(checkInsertionPath("t0/d0/pC1/d0/c+", "toPath")).toStrictEqual(
        expect.objectContaining({
          container: null,
          makesChain: true,
        }),
      );
    });
  });
});
