// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `instrument` field: an Instrument Rack names the instruments inside it,
// so "Instrument Rack" on its own only survives when the rack really plays
// nothing.

import { describe, expect, it } from "vitest";
import {
  livePath,
  type TrackPath,
} from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readOneTrack } from "../../read-track.ts";

type DevicePath = ReturnType<TrackPath["device"]>;

/** One device in a fixture tree. */
type DeviceSpec =
  | { kind: "instrument"; name: string }
  | { kind: "midi-effect"; name: string }
  | { kind: "drum-rack" }
  | { kind: "rack"; chains: DeviceSpec[][] };

/**
 * A plain instrument device
 * @param name - Its Live class display name
 * @returns The spec
 */
function instrument(name: string): DeviceSpec {
  return { kind: "instrument", name };
}

/**
 * A MIDI effect device
 * @param name - Its Live class display name
 * @returns The spec
 */
function midiEffect(name: string): DeviceSpec {
  return { kind: "midi-effect", name };
}

/**
 * A Drum Rack device
 * @returns The spec
 */
function drumRack(): DeviceSpec {
  return { kind: "drum-rack" };
}

/**
 * An Instrument Rack device
 * @param chains - One device list per chain
 * @returns The spec
 */
function rack(...chains: DeviceSpec[][]): DeviceSpec {
  return { kind: "rack", chains };
}

let nextMockId = 0;

/**
 * Register a track on track 0 whose devices are the given specs.
 * @param devices - The track's devices, in order
 */
function setupTrackDevices(devices: DeviceSpec[]): void {
  nextMockId = 0;

  const deviceIds = devices.map((spec, index) =>
    registerDevice(spec, livePath.track(0).device(index)),
  );

  setupTrackMock({
    trackId: "track1",
    properties: { devices: children(...deviceIds) },
  });
}

/**
 * Register one device and everything under it.
 * @param spec - What the device is
 * @param path - Where it sits
 * @returns The mock id it was registered under
 */
function registerDevice(spec: DeviceSpec, path: DevicePath): string {
  const id = `mock${String(nextMockId++)}`;
  const chainIds =
    spec.kind === "rack"
      ? spec.chains.map((chainDevices, chainIndex) =>
          registerChain(chainDevices, path.chain(chainIndex), chainIndex),
        )
      : [];

  registerMockObject(id, {
    path: String(path),
    type: "Device",
    properties: {
      ...deviceProperties(spec),
      chains: children(...chainIds),
      return_chains: [],
    },
  });

  return id;
}

/**
 * The Live properties `getDeviceType` and the instrument naming read.
 * @param spec - What the device is
 * @returns Mock properties
 */
function deviceProperties(spec: DeviceSpec): Record<string, unknown> {
  switch (spec.kind) {
    case "instrument":
      return {
        class_display_name: spec.name,
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        can_have_chains: 0,
        can_have_drum_pads: 0,
      };
    case "midi-effect":
      return {
        class_display_name: spec.name,
        type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
        can_have_chains: 0,
        can_have_drum_pads: 0,
      };
    case "drum-rack":
      return {
        class_display_name: "Drum Rack",
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        can_have_chains: 1,
        can_have_drum_pads: 1,
      };
    default:
      return {
        class_display_name: "Instrument Rack",
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        can_have_chains: 1,
        can_have_drum_pads: 0,
      };
  }
}

/**
 * Register one rack chain and its devices.
 * @param devices - Devices on the chain, in order
 * @param path - Where the chain sits
 * @param chainIndex - Its index, used for the chain name
 * @returns The mock id it was registered under
 */
function registerChain(
  devices: DeviceSpec[],
  path: { device: (index: number) => DevicePath; toString: () => string },
  chainIndex: number,
): string {
  const id = `mock${String(nextMockId++)}`;
  const deviceIds = devices.map((spec, index) =>
    registerDevice(spec, path.device(index)),
  );

  registerMockObject(id, {
    path: String(path),
    type: "Chain",
    properties: {
      name: `Chain ${String(chainIndex)}`,
      devices: children(...deviceIds),
    },
  });

  return id;
}

/**
 * Read track 0's instrument field.
 * @param devices - The track's devices, in order
 * @returns The instrument field
 */
function instrumentField(devices: DeviceSpec[]): unknown {
  setupTrackDevices(devices);

  return readOneTrack({ trackIndex: 0 }).instrument;
}

describe("readOneTrack instrument field", () => {
  it("names a plain instrument", () => {
    expect(instrumentField([instrument("Operator")])).toBe("Operator");
  });

  it("finds the instrument behind a MIDI effect", () => {
    expect(
      instrumentField([midiEffect("Arpeggiator"), instrument("Operator")]),
    ).toBe("Operator");
  });

  it("leaves a Drum Rack as a Drum Rack", () => {
    expect(instrumentField([drumRack()])).toBe("Drum Rack");
  });

  it("names the one instrument inside an Instrument Rack", () => {
    expect(instrumentField([rack([instrument("Operator")])])).toBe(
      "Instrument Rack (Operator)",
    );
  });

  it("names several distinct instruments in chain order", () => {
    expect(
      instrumentField([
        rack([instrument("Operator")], [instrument("Wavetable")]),
      ]),
    ).toBe("Instrument Rack (Operator, Wavetable)");
  });

  it("names a repeated instrument once", () => {
    expect(
      instrumentField([
        rack(
          [instrument("Operator")],
          [instrument("Wavetable")],
          [instrument("Operator")],
        ),
      ]),
    ).toBe("Instrument Rack (Operator, Wavetable)");
  });

  it("caps the list at four and counts the rest", () => {
    const names = [
      "Analog",
      "Collision",
      "Drift",
      "Electric",
      "Meld",
      "Operator",
      "Wavetable",
    ];

    expect(
      instrumentField([rack(...names.map((name) => [instrument(name)]))]),
    ).toBe("Instrument Rack (Analog, Collision, Drift, Electric, +3)");
  });

  it("reaches through a nested Instrument Rack to the instrument", () => {
    expect(instrumentField([rack([rack([rack([instrument("Meld")])])])])).toBe(
      "Instrument Rack (Meld)",
    );
  });

  it("stops at a nested Drum Rack instead of listing its pads", () => {
    expect(instrumentField([rack([drumRack()])])).toBe(
      "Instrument Rack (Drum Rack)",
    );
  });

  it("stops descending past the rack nesting limit", () => {
    // Five Instrument Racks deep: the walk names the fifth rather than opening
    // it, so a pathological Set costs a bounded number of reads.
    expect(
      instrumentField([
        rack([rack([rack([rack([rack([instrument("Meld")])])])])]),
      ]),
    ).toBe("Instrument Rack (Instrument Rack)");
  });

  it("stays plain for a rack with no chains", () => {
    expect(instrumentField([rack()])).toBe("Instrument Rack");
  });

  it("stays plain for a rack whose chains are empty", () => {
    expect(instrumentField([rack([], [])])).toBe("Instrument Rack");
  });

  it("stays plain for a rack whose chains hold only MIDI effects", () => {
    expect(instrumentField([rack([midiEffect("Arpeggiator")])])).toBe(
      "Instrument Rack",
    );
  });

  it("skips a MIDI-effect-only chain and names the chain that plays", () => {
    expect(
      instrumentField([
        rack([midiEffect("Arpeggiator")], [instrument("Wavetable")]),
      ]),
    ).toBe("Instrument Rack (Wavetable)");
  });

  it("omits the field when the track has no instrument", () => {
    expect(instrumentField([midiEffect("Arpeggiator")])).toBeUndefined();
  });
});
