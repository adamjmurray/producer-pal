// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { exclusiveModes } from "../specialized-device-inactive.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Audio effects whose LFO / modulation rate can be specified several mutually
// exclusive ways (Hz, ms, synced note value, ...). A mode enum picks which one
// applies, but Live reports every rate param active at once, so an LLM can't
// tell which value is in effect (the same failure fixed for Wavetable/Drift).
// These devices carry no other specialized state, so each spec is just the
// `inactiveWhen` rule. Mode→param mappings verified vs Live 12.4 (2026-06-04):
// `LFO Rate` / `Rate` / `Mod Rate` are quantized note-value selectors (raw
// 0-21, str_for_value → "1/4" etc.); `LFO 16th` / `16th` express the rate as a
// count of sixteenths. See dev/Specialized-Devices.md.

export const autoFilterSpec: SpecializedDeviceSpec = {
  displayNames: ["Auto Filter"],
  params: [],

  // "LFO T Mode" selects the rate representation: Rate=Hz (LFO Freq),
  // Time=ms (LFO Time), Synced/Triplet/Dotted=note value (LFO Rate, the mode
  // sets the straight/triplet/dotted feel), Sixteenth=count of 16ths (LFO 16th).
  inactiveWhen: [
    exclusiveModes("LFO T Mode", {
      Rate: "LFO Freq",
      Time: "LFO Time",
      Synced: "LFO Rate",
      Triplet: "LFO Rate",
      Dotted: "LFO Rate",
      Sixteenth: "LFO 16th",
    }),
  ],
};

export const autoPanTremoloSpec: SpecializedDeviceSpec = {
  displayNames: ["Auto Pan-Tremolo"],
  params: [],

  // Same shape as Auto Filter, with the controller named "Time Mode" and the
  // synced-count mode labelled "16th" (not "Sixteenth").
  inactiveWhen: [
    exclusiveModes("Time Mode", {
      Rate: "Frequency",
      Time: "Time",
      Synced: "Rate",
      Triplet: "Rate",
      Dotted: "Rate",
      "16th": "16th",
    }),
  ],
};

export const phaserFlangerSpec: SpecializedDeviceSpec = {
  displayNames: ["Phaser-Flanger"],
  params: [],

  // Two independent modulation sections, each a boolean Hz/sync toggle: Off uses
  // the Hz "Mod Freq", On uses the synced note-value "Mod Rate".
  inactiveWhen: [
    exclusiveModes("Mod Sync", { Off: "Mod Freq", On: "Mod Rate" }),
    exclusiveModes("Mod Sync 2", { Off: "Mod Freq 2", On: "Mod Rate 2" }),
  ],
};
