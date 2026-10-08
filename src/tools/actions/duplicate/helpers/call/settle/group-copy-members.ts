// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live copies a group track together with every track inside it. The group's
// entry says which tracks those are, once every copy exists and has settled.

import {
  alsoDoneInsideDetail,
  tracksInside,
} from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * What a group copy's entry says about the tracks copied inside it.
 * @param copy - The group track's copy, where it is now
 * @returns The detail, or undefined when nothing is inside it
 */
export function groupCopyMembersDetail(copy: LiveAPI): string | undefined {
  return alsoDoneInsideDetail(
    "copied",
    tracksInside(copy).map((track) => targetLabel(track)),
  );
}
