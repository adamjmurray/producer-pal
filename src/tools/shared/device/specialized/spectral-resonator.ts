// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Spectral Resonator (SpectralResonatorDevice, class_name "Transmute").
// AJM-378. See dev/plans/Specialized-Device-Classes.md.
// TODO(AJM-378):
//   - params: midiGate (bool), modMode (4-enum), monoPoly (mono/poly),
//     pitchBendRange (0-24), pitchMode (2-enum), polyphony (0-3)
//   - skip frequency_dial_mode (UI-only); verify enum meanings vs UI

export const spectralResonatorSpec: SpecializedDeviceSpec = {
  displayNames: ["Spectral Resonator"],
};
