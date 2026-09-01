// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { namedParam } from "#src/tools/shared/utils.ts";
import {
  parseObjectPath,
  pathError,
} from "#src/tools/shared/validation/object-path.ts";

export type CreateTrackType = "midi" | "audio" | "return";

export interface CreateTrackTarget {
  /** Which Live call makes the track */
  type: CreateTrackType;
  /** Where it goes; -1 appends */
  trackIndex: number;
}

interface CreateTrackTargetArgs {
  path?: string;
  trackIndex?: number;
  type?: CreateTrackType;
}

/**
 * Reads where a new track goes, from its path or the params the path replaced.
 * @param args - The create call's addressing params
 * @param args.path - "t+" to append, "t2" to insert at 2, "rt+" for a return
 * @param args.trackIndex - Deprecated index, -1 or unset to append
 * @param args.type - Which signal the track carries
 * @returns The Live call to make and the index to make it at
 */
export function resolveCreateTrackTarget({
  path,
  trackIndex,
  type = "midi",
}: CreateTrackTargetArgs): CreateTrackTarget {
  const entry = namedParam(path, "path");

  if (entry == null) {
    // A return track is still reachable by the retired spelling, so say what
    // replaced it rather than refusing a call that works.
    if (type === "return") {
      console.warn(
        'createTrack: type "return" is deprecated and will be removed; use path "rt+" instead',
      );
    }

    return { type, trackIndex: trackIndex ?? -1 };
  }

  if (trackIndex != null) {
    throw new Error(
      "createTrack: path says where the track goes - don't send trackIndex with it",
    );
  }

  return targetFromPath(entry, type);
}

// --- Helpers below main exports ---

/**
 * Reads a path as a place to put a new track.
 * @param entry - The path as written
 * @param type - Which signal the track carries, where the path leaves a choice
 * @returns The Live call to make and the index to make it at
 */
function targetFromPath(
  entry: string,
  type: CreateTrackType,
): CreateTrackTarget {
  const path = parseObjectPath(entry, "path");

  switch (path.kind) {
    // A return track is audio-only and Live appends it, so the path settles
    // both the type and the position on its own.
    case "new-return-track":
      return { type: "return", trackIndex: -1 };
    case "new-track":
      return { type: signalType(type, entry), trackIndex: -1 };
    case "track":
      return { type: signalType(type, entry), trackIndex: path.trackIndex };
    case "return-track":
      throw pathError(
        "path",
        entry,
        'Live adds return tracks at the end, so they have no index; use "rt+"',
      );
    default:
      throw pathError(
        "path",
        entry,
        'it names no place for a track; expected "t+", "t<index>", or "rt+"',
      );
  }
}

/**
 * The signal a new regular track carries. "return" is not one — the path is
 * how a return track is asked for now.
 * @param type - The type param
 * @param entry - The path as written, for the error
 * @returns "midi" or "audio"
 */
function signalType(type: CreateTrackType, entry: string): "midi" | "audio" {
  if (type === "return") {
    throw pathError(
      "path",
      entry,
      'it names a regular track, but type is "return"; use path "rt+" for a return track',
    );
  }

  return type;
}
