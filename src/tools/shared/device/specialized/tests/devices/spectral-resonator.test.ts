// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import {
  readableDeviceMock,
  specializedDeviceMock,
} from "../specialized-device-mocks.ts";
import { readOneDevice } from "#src/tools/device/read/read-device.ts";
import {
  applySpecializedParamWrite,
  readSpecializedParams,
} from "../../specialized-device-registry.ts";
import { registerMonoPolyWriteTests } from "../mono-poly-test-helpers.ts";
import { expectWriteRefused } from "../refused-write-assertions.ts";

const registerSpectralResonator = specializedDeviceMock(
  "spectral-resonator-1",
  "SpectralResonatorDevice",
  {
    class_display_name: "Spectral Resonator",
    midi_gate: 0,
    mono_poly: 0,
    pitch_bend_range: 0,
    mod_mode: 0,
    pitch_mode: 0,
    polyphony: 0,
  },
);

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

      applySpecializedParamWrite(device, "midiGate", "true");

      expect(device.set).toHaveBeenCalledWith("midi_gate", 1);
    });

    it("writes 0 for false", () => {
      const device = registerSpectralResonator({ midi_gate: 1 });

      applySpecializedParamWrite(device, "midiGate", "off");

      expect(device.set).toHaveBeenCalledWith("midi_gate", 0);
    });

    it("writes 1 for numeric 1", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "midiGate", 1);

      expect(device.set).toHaveBeenCalledWith("midi_gate", 1);
    });

    it("refuses an invalid midiGate value", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "midiGate", "maybe"),
        "midiGate",
        "midiGate",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });

  registerMonoPolyWriteTests(registerSpectralResonator);

  describe("write pitchBendRange", () => {
    it("sets pitch_bend_range when value is in range", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", 12);

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 12);
    });

    it("sets pitch_bend_range at the minimum boundary (0)", () => {
      const device = registerSpectralResonator({ pitch_bend_range: 12 });

      applySpecializedParamWrite(device, "pitchBendRange", 0);

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 0);
    });

    it("sets pitch_bend_range at the maximum boundary (24)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchBendRange", 24);

      expect(device.set).toHaveBeenCalledWith("pitch_bend_range", 24);
    });

    it("refuses when pitchBendRange is above range (25)", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "pitchBendRange", 25),
        "pitchBendRange",
        "pitchBendRange",
      );

      expect(device.set).not.toHaveBeenCalled();
    });

    it("refuses when pitchBendRange is below range (-1)", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "pitchBendRange", -1),
        "pitchBendRange",
        "pitchBendRange",
      );

      expect(device.set).not.toHaveBeenCalled();
    });

    it("refuses when pitchBendRange is a non-integer", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "pitchBendRange", 1.5),
        "pitchBendRange",
        "pitchBendRange",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });

  describe("write modMode", () => {
    it("maps the enum label 'Wander' to index 2", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "modMode", "Wander");

      expect(device.set).toHaveBeenCalledWith("mod_mode", 2);
    });

    it("maps 'None' to index 0", () => {
      const device = registerSpectralResonator({ mod_mode: 2 });

      applySpecializedParamWrite(device, "modMode", "None");

      expect(device.set).toHaveBeenCalledWith("mod_mode", 0);
    });

    it("maps 'Granular' to index 3", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "modMode", "Granular");

      expect(device.set).toHaveBeenCalledWith("mod_mode", 3);
    });

    it("refuses an invalid modMode label", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "modMode", "Reverb"),
        "modMode",
        "not a valid modMode",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });

  describe("write pitchMode", () => {
    it("maps 'Hertz' to index 0", () => {
      const device = registerSpectralResonator({ pitch_mode: 1 });

      applySpecializedParamWrite(device, "pitchMode", "Hertz");

      expect(device.set).toHaveBeenCalledWith("pitch_mode", 0);
    });

    it("maps 'MIDI Note' to index 1", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "pitchMode", "MIDI Note");

      expect(device.set).toHaveBeenCalledWith("pitch_mode", 1);
    });

    it("refuses an invalid pitchMode label", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "pitchMode", "Cents"),
        "pitchMode",
        "not a valid pitchMode",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });

  describe("write polyphony", () => {
    it("maps a voice count to its index (8 → 2)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "polyphony", 8);

      expect(device.set).toHaveBeenCalledWith("polyphony", 2);
    });

    it("maps the minimum count (2 → index 0)", () => {
      const device = registerSpectralResonator({ polyphony: 3 });

      applySpecializedParamWrite(device, "polyphony", 2);

      expect(device.set).toHaveBeenCalledWith("polyphony", 0);
    });

    it("maps the maximum count (16 → index 3)", () => {
      const device = registerSpectralResonator();

      applySpecializedParamWrite(device, "polyphony", 16);

      expect(device.set).toHaveBeenCalledWith("polyphony", 3);
    });

    it("refuses a count not in the set (e.g. 3)", () => {
      const device = registerSpectralResonator();

      expectWriteRefused(
        applySpecializedParamWrite(device, "polyphony", 3),
        "polyphony",
        "polyphony",
      );

      expect(device.set).not.toHaveBeenCalled();
    });
  });
});

// Integration through the read-device tool: confirms pseudo-params surface in
// the `parameters` output and that Spectral Resonator contributes no
// modulations/options.
describe("Spectral Resonator via read-device", () => {
  const registerReadableSpectralResonator = readableDeviceMock(
    "spectral-resonator-1",
    "Spectral Resonator",
    2,
    {
      midi_gate: 1,
      mono_poly: 1,
      pitch_bend_range: 12,
      mod_mode: 2,
      pitch_mode: 1,
      polyphony: 3,
    },
  );

  it("includes all six pseudo-params in parameters and omits modulations", () => {
    registerReadableSpectralResonator();

    const result = readOneDevice({
      id: "spectral-resonator-1",
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

    const result = readOneDevice({
      id: "spectral-resonator-1",
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
