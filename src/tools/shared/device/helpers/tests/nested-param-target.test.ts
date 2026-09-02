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
import {
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { resolveNestedParamTarget } from "../nested-param-target.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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
 * Register an instrument with a class_display_name.
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
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      multi_sample_mode: 0,
      parameters: children(),
    },
  });
}

/**
 * Register a MIDI effect, which Live sorts ahead of the instrument in a chain.
 * @param id - Device object id
 * @param className - class_display_name value
 * @returns The device mock
 */
function registerMidiEffect(
  id: string,
  className: string,
): RegisteredMockObject {
  return registerMockObject(id, {
    type: "Device",
    properties: {
      class_display_name: className,
      type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
      parameters: children(),
    },
  });
}

/**
 * Register a Simpler in multi-sample mode, whose sample the Live API can't set.
 * @param id - Device object id
 * @returns The device mock
 */
function registerMultiSampleSimpler(id: string): RegisteredMockObject {
  return registerMockObject(id, {
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      multi_sample_mode: 1,
      parameters: children(),
    },
  });
}

/** @returns A LiveAPI handle to the registered rack */
function rack(): LiveAPI {
  return LiveAPI.from(RACK_PATH);
}

/**
 * Resolve a nested param target for a `sample` write, which takes the
 * device-creating path.
 * @param prefix - The path prefix addressing a slot under the rack
 * @param force - Allow the instrument-to-Simpler swap
 * @returns The resolved target, or null when resolution warn-skips
 */
function resolveSampleTarget(prefix: string, force = false): LiveAPI | null {
  return resolveNestedParamTarget(
    rack(),
    prefix,
    "sample",
    "createDevice",
    force,
  );
}

/**
 * Assert resolution warn-skipped: it returned null and relayed a warning.
 * @param target - The value returned by resolveNestedParamTarget
 * @param message - Substring the relayed warning must contain
 */
function expectWarnedNull(target: LiveAPI | null, message: string): void {
  expect(target).toBeNull();
  expect(capturedWarnings()).toContainEqual(expect.stringContaining(message));
}

/**
 * Assert no device was inserted into the chain.
 * @param chain - The chain mock to inspect
 */
