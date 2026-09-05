// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";

/** Name and id of one of the Live Set's return tracks. */
export interface ReturnTrackInfo {
  name: string;
  id: string;
}

/**
 * Read the Live Set's return tracks, in send order
 * @returns Their names and ids, index-aligned with any track's sends
 */
export function readReturnTrackInfo(): ReturnTrackInfo[] {
  return LiveAPI.from(livePath.liveSet)
    .getChildren("return_tracks")
    .map((rt) => ({ name: rt.getProperty("name") as string, id: rt.id }));
}
