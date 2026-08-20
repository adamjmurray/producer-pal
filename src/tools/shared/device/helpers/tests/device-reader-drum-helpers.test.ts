// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATE } from "#src/tools/constants.ts";
import {
  processDrumPads,
  updateDrumPadSoloStates,
} from "../device-reader-drum-helpers.ts";
import { deviceHasInstrument } from "../device-state-helpers.ts";

// Mock device-path-helpers
vi.mock(import("../path/device-path-helpers.ts"), () => ({
  extractDevicePath: vi.fn((path) => path),
}));

// Mock device-state-helpers. Both builders surface a chain's `_state` (a
// test-only marker on the mock chain), mirroring how the real helpers derive
// mute/solo state — so buildDrumPadFromChains can aggregate it. "active" is
// STATE.ACTIVE spelled out: a vi.mock factory is hoisted above the imports.
vi.mock(import("../device-state-helpers.ts"), () => ({
  buildChainInfo: vi.fn((chain, options) => ({
    id: chain._id,
    name: chain.getProperty("name"),
    ...(chain._state !== undefined ? { state: chain._state } : {}),
    ...options,
  })),
  computeState: vi.fn((chain) => chain._state ?? "active"),
  deviceHasInstrument: vi.fn(() => true),
}));

// Test helper for creating drum pads with optional state
const pad = (note: number, pitch: string, name: string, state?: string) =>
  state !== undefined ? { note, pitch, name, state } : { note, pitch, name };

// Helper to assert pad states after calling updateDrumPadSoloStates
type DrumPadInput = {
  note: number;
  pitch: string;
  name: string;
  state?: string;
};

const expectSoloStates = (
  drumPads: DrumPadInput[],
  expectedStates: (string | undefined)[],
) => {
  updateDrumPadSoloStates(drumPads);

  for (const [i, expected] of expectedStates.entries()) {
    if (expected === undefined) {
      expect(drumPads[i]!.state).toBeUndefined();
    } else {
      expect(drumPads[i]!.state).toBe(expected);
    }
  }
};

