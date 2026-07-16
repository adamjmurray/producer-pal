// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { compressorSpec } from "../devices/compressor.ts";
import { driftSpec } from "../devices/drift.ts";
import { eqEightSpec } from "../devices/eq-eight.ts";
import { hybridReverbSpec } from "../devices/hybrid-reverb.ts";
import { meldSpec } from "../devices/meld.ts";
import {
  autoFilterSpec,
  autoPanTremoloSpec,
  phaserFlangerSpec,
} from "../devices/modulation-rate-effects.ts";
import { roarSpec } from "../devices/roar.ts";
import { simplerSpec } from "../devices/simpler.ts";
import { spectralResonatorSpec } from "../devices/spectral-resonator.ts";
import { wavetableSpec } from "../devices/wavetable.ts";
import {
  getSpecForDevice,
  readSpecializedActions,
  readSpecializedOptions,
  readSpecializedParams,
} from "../specialized-device-registry.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// The declarative half of the specialized-device layer: the class_display_name →
// spec routing table and the LLM-facing discovery catalogs (`actions`,
// `paramOptions`). These are pure data the model relies on to call a device
// correctly, so the tables themselves are the contract worth asserting — the
// behavioral wiring around them lives in specialized-device-registry.test.ts.

/**
 * Register a mock device with a given class_display_name.
 * @param displayName - The device's class_display_name
 * @returns The device LiveAPI
 */
function registerDevice(displayName: string): LiveAPI {
  registerMockObject("dev-1", {
    type: "Device",
    properties: { class_display_name: displayName },
  });

  return LiveAPI.from("id dev-1");
}

describe("display-name routing table", () => {
  const ROUTES: [string, SpecializedDeviceSpec][] = [
    ["Drift", driftSpec],
    ["Meld", meldSpec],
    ["Simpler", simplerSpec],
    ["Wavetable", wavetableSpec],
    ["Auto Filter", autoFilterSpec],
    ["Auto Pan-Tremolo", autoPanTremoloSpec],
    ["Compressor", compressorSpec],
    ["EQ Eight", eqEightSpec],
    ["Hybrid Reverb", hybridReverbSpec],
    ["Phaser-Flanger", phaserFlangerSpec],
    ["Roar", roarSpec],
    ["Spectral Resonator", spectralResonatorSpec],
  ];

  it.each(ROUTES)("routes %s to its spec", (displayName, spec) => {
    expect(getSpecForDevice(registerDevice(displayName))).toBe(spec);
  });
});

describe("action catalogs", () => {
  it("exposes Simpler's full action catalog", () => {
    expect(readSpecializedActions(registerDevice("Simpler"))).toStrictEqual([
      {
        name: "reverse",
        signature: "reverse",
        description: "Reverse the active sample region",
      },
      {
        name: "crop",
        signature: "crop",
        description: "Crop the sample to the active region",
      },
      {
        name: "warpDouble",
        signature: "warpDouble",
        description: "Double the warp tempo (Sample tab ✻2)",
      },
      {
        name: "warpHalf",
        signature: "warpHalf",
        description: "Halve the warp tempo (Sample tab ÷2)",
      },
      {
        name: "warpAs",
        signature: "warpAs(beats)",
        description: "Warp the active region to span the given number of beats",
      },
    ]);
  });

  it("exposes Wavetable's full action catalog", () => {
    expect(readSpecializedActions(registerDevice("Wavetable"))).toStrictEqual([
      {
        name: "setModulation",
        signature:
          "setModulation('<targetParamName>', '<source>', <amount -1..1>)",
        description:
          "Set a mod-matrix amount routing a source to a target parameter",
      },
      {
        name: "clearModulation",
        signature: "clearModulation('<targetParamName>', '<source>')",
        description: "Clear a mod-matrix routing from a source to a target",
      },
      {
        name: "addModulationTarget",
        signature: "addModulationTarget('<paramName>')",
        description:
          "Add a parameter as a modulation target so it can be routed",
      },
    ]);
  });
});

describe("modulation-rate effect specs", () => {
  // Auto Filter / Auto Pan-Tremolo / Phaser-Flanger carry no pseudo-params at
  // all — only `inactiveWhen` rules — so both discovery catalogs stay empty.
  const RATE_EFFECTS = ["Auto Filter", "Auto Pan-Tremolo", "Phaser-Flanger"];

  it.each(RATE_EFFECTS)("%s exposes no pseudo-params", (displayName) => {
    expect(readSpecializedParams(registerDevice(displayName))).toStrictEqual(
      [],
    );
  });

  it.each(RATE_EFFECTS)("%s contributes no options catalog", (displayName) => {
    // No params carry `options` and there are no dynamic catalogs, so the
    // result must be a bare {} — not an empty `paramOptions` key.
    expect(readSpecializedOptions(registerDevice(displayName))).toStrictEqual(
      {},
    );
  });
});

describe("paramOptions catalogs", () => {
  it("lists Simpler's discrete voice counts", () => {
    const { paramOptions } = readSpecializedOptions(
      registerDevice("Simpler"),
    ) as { paramOptions: Record<string, unknown> };

    expect(paramOptions.voices).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 32,
    ]);
    expect(paramOptions.playbackMode).toStrictEqual([
      "classic",
      "one-shot",
      "slicing",
    ]);
    expect(paramOptions.slicingPlaybackMode).toStrictEqual([
      "mono",
      "poly",
      "thru",
    ]);
  });

  it("states Wavetable's unison-voice range as a constraint string", () => {
    // `options` is a range string here rather than a value list — the model
    // needs the bounds, not eight enumerated counts.
    const unison = wavetableSpec.params.find(
      (p) => p.name === "unisonVoiceCount",
    );

    expect(unison?.options).toBe("2-8");
  });
});
