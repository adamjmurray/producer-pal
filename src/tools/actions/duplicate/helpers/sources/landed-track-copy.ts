// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";

/** Where Live put a track copy. */
export interface LandedTrackCopy {
  /** The copy's index. For a group, the copy of the group itself. */
  index: number;
  /** How many tracks the copy added: 1, plus a group's copied members. */
  added: number;
  /** What Live threw after the copy was made, when it did */
  threw?: string;
}

/**
 * Duplicate a track and find where the copy landed. Don't assume index + 1:
 * Live copies a group with all its members and puts the copy after the last
 * member, so index + 1 is the group's own first member.
 * @param trackIndex - The track to duplicate
 * @returns Where the copy is, and how many tracks it added
 * @throws Error when Live made no new track
 */
export function landTrackCopy(trackIndex: number): LandedTrackCopy {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const before = new Set(liveSet.getChildIds("tracks"));
  let threw: string | undefined;

  // A throw after the copy was made still leaves the copy, so what Live did is
  // read before deciding the call failed.
  try {
    liveSet.call("duplicate_track", trackIndex);
  } catch (error) {
    threw = errorMessage(error);
  }

  // Nothing before the source moves, so only look after it.
  const newIds = liveSet
    .getChildIds("tracks")
    .map((id, index) => ({ id, index }))
    .filter(({ id, index }) => index > trackIndex && !before.has(id));
  const first = newIds[0];

  if (first == null) {
    const source = formatObjectPath({ kind: "track", trackIndex });

    throw new Error(threw ?? `Live made no copy of ${source}`);
  }

  return {
    index: first.index,
    added: newIds.length,
    ...(threw != null && { threw }),
  };
}