describe("device-reader-drum-helpers", () => {
  describe("updateDrumPadSoloStates", () => {
    it("should not modify pads when none are soloed", () => {
      expectSoloStates(
        [pad(36, "C1", "Kick"), pad(37, "C#1", "Snare")],
        [undefined, undefined],
      );
    });

    it("should keep soloed pads as soloed and mute others via solo", () => {
      expectSoloStates(
        [
          pad(36, "C1", "Kick", STATE.SOLOED),
          pad(37, "C#1", "Snare"),
          pad(38, "D1", "Clap"),
        ],
        [STATE.SOLOED, STATE.MUTED_VIA_SOLO, STATE.MUTED_VIA_SOLO],
      );
    });

    it("should mark already-muted pads as muted_also_via_solo when others are soloed", () => {
      expectSoloStates(
        [
          pad(36, "C1", "Kick", STATE.SOLOED),
          pad(37, "C#1", "Snare", STATE.MUTED),
          pad(38, "D1", "Clap"),
        ],
        [STATE.SOLOED, STATE.MUTED_ALSO_VIA_SOLO, STATE.MUTED_VIA_SOLO],
      );
    });

    it("should handle multiple soloed pads", () => {
      expectSoloStates(
        [
          pad(36, "C1", "Kick", STATE.SOLOED),
          pad(37, "C#1", "Snare", STATE.SOLOED),
          pad(38, "D1", "Clap"),
        ],
        [STATE.SOLOED, STATE.SOLOED, STATE.MUTED_VIA_SOLO],
      );
    });

    it("should not modify pads when only muted pads exist", () => {
      expectSoloStates(
        [pad(36, "C1", "Kick", STATE.MUTED), pad(37, "C#1", "Snare")],
        [STATE.MUTED, undefined],
      );
    });
  });

  describe("processDrumPads", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    interface DrumPadInfoResult {
      id?: string;
      note: number;
      pitch: string | null;
      name?: string;
      state?: string;
      hasInstrument?: boolean;
      chains?: unknown[];
    }

    interface DeviceInfoResult {
      drumPads?: DrumPadInfoResult[];
      _processedDrumPads?: DrumPadInfoResult[];
      [key: string]: unknown;
    }

    interface ChainConfig {
      inNote: number;
      name: string;
      state?: string;
    }

    // Helper to create mock chain
    const createMockChain = (inNote: number, name = "Chain", state?: string) =>
      ({
        _id: `chain-${inNote}`,
        _state: state,
        getProperty: vi.fn((prop: string) => {
          if (prop === "in_note") return inNote;
          if (prop === "name") return name;
          if (prop === "mute") return 0;
          if (prop === "solo") return 0;

          return null;
        }),
        // One device, so instrument detection has something to inspect
        getChildren: vi.fn((child: string) =>
          child === "devices" ? [{ id: `device-${inNote}` }] : [],
        ),
        getChildCount: vi.fn((child: string) => (child === "devices" ? 1 : 0)),
        someChild: vi.fn(
          (child: string, predicate: (device: unknown) => boolean) =>
            child === "devices" && predicate({ id: `device-${inNote}` }),
        ),
      }) as Record<string, unknown>;

    // Helper to create mock device. padsByNote is the rack's own drum_pads,
    // keyed by the note each answers to; a rack nested in a drum pad has none.
    const createMockDevice = (
      chainConfigs: ChainConfig[],
      padsByNote: Record<number, string> = {},
    ) => ({
      path: "live_set tracks 0 devices 0",
      getChildren: vi.fn((child: string) =>
        child === "drum_pads"
          ? drumPadMocks(padsByNote)
          : chainConfigs.map((config) =>
              createMockChain(config.inNote, config.name, config.state),
            ),
      ),
      // Live lists a pad for all 128 notes, in note order. These fixtures list
      // only the pads they care about, so the reader's note-order check fails
      // and it falls back to asking each pad its note — the path these cover.
      getChildIds: vi.fn((child: string) =>
        child === "drum_pads" ? Object.values(padsByNote) : [],
      ),
    });

    /**
     * The rack's pads as the reader sees them.
     * @param padsByNote - Pad id keyed by the note it answers to
     * @returns Mock pads, each answering with its own note
     */
    const drumPadMocks = (padsByNote: Record<number, string>) =>
      Object.entries(padsByNote).map(([note, id]) => ({
        id,
        getProperty: vi.fn(() => Number(note)),
      }));

    // Helper for common test setup
    const setupAndProcess = (
      chainConfigs: ChainConfig[],
      includeChains = false,
      includeDrumPads = true,
      padsByNote: Record<number, string> = {},
    ): DeviceInfoResult => {
      const device = createMockDevice(chainConfigs, padsByNote);
      const deviceInfo: DeviceInfoResult = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(
        device as unknown as LiveAPI,
        deviceInfo,
        includeChains,
        includeDrumPads,
        0,
        2,
        readDeviceFn,
      );

      return deviceInfo;
    };

    it("should process chains with note-specific in_note", () => {
      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Kick" }]);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.note).toBe(36);
      expect(deviceInfo.drumPads![0]!.pitch).toBe("C1");
    });

    it("names each pad by the id of the rack's pad for that note", () => {
      const deviceInfo = setupAndProcess(
        [{ inNote: 36, name: "Kick" }],
        false,
        true,
        {
          36: "pad-36",
        },
      );

      expect(deviceInfo.drumPads![0]!.id).toBe("pad-36");
    });

    it("omits id for a rack with no pads of its own", () => {
      // A Drum Rack nested in a drum pad has only chains, so its "pads" can't
      // be named by id — and the absence is how a caller knows.
      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Kick" }]);

      expect(deviceInfo.drumPads![0]).not.toHaveProperty("id");
    });

    it("omits id for the catch-all pad, which no pad backs", () => {
      const deviceInfo = setupAndProcess(
        [{ inNote: -1, name: "Catch All" }],
        false,
        true,
        {
          36: "pad-36",
        },
      );

      expect(deviceInfo.drumPads![0]).not.toHaveProperty("id");
    });

    it("should process chains with catch-all in_note (-1)", () => {
      const deviceInfo = setupAndProcess([{ inNote: -1, name: "Catch All" }]);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.note).toBe(-1);
      expect(deviceInfo.drumPads![0]!.pitch).toBe("*");
    });

    it("should aggregate a muted state onto the drum pad", () => {
      const deviceInfo = setupAndProcess([
        { inNote: 36, name: "Kick", state: STATE.MUTED },
      ]);

      expect(deviceInfo.drumPads![0]!.state).toBe(STATE.MUTED);
    });

    it("should prefer soloed over muted when a pad has both states across chains", () => {
      // Two layered chains on the same pad: one soloed, one muted. The pad
      // surfaces SOLOED (solo wins over mute in the aggregation).
      const deviceInfo = setupAndProcess([
        { inNote: 36, name: "Kick Solo", state: STATE.SOLOED },
        { inNote: 36, name: "Kick Mute", state: STATE.MUTED },
      ]);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.state).toBe(STATE.SOLOED);
    });

    it("should leave state unset when no chain is muted or soloed", () => {
      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Kick" }]);

      expect(deviceInfo.drumPads![0]!.state).toBeUndefined();
    });

    it("should sort drum pads by note with catch-all at end", () => {
      const deviceInfo = setupAndProcess([
        { inNote: -1, name: "Catch All" },
        { inNote: 48, name: "Hi Note" },
        { inNote: 36, name: "Low Note" },
      ]);

      expect(deviceInfo.drumPads).toHaveLength(3);
      expect(deviceInfo.drumPads![0]!.note).toBe(36);
      expect(deviceInfo.drumPads![1]!.note).toBe(48);
      expect(deviceInfo.drumPads![2]!.note).toBe(-1); // catch-all at end
    });

    it("should include chains when includeDrumPads and includeChains are both true", () => {
      const deviceInfo = setupAndProcess(
        [{ inNote: 36, name: "Kick" }],
        true,
        true,
      );

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.chains).toBeDefined();
    });

    it("should not include drumPads in deviceInfo when includeDrumPads is false", () => {
      const deviceInfo = setupAndProcess(
        [{ inNote: 36, name: "Kick" }],
        false,
        false,
      );

      expect(deviceInfo.drumPads).toBeUndefined();
      expect(deviceInfo._processedDrumPads).toBeDefined(); // internal tracking still happens
    });

    it("should group multiple chains with same in_note", () => {
      const mockChains = [
        createMockChain(36, "Kick Layer 1"),
        createMockChain(36, "Kick Layer 2"),
      ];
      const device = {
        path: "live_set tracks 0 devices 0",
        getChildren: vi.fn(() => mockChains),
        getChildIds: vi.fn(() => []),
      };
      const deviceInfo: DeviceInfoResult = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(
        device as unknown as LiveAPI,
        deviceInfo,
        false,
        true,
        0,
        2,
        readDeviceFn,
      );

      // Should have only one drum pad (chains are grouped)
      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.note).toBe(36);
    });

    // Chain whose getChildren("devices") is non-empty, so processDrumRackChain
    // expands nested devices (exercising the include-flag && expressions).
    const createChainWithDevice = (inNote: number) =>
      ({
        _id: `chain-${inNote}`,
        getProperty: vi.fn((prop: string) => {
          if (prop === "in_note") return inNote;
          if (prop === "name") return "Layer";

          return null;
        }),
        getChildren: vi.fn((child: string) =>
          child === "devices" ? [{ id: "nested" }] : [],
        ),
        getChildCount: vi.fn((child: string) => (child === "devices" ? 1 : 0)),
        someChild: vi.fn(
          (child: string, predicate: (device: unknown) => boolean) =>
            child === "devices" && predicate({ id: "nested" }),
        ),
      }) as Record<string, unknown>;

    /**
     * Run processDrumPads over one chain holding one device.
     * @param includeDrumPads - Whether the pads themselves are returned
     * @returns The readDeviceFn spy, to assert what the walk descended into
     */
    const processOneChain = (includeDrumPads: boolean) => {
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));
      const device = {
        path: "live_set tracks 0 devices 0",
        getChildren: vi.fn(() => [createChainWithDevice(36)]),
        getChildIds: vi.fn(() => []),
      };

      processDrumPads(
        device as unknown as LiveAPI,
        {},
        true,
        includeDrumPads,
        0,
        2,
        readDeviceFn,
      );

      return readDeviceFn;
    };

    it("expands a shown chain's devices, and lets them expand too", () => {
      expect(processOneChain(true)).toHaveBeenCalledWith(
        { id: "nested" },
        expect.objectContaining({
          includeChains: true,
          includeDrumPads: true,
        }),
      );
    });

    it("does not read the devices of a chain the pad won't show", () => {
      // Nothing under an unshown chain reaches the output, so reading it is
      // pure cost — a pad only needs whether an instrument is in there.
      expect(processOneChain(false)).not.toHaveBeenCalled();
    });

    it.each([
      { order: "already-ascending", notes: [36, 48] },
      { order: "reversed", notes: [48, 36] },
    ])(
      "sorts note pads by note from $order input",
      ({ notes }: { notes: number[] }) => {
        // Both insertion orders matter: the comparator must fall through to the
        // note-difference tail rather than answering from a catch-all check.
        const deviceInfo = setupAndProcess(
          notes.map((inNote) => ({ inNote, name: `Pad ${String(inNote)}` })),
        );

        expect(deviceInfo.drumPads!.map((p) => p.note)).toStrictEqual([36, 48]);
      },
    );

    it("sorts a catch-all pad after a note pad when it is not first (aNote===-1 branch)", () => {
      // Insertion order note-first, catch-all-second forces the sort comparator
      // to be called with the catch-all as its first argument.
      const deviceInfo = setupAndProcess([
        { inNote: 36, name: "Low Note" },
        { inNote: -1, name: "Catch All" },
      ]);

      expect(deviceInfo.drumPads!.map((p) => p.note)).toStrictEqual([36, -1]);
    });

    it("should handle invalid in_note values outside MIDI range", () => {
      // Test with an invalid MIDI note (> 127) that's not the catch-all -1
      // This exercises the fallback path when midiToNoteName returns null
      const deviceInfo = setupAndProcess([
        { inNote: 200, name: "Invalid Note" },
      ]);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.note).toBe(200);
      // midiToNoteName returns null for invalid MIDI notes
      expect(deviceInfo.drumPads![0]!.pitch).toBeNull();
    });

    // The mocked extractDevicePath is the identity, so parentPath is the mock
    // device's raw Live API path and chain paths are built onto it.
    const PARENT = "live_set tracks 0 devices 0";

    /**
     * Read the `path` of a pad's chain at the given index.
     * @param deviceInfo - processDrumPads output
     * @param chainIndex - Index within the pad's chains
     * @returns The chain's path
     */
    const chainPathAt = (deviceInfo: DeviceInfoResult, chainIndex: number) =>
      (deviceInfo.drumPads![0]!.chains![chainIndex] as { path: string }).path;

    it("builds a note-named chain path for a note-specific pad", () => {
      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Kick" }], true);

      expect(chainPathAt(deviceInfo, 0)).toBe(`${PARENT}/pC1/c0`);
    });

    it("builds a catch-all chain path for the catch-all pad", () => {
      const deviceInfo = setupAndProcess([{ inNote: -1, name: "All" }], true);

      expect(chainPathAt(deviceInfo, 0)).toBe(`${PARENT}/p*/c0`);
    });

    it("falls back to a catch-all chain path when the note is out of MIDI range", () => {
      // midiToNoteName(200) is null — the path must degrade to the catch-all
      // form rather than interpolating a null note name.
      const deviceInfo = setupAndProcess([{ inNote: 200, name: "Bad" }], true);

      expect(chainPathAt(deviceInfo, 0)).toBe(`${PARENT}/p*/c0`);
    });

    it("indexes layered chains of one pad by their position within the note group", () => {
      const deviceInfo = setupAndProcess(
        [
          { inNote: 36, name: "Kick Layer 1" },
          { inNote: 36, name: "Kick Layer 2" },
        ],
        true,
      );

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads![0]!.chains).toHaveLength(2);
      expect(chainPathAt(deviceInfo, 0)).toBe(`${PARENT}/pC1/c0`);
      expect(chainPathAt(deviceInfo, 1)).toBe(`${PARENT}/pC1/c1`);
    });

    it("strips internal tracking properties from exposed pad chains", () => {
      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Kick" }], true);

      const chain = deviceInfo.drumPads![0]!.chains![0] as Record<
        string,
        unknown
      >;

      expect(chain).not.toHaveProperty("_inNote");
      expect(chain).not.toHaveProperty("_hasInstrument");
      expect(chain.name).toBe("Kick");
    });

    it("omits pad chains when includeChains is false", () => {
      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Kick" }], false);

      expect(deviceInfo.drumPads![0]!.chains).toBeUndefined();
    });

    it("reports deviceCount at the depth limit but still detects the instrument", () => {
      const device = createMockDevice([{ inNote: 36, name: "Kick" }]);
      const deviceInfo: DeviceInfoResult = {};

      // depth === maxDepth → chains report deviceCount instead of expanding.
      // Detection asks Live rather than the expanded tree, so it survives that:
      // reporting no-instrument here dropped nested racks from the drum map.
      processDrumPads(
        device as unknown as LiveAPI,
        deviceInfo,
        true,
        true,
        2,
        2,
        vi.fn(() => ({ type: "instrument: Simpler" })),
      );

      expect(chainPathAt(deviceInfo, 0)).toBe(`${PARENT}/pC1/c0`);
      expect(deviceInfo.drumPads![0]!.hasInstrument).toBeUndefined();
    });

    it("flags a pad whose chain holds no instrument", () => {
      vi.mocked(deviceHasInstrument).mockReturnValueOnce(false);

      const deviceInfo = setupAndProcess([{ inNote: 36, name: "Empty" }]);

      expect(deviceInfo.drumPads![0]!.hasInstrument).toBe(false);
    });

    it("passes the nested device path and incremented depth to readDevice", () => {
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));
      const device = {
        path: PARENT,
        getChildren: vi.fn(() => [createChainWithDevice(36)]),
        getChildIds: vi.fn(() => []),
      };

      processDrumPads(
        device as unknown as LiveAPI,
        {},
        true,
        true,
        0,
        2,
        readDeviceFn,
      );

      expect(readDeviceFn).toHaveBeenCalledWith(
        { id: "nested" },
        expect.objectContaining({
          parentPath: `${PARENT}/pC1/c0/d0`,
          depth: 1,
        }),
      );
    });

    it("keeps hasInstrument unset when only some layered chains have an instrument", () => {
      // some() semantics: one instrument anywhere on the pad is enough, so the
      // pad must NOT be flagged hasInstrument: false.
      vi.mocked(deviceHasInstrument)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const deviceInfo = setupAndProcess([
        { inNote: 36, name: "Kick Layer 1" },
        { inNote: 36, name: "Kick Layer 2" },
      ]);

      expect(deviceInfo.drumPads![0]!.hasInstrument).toBeUndefined();
    });
  });
});
