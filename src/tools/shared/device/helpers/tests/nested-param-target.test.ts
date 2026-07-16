// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { resolveNestedParamTarget } from "../nested-param-target.ts";

const RACK_PATH = "live_set tracks 0 devices 0";

/**
 * Register a Drum Rack with the given chain ids.
 * @param chainIds - Chain object ids to attach to the rack
 * @returns The rack mock
 */
function registerRack(chainIds: string[] = []): RegisteredMockObject {
  return registerMockObject("rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: chainIds.flatMap((id) => ["id", id]),
    },
  });
}

/**
 * Register a drum chain with an in_note and (optionally) devices + methods.
 * @param id - Chain object id
 * @param inNote - The chain's in_note (MIDI note of the pad it belongs to)
 * @param deviceIds - Device ids inside the chain
 * @param methods - Method overrides (e.g. insert_device)
 * @returns The chain mock
 */
function registerDrumChain(
  id: string,
  inNote: number,
  deviceIds: string[] = [],
  methods: Record<string, (...args: unknown[]) => unknown> = {},
): RegisteredMockObject {
  return registerMockObject(id, {
    type: "DrumChain",
    properties: {
      in_note: inNote,
      devices: deviceIds.flatMap((d) => ["id", d]),
    },
    methods,
  });
}

/**
 * Register a device with a class_display_name.
 * @param id - Device object id
 * @param className - class_display_name value
 * @param type - Live object type override
 * @returns The device mock
 */
function registerDevice(
  id: string,
  className: string,
  type = "Device",
): RegisteredMockObject {
  return registerMockObject(id, {
    type: type as RegisteredMockObject["type"],
    properties: {
      class_display_name: className,
      multi_sample_mode: 0,
      parameters: children(),
    },
  });
}

/** @returns A LiveAPI handle to the registered rack */
function rack(): LiveAPI {
  return LiveAPI.from(RACK_PATH);
}

describe("resolveNestedParamTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sample write to a drum-pad slot", () => {
    it("creates a Simpler on an empty pad", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, [], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(chain.call).toHaveBeenCalledWith("insert_device", "Simpler");
      expect(target?.id).toBe("new-simpler");
    });

    it("reuses an existing Simpler without inserting a new one", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["existing-simpler"]);

      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(chain.call).not.toHaveBeenCalledWith(
        "insert_device",
        expect.anything(),
      );
      expect(target?.id).toBe("existing-simpler");
    });

    it("replaces a DrumSampler with a Simpler and emits a notice", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["ds-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerDevice("ds-1", "DrumSampler");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
      expect(chain.call).toHaveBeenCalledWith("insert_device", "Simpler");
      expect(target?.id).toBe("new-simpler");
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("replaced DrumSampler"),
      );
    });

    it("matches DrumSampler leniently (e.g. 'Drum Sampler')", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["ds-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerDevice("ds-1", "Drum Sampler");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
      expect(target?.id).toBe("new-simpler");
    });

    it("skips and warns for a non-Simpler device on the pad", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["op-1"]);

      registerDevice("op-1", "Operator");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
      expect(chain.call).not.toHaveBeenCalledWith(
        "insert_device",
        expect.anything(),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("already has a Operator"),
      );
    });

    it("warns when the pad chain can't be resolved or created", () => {
      registerRack([]);

      const target = resolveNestedParamTarget(
        rack(),
        "pZ9/d0",
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("could not resolve or create drum pad"),
      );
    });

    it("refuses to auto-create a pad chain on a non-drum rack (leaves no stray chain)", () => {
      // A plain chain-capable Rack (not a Drum Rack) addressed with a pad path:
      // the guard must warn-skip before insert_chain, or it would strand an
      // empty chain in the wrong rack.
      const rackMock = registerMockObject("rack", {
        path: RACK_PATH,
        type: "RackDevice",
        properties: {
          can_have_drum_pads: 0,
          can_have_chains: 1,
          chains: [],
        },
      });

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
      expect(rackMock.call).not.toHaveBeenCalledWith("insert_chain");
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("could not resolve or create drum pad"),
      );
    });

    it("warns when Simpler creation returns no id", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, [], {
        insert_device: () => ["id", undefined],
      });

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("failed to create a Simpler"),
      );
    });

    it("returns null when the created Simpler does not exist", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, [], {
        insert_device: () => ["id", "0"],
      });

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
    });

    it("accepts an explicit chain 0 in the prefix", () => {
      // "c0" is a valid chain index (the boundary is `< 0`, not `<= 0`): the
      // prefix must still parse as a pad slot rather than falling through to
      // general resolution.
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, ["existing-simpler"]);
      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/c0",
        "sample",
        "createDevice",
      );

      expect(target?.id).toBe("existing-simpler");
    });

    it("warns when Simpler creation returns nothing at all", () => {
      // insert_device returning undefined (not a tuple) must warn-skip, not
      // throw while indexing the missing result.
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, [], {
        insert_device: () => null,
      });

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("failed to create a Simpler"),
      );
    });

    it("defaults the device slot to 0 when only the pad is given", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, ["existing-simpler"]);
      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1",
        "sample",
        "createDevice",
      );

      expect(target?.id).toBe("existing-simpler");
    });
  });

  describe("general (non-sample) resolution", () => {
    it("resolves an existing pad device for a non-sample param", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, ["existing-simpler"]);
      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "gainDb",
        "updateDevice",
      );

      expect(target?.id).toBe("existing-simpler");
    });

    it("warns when the prefix resolves to a chain, not a device", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, []);

      const target = resolveNestedParamTarget(
        rack(),
        "pC1",
        "gainDb",
        "updateDevice",
      );

      expect(target).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("resolves to a chain"),
      );
    });

    it("warns when no device is found at the prefix", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, []);

      const target = resolveNestedParamTarget(
        rack(),
        "pC1/d0",
        "gainDb",
        "updateDevice",
      );

      expect(target).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("no device at"),
      );
    });

    it("treats a non-pad prefix as a general device path", () => {
      registerMockObject("rack", {
        path: RACK_PATH,
        type: "RackDevice",
        properties: { chains: ["id", "reg-chain"] },
      });
      registerMockObject("reg-chain", {
        type: "Chain",
        properties: { devices: ["id", "reg-dev"] },
      });
      registerDevice("reg-dev", "Operator");

      const target = resolveNestedParamTarget(
        rack(),
        "c0/d0",
        "sample",
        "updateDevice",
      );

      expect(target?.id).toBe("reg-dev");
    });
  });

  describe("malformed prefixes fall through to general resolution", () => {
    let chain: RegisteredMockObject;

    beforeEach(() => {
      registerRack(["chain-c1"]);
      chain = registerDrumChain("chain-c1", 36, [], {
        insert_device: () => ["id", "should-not-create"],
      });
    });

    it.each([
      ["", "no path before the param name"],
      ["p", "no device at"],
      ["pC1/cX", "no device at"],
      ["pC1/c-1", "no device at"],
      ["pC1/dX", "no device at"],
      ["pC1/d-1", "no device at"],
      ["pC1/d0/x", "no device at"],
    ])("does not pad-create for prefix '%s'", (prefix, message) => {
      const target = resolveNestedParamTarget(
        rack(),
        prefix,
        "sample",
        "createDevice",
      );

      expect(target).toBeNull();
      expect(chain.call).not.toHaveBeenCalledWith(
        "insert_device",
        expect.anything(),
      );
      expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining(message));
    });
  });
});
