// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestMemo } from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

/** The song time signature every arrangement position resolves against. */
export interface SongMeter {
  numerator: number;
  denominator: number;
}

/**
 * The song time signature, read once per request.
 *
 * Naming one arrangement clip costs a `start_time` read plus this; a busy
 * track's read names many, and the meter is the same for all of them. Only for
 * spelling a position — a caller that has just written the meter must read it
 * back itself.
 * @returns The song time signature
 */
export function songMeter(): SongMeter {
  return requestMemo("songMeter", () => {
    const liveSet = LiveAPI.from(livePath.liveSet);

    return {
      numerator: liveSet.getProperty("signature_numerator") as number,
      denominator: liveSet.getProperty("signature_denominator") as number,
    };
  });
}
