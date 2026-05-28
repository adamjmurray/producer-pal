// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "#src/tools/device/read/read-device.ts";
import {
  applySpecializedParamWrite,
  readSpecializedParams,
} from "../specialized-device-registry.ts";

/**
 * Register a mock Spectral Resonator device and return its LiveAPI.
 * @param properties - Property overrides (merged onto Spectral Resonator defaults)
 * @returns The Spectral Resonator LiveAPI object
 */
function registerSpectralResonator(
  properties: Record<string, unknown> = {},
): LiveAPI {
  registerMockObject("spectral-resonator-1", {
    type: "SpectralResonatorDevice",
    properties: {
      class_display_name: "Spectral Resonator",
      midi_gate: 0,
      mono_poly: 0,
      pitch_bend_range: 0,
      mod_mode: 0,
      pitch_mode: 0,
      polyphony: 0,
      ...properties,
    },
  });

  return LiveAPI.from("id spectral-resonator-1");
}

describe("Spectral Resonator pseudo-params", () => {
  describe("read", () => {
    it("reads all six params together with defaults", () => {
      const device = registerSpectralResonator();

      expect(readSpecializedParams(device)).toStrictEqual([
        { name: "midiGate", value: false },
        { name: "monoPoly", value: "mono" },
        { name: "pitchBendRange", value: 0 },
        { name: "modMode", value: "None" },
        { name: "pitchMode", value: "Hertz" },
        { name: "polyphony", value: 2 },
      ]);
    });

    it("reads midiGate as true when midi_gate is 1", () => {
      const device = registerSpectralResonator({ midi_gate: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "midiGate",
        value: true,
      });
    });

    it("reads midiGate as false when midi_gate is 0", () => {
      const device = registerSpectralResonator({ midi_gate: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "midiGate",
        value: false,
      });
    });

    it("reads monoPoly as mono when mono_poly is 0", () => {
      const device = registerSpectralResonator({ mono_poly: 0 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "monoPoly",
        value: "mono",
      });
    });

    it("reads monoPoly as poly when mono_poly is 1", () => {
      const device = registerSpectralResonator({ mono_poly: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "monoPoly",
        value: "poly",
      });
    });

    it("reads pitchBendRange as a numeric value", () => {
      const device = registerSpectralResonator({ pitch_bend_range: 12 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "pitchBendRange",
        value: 12,
      });
    });

    it("reads modMode by index (3 → Granular)", () => {
      const device = registerSpectralResonator({ mod_mode: 3 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "modMode",
        value: "Granular",
      });
    });

    it("reads pitchMode by index (1 → MIDI Note)", () => {
      const device = registerSpectralResonator({ pitch_mode: 1 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "pitchMode",
        value: "MIDI Note",
      });
    });

    it("reads polyphony as a voice count (index 2 → 8)", () => {
      const device = registerSpectralResonator({ polyphony: 2 });

      expect(readSpecializedParams(device)).toContainEqual({
        name: "polyphony",
        value: 8,
      });
    });
  });

  describe("write midiGate", () => {
    it("writes 1 for true", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "midiGate", "true", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("midi_gate", 1);
    });

    it("writes 0 for false", () => {
      const device = registerSpectralResonator({ midi_gate: 1 });

      applySpecializedParamWrite(device, "midiGate", "off", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("midi_gate", 0);
    });

    it("writes 1 for numeric 1", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "midiGate", 1, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("midi_gate", 1);
    });

    it("warns and skips an invalid midiGate value", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "midiGate", "maybe", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("midiGate"),
      );
    });
  });

  describe("write monoPoly", () => {
    it("maps the enum label 'mono' to index 0", () => {
      const device = registerSpectralResonator({ mono_poly: 1 });

      applySpecializedParamWrite(device, "monoPoly", "mono", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mono_poly", 0);
    });

    it("maps the enum label 'poly' to index 1", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "monoPoly", "poly", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mono_poly", 1);
    });

    it("is case-insensitive on the param name", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "monopoly", "poly", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mono_poly", 1);
    });

    it("warns and skips an invalid monoPoly label", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "monoPoly", "stereo", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid monoPoly"),
      );
    });
  });

  describe("write pitchBendRange", () => {
    it("sets pitch_bend_range when value is in range", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", 12, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 12);
    });

    it("sets pitch_bend_range at the minimum boundary (0)", () => {
      const device = registerSpectralResonator({ pitch_bend_range: 12 });

      applySpecializedParamWrite(device, "pitchBendRange", 0, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 0);
    });

    it("sets pitch_bend_range at the maximum boundary (24)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", 24, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 24);
    });

    it("warns and skips when pitchBendRange is above range (25)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", 25, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("pitchBendRange"),
      );
    });

    it("warns and skips when pitchBendRange is below range (-1)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", -1, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("pitchBendRange"),
      );
    });

    it("warns and skips when pitchBendRange is a non-integer", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", 1.5, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("pitchBendRange"),
      );
    });
  });

  describe("write modMode", () => {
    it("maps the enum label 'Wander' to index 2", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "modMode", "Wander", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mod_mode", 2);
    });

    it("maps 'None' to index 0", () => {
      const device = registerSpectralResonator({ mod_mode: 2 });

      applySpecializedParamWrite(device, "modMode", "None", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mod_mode", 0);
    });

    it("maps 'Granular' to index 3", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "modMode", "Granular", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("mod_mode", 3);
    });

    it("warns and skips an invalid modMode label", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "modMode", "Reverb", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid modMode"),
      );
    });
  });

  describe("write pitchMode", () => {
    it("maps 'Hertz' to index 0", () => {
      const device = registerSpectralResonator({ pitch_mode: 1 });

      applySpecializedParamWrite(device, "pitchMode", "Hertz", "updateDevice");

      expect(device.set).toHaveBeenCalledWith("pitch_mode", 0);
    });

    it("maps 'MIDI Note' to index 1", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(
        device,
        "pitchMode",
        "MIDI Note",
        "updateDevice",
      );

      expect(device.set).toHaveBeenCalledWith("pitch_mode", 1);
    });

    it("warns and skips an invalid pitchMode label", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchMode", "Cents", "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("not a valid pitchMode"),
      );
    });
  });

  describe("write polyphony", () => {
    it("maps a voice count to its index (8 → 2)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "polyphony", 8, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("polyphony", 2);
    });

    it("maps the minimum count (2 → index 0)", () => {
      const device = registerSpectralResonator({ polyphony: 3 });

      applySpecializedParamWrite(device, "polyphony", 2, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("polyphony", 0);
    });

    it("maps the maximum count (16 → index 3)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "polyphony", 16, "updateDevice");

      expect(device.set).toHaveBeenCalledWith("polyphony", 3);
    });

    it("warns and skips a count not in the set (e.g. 3)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "polyphony", 3, "updateDevice");

      expect(device.set).not.toHaveBeenCalled();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("polyphony"),
      );
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Spectral Resonator contributes no
// modulations/options.
describe("Spectral Resonator via read-device", () => {
  /**
   * Register a fully-readable mock Spectral Resonator audio effect by ID.
   * @param properties - Property overrides
   */
  function registerReadableSpectralResonator(
    properties: Record<string, unknown> = {},
  ): void {
    registerMockObject("spectral-resonator-1", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: "Spectral Resonator",
        class_display_name: "Spectral Resonator",
        type: 2,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        midi_gate: 1,
        mono_poly: 1,
        pitch_bend_range: 12,
        mod_mode: 2,
        pitch_mode: 1,
        polyphony: 3,
        ...properties,
      },
    });
  }

  it("includes all six pseudo-params in parameters and omits modulations", () => {
    registerReadableSpectralResonator();

    const result = readDevice({
      deviceId: "spectral-resonator-1",
      include: ["params"],
    });

    expect(result.parameters).toStrictEqual([
      { name: "midiGate", value: true },
      { name: "monoPoly", value: "poly" },
      { name: "pitchBendRange", value: 12 },
      { name: "modMode", value: "Wander" },
      { name: "pitchMode", value: "MIDI Note" },
      { name: "polyphony", value: 16 },
    ]);
    expect(result.modulations).toBeUndefined();
  });

  it("surfaces pseudo-param valid values under options.paramOptions", () => {
    registerReadableSpectralResonator();

    const result = readDevice({
      deviceId: "spectral-resonator-1",
      include: ["options"],
    });

    expect(
      (result.options as Record<string, unknown>).paramOptions,
    ).toStrictEqual({
      monoPoly: ["mono", "poly"],
      pitchBendRange: "0-24",
      modMode: ["None", "Chorus", "Wander", "Granular"],
      pitchMode: ["Hertz", "MIDI Note"],
      polyphony: [2, 4, 8, 16],
    });
  });
});
