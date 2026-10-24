// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";

/**
 * Refuses a call that creates more tracks than the cap allows.
 * @param total - How many tracks the call creates
 * @throws Error always
 */
export function refuseTrackCount(total: number): never {
  throw new Error(
    `creating ${total} tracks exceeds the maximum allowed (${MAX_AUTO_CREATED_TRACKS})`,
  );
}