function expectNoDeviceInserted(chain: RegisteredMockObject): void {
  expect(chain.call).not.toHaveBeenCalledWith(
    "insert_device",
    expect.anything(),
  );
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

      const target = resolveSampleTarget("pC1/d0");

      expect(chain.call).toHaveBeenCalledWith("insert_device", "Simpler");
      expect(target?.id).toBe("new-simpler");
    });

    it("reuses an existing Simpler without inserting a new one", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["existing-simpler"]);

      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveSampleTarget("pC1/d0");

      expectNoDeviceInserted(chain);
      expect(target?.id).toBe("existing-simpler");
    });

    it("skips a non-Simpler instrument without force, leaving it intact", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["ds-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerDevice("ds-1", "DrumSampler");

      const target = resolveSampleTarget("pC1/d0");

      expectWarnedNull(target, "sample write SKIPPED on pad t0/d0/pC1");
      expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
      expectNoDeviceInserted(chain);
    });

    it("names force:true and the non-destructive alternatives in the skip warning", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, ["ds-1"]);
      registerDevice("ds-1", "DrumSampler");

      resolveSampleTarget("pC1/d0");

      const warning = capturedWarnings().join("\n");

      expect(warning).toContain("force:true");
      expect(warning).toContain("another pad");
      expect(warning).toContain('ppal-duplicate type:"device"');
    });

    it("replaces a non-Simpler instrument with a Simpler under force, and says so", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["ds-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerDevice("ds-1", "DrumSampler");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      const target = resolveSampleTarget("pC1/d0", true);

      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
      expect(chain.call).toHaveBeenCalledWith("insert_device", "Simpler");
      expect(target?.id).toBe("new-simpler");
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining("replaced a DrumSampler"),
      );
    });

    // force is not device-specific: any instrument whose sample the Live API
    // can't set is swappable, not just the DrumSampler that motivated the guard.
    it("skips any other instrument without force, and swaps it under force", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["op-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerDevice("op-1", "Operator");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      expectWarnedNull(resolveSampleTarget("pC1/d0"), "it holds an Operator");
      expectNoDeviceInserted(chain);

      expect(resolveSampleTarget("pC1/d0", true)?.id).toBe("new-simpler");
      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    });

    it("skips a multi-sample Simpler without force, and swaps it under force", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["ms-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerMultiSampleSimpler("ms-1");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      expectWarnedNull(
        resolveSampleTarget("pC1/d0"),
        "it holds a Simpler in multi-sample mode",
      );
      expectNoDeviceInserted(chain);

      expect(resolveSampleTarget("pC1/d0", true)?.id).toBe("new-simpler");
      expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
    });

    // Live sorts MIDI effects ahead of the instrument, so d0 is not the
    // instrument on any pad holding one. Resolving by index would target — and
    // under force delete — the wrong device.
    it("finds the instrument behind a MIDI effect rather than device 0", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["arp-1", "simpler-1"]);

      registerMidiEffect("arp-1", "Arpeggiator");
      registerDevice("simpler-1", "Simpler", "SimplerDevice");

      const target = resolveSampleTarget("pC1/d0");

      expectNoDeviceInserted(chain);
      expect(target?.id).toBe("simpler-1");
    });

    it("deletes the instrument's own index under force, not device 0", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["arp-1", "op-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerMidiEffect("arp-1", "Arpeggiator");
      registerDevice("op-1", "Operator");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      expect(resolveSampleTarget("pC1/d0", true)?.id).toBe("new-simpler");
      expect(chain.call).toHaveBeenCalledWith("delete_device", 1);
      expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
    });

    it("creates a Simpler on a pad holding only MIDI effects", () => {
      registerRack(["chain-c1"]);
      const chain = registerDrumChain("chain-c1", 36, ["arp-1"], {
        insert_device: () => ["id", "new-simpler"],
      });

      registerMidiEffect("arp-1", "Arpeggiator");
      registerDevice("new-simpler", "Simpler", "SimplerDevice");

      const target = resolveSampleTarget("pC1/d0");

      expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
      expect(target?.id).toBe("new-simpler");
    });

    it("warns when the pad chain can't be resolved or created", () => {
      registerRack([]);

      const target = resolveSampleTarget("pZ9/d0");

      expectWarnedNull(target, "could not resolve or create drum pad");
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

      const target = resolveSampleTarget("pC1/d0");

      expectWarnedNull(target, "could not resolve or create drum pad");
      expect(rackMock.call).not.toHaveBeenCalledWith("insert_chain");
    });

    it("warns when Simpler creation returns no id", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, [], {
        insert_device: () => ["id", undefined],
      });

      const target = resolveSampleTarget("pC1/d0");

      expectWarnedNull(target, "failed to create a Simpler");
    });

    it("returns null when the created Simpler does not exist", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, [], {
        insert_device: () => ["id", "0"],
      });

      const target = resolveSampleTarget("pC1/d0");

      expect(target).toBeNull();
    });

    it("accepts an explicit chain 0 in the prefix", () => {
      // "c0" is a valid chain index (the boundary is `< 0`, not `<= 0`): the
      // prefix must still parse as a pad slot rather than falling through to
      // general resolution.
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, ["existing-simpler"]);
      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveSampleTarget("pC1/c0");

      expect(target?.id).toBe("existing-simpler");
    });

    it("warns when Simpler creation returns nothing at all", () => {
      // insert_device returning undefined (not a tuple) must warn-skip, not
      // throw while indexing the missing result.
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, [], {
        insert_device: () => null,
      });

      const target = resolveSampleTarget("pC1/d0");

      expectWarnedNull(target, "failed to create a Simpler");
    });

    it("defaults the device slot to 0 when only the pad is given", () => {
      registerRack(["chain-c1"]);
      registerDrumChain("chain-c1", 36, ["existing-simpler"]);
      registerDevice("existing-simpler", "Simpler", "SimplerDevice");

      const target = resolveSampleTarget("pC1");

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

      expectWarnedNull(target, "resolves to a chain");
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

      expectWarnedNull(target, "no device at");
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
      const target = resolveSampleTarget(prefix);

      expectWarnedNull(target, message);
      expectNoDeviceInserted(chain);
    });
  });
});
