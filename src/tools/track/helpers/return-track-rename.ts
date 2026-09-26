// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  returnSlotLetter,
  stripReturnSlotLetter,
} from "#src/tools/shared/validation/name-parsing.ts";

const RETURN_TRACK_SLOT = /return_tracks (\d+)$/;
const SEPARATOR = "-";

/** What to write for a rename, and what the result says about how it landed. */
export interface TrackRename {
  /** The name to write, or undefined when the call renamed nothing */
  write: string | undefined;
  /** The entry's `name` and `detail`, empty when the name lands as asked */
  landed: { name?: string; detail?: string };
}

/**
 * A rename, allowing for the send letter Live puts back on a return track.
 *
 * Only the track's own letter is stripped: "B-Side" on return C is a name, not
 * a doubled prefix. Live prefixes it anyway, so the caller is told what the
 * track is called now. A regular track passes straight through.
 * @param path - The track's Live API path
 * @param requested - The name the call asked for, if any
 * @returns The name to write, and the result fields describing the outcome
 */
export function returnTrackRename(
  path: string,
  requested: string | undefined,
): TrackRename {
  if (requested == null) {
    return { write: undefined, landed: {} };
  }

  const letter = returnSlotLetter(path, RETURN_TRACK_SLOT);

  // A regular track, or a return past Z whose label Live doesn't tell us: the
  // name goes through untouched and nothing is claimed about how it lands.
  if (letter == null) {
    return { write: requested, landed: {} };
  }

  const write = stripReturnSlotLetter(
    path,
    requested,
    RETURN_TRACK_SLOT,
    SEPARATOR,
  );
  const landed = `${letter}${SEPARATOR}${write}`;

  if (landed === requested) {
    return { write, landed: {} };
  }

  return {
    write,
    landed: {
      name: landed,
      detail: "Live prefixes a return track's name with its send letter",
    },
  };
}
