// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Compressor (CompressorDevice). AJM-375. See
// dev/plans/Specialized-Device-Classes.md.
// Sidechain input routing via Live's standard routing-dict shape.
// TODO(AJM-375):
//   - params: sidechainSourceTrackId (trackId|null), sidechainChannel
//     (Pre FX/Post FX/Post Mixer|null)
//   - readOptions: sidechainSourceTrackIds (valid sources, dynamic per set)
//   - pre-validate (Live silently swallows bad sets); apply source before
//     channel; re-read channels per source (identifiers are not stable)

export const compressorSpec: SpecializedDeviceSpec = {
  displayNames: ["Compressor"],
};
