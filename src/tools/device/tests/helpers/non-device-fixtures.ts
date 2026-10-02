// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

/** The mixer types a device tool is handed by id and must refuse. */
export const MIXER_TYPES = ["MixerDevice", "ChainMixerDevice"] as const;

/**
 * Register a mixer at track 3, under the id "mix-1".
 * @param type - Which kind of mixer it is
 */
export function registerMixer(type: (typeof MIXER_TYPES)[number]): void {
  registerMockObject("mix-1", {
    path: livePath.track(3).mixerDevice(),
    type,
  });
}
