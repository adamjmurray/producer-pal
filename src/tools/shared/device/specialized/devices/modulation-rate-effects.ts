// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { exclusiveModes } from "../specialized-device-inactive.ts";
import {
  type InactiveWhenRule,
  type SpecializedDeviceSpec,
} from "../specialized-device-types.ts";

// Audio effects whose LFO / modulation rate can be specified several mutually
// exclusive ways (Hz, ms, synced note value, ...). A mode enum picks which one
// applies, but Live reports every rate param active at once, so an LLM can't
// tell which value is in effect (the same failure fixed for Wavetable/Drift).
// These devices carry no other specialized state, so each spec is just the
// `inactiveWhen` rule. Live 12.4.16 renamed these params, so each device keeps
// a rule for the new names and one for the earlier ones. The synced params are
// quantized note-value selectors (raw 0-21, str_for_value → "1/4" etc.); the
// 16th params count sixteenths. See dev/live-api/specialized-devices/audio-effects.md.

/** The LFO rate params by Live 12.4.16's names: Hz, ms, note value, 16ths. */
const LFO_RATES = ["LFO Freq", "LFO Time", "LFO Synced", "LFO 16th"] as const;

export const autoFilterSpec: SpecializedDeviceSpec = {
  displayNames: ["Auto Filter"],
  params: [],

  // The mode selects the rate representation: Rate=Hz, Time=ms,
  // Synced/Triplet/Dotted=note value (the mode sets the straight/triplet/dotted
  // feel), Sixteenth=count of 16ths. The first rule uses Live 12.4.16's names.
  inactiveWhen: [
    rateModes("LFO Mode", "Sixteenth", LFO_RATES),
    rateModes("LFO T Mode", "Sixteenth", [
      "LFO Freq",
      "LFO Time",
      "LFO Rate",
      "LFO 16th",
    ]),
  ],
};

export const autoPanTremoloSpec: SpecializedDeviceSpec = {
  displayNames: ["Auto Pan-Tremolo"],
  params: [],

  // Same shape as Auto Filter, with the synced-count mode labelled "16th" (not
  // "Sixteenth"). The first rule uses Live 12.4.16's names.
  inactiveWhen: [
    rateModes("LFO Mode", "16th", LFO_RATES),
    rateModes("Time Mode", "16th", ["Frequency", "Time", "Rate", "16th"]),
  ],
};

export const phaserFlangerSpec: SpecializedDeviceSpec = {
  displayNames: ["Phaser-Flanger"],
  params: [],

  // Two independent modulation sections, each a boolean Hz/sync toggle: Off uses
  // the Hz rate, On the synced note value. The first two rules use Live
  // 12.4.16's names.
  inactiveWhen: [
    exclusiveModes("LFO 1 Sync", { Off: "LFO 1 Freq", On: "LFO 1 Synced" }),
    exclusiveModes("LFO 2 Sync", { Off: "LFO 2 Freq", On: "LFO 2 Synced" }),
    exclusiveModes("Mod Sync", { Off: "Mod Freq", On: "Mod Rate" }),
    exclusiveModes("Mod Sync 2", { Off: "Mod Freq 2", On: "Mod Rate 2" }),
  ],
};

/**
 * Auto Filter's and Auto Pan-Tremolo's rate rule: Rate=Hz, Time=ms,
 * Synced/Triplet/Dotted=note value, the 16th mode=count of sixteenths.
 * @param controller - The mode param
 * @param sixteenthMode - The 16th mode's label, which differs per device
 * @param rates - The Hz, ms, note-value and 16th params, in that order
 * @returns The rule
 */
function rateModes(
  controller: string,
  sixteenthMode: string,
  rates: readonly [string, string, string, string],
): InactiveWhenRule {
  const [freq, time, synced, sixteenth] = rates;

  return exclusiveModes(controller, {
    Rate: freq,
    Time: time,
    Synced: synced,
    Triplet: synced,
    Dotted: synced,
    [sixteenthMode]: sixteenth,
  });
}
