// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Wavetable (WavetableDevice, class_name "InstrumentVector"). AJM-373. See
// dev/plans/Specialized-Device-Classes.md.
// Imperative mod-matrix API (contrast with Drift's declarative approach).
// TODO(AJM-373):
//   - params: filterRouting, monoPoly, polyVoices, unisonMode, unisonVoiceCount,
//     osc1/2Engine, osc1/2Category, osc1/2Wavetable
//   - actions: setModulation(target, source, amount), clearModulation(...),
//     addModulationTarget(...)
//   - readModulations: [{target, source, amount}] (parameter-name keyed)
//   - readOptions: osc1/2Wavetables, modulatableParameters
//   - set_modulation_value is 3-arg; sentinel 1 for out-of-range indices;
//     matrix keyed by parameter name (not display label)

export const wavetableSpec: SpecializedDeviceSpec = {
  displayNames: ["Wavetable"],
};
