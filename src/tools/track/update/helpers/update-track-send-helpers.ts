// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { setParamIfEnabled } from "#src/tools/shared/device/helpers/param-write-helpers.ts";
import { findReturnIndex } from "#src/tools/shared/utils.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/** A send level matched to a return track, ready to write on any track. */
export interface ResolvedSend {
  /** Position in a track's send list */
  index: number;
  /** The return track's own name, for the write label */
  name: string;
  /** The return as the caller spelled it */
  requested: string;
  gainDb: number;
}

/**
 * Match the sendGainDb/sendReturn pair to a return track, once for the whole
 * call.
 *
 * The return tracks belong to the Live Set, not to any track being updated, so
 * nothing about a track decides this. Resolving it per track would repeat one
 * warning down the list (ADR-0009).
 * @param sendGainDb - Send level in dB, if given
 * @param sendReturn - Return track id, name, or letter prefix, if given
 * @returns The send to write, or null when there is nothing to write
 */
export function resolveTrackSend(
  sendGainDb: number | undefined,
  sendReturn: string | undefined,
): ResolvedSend | null {
  // A half pair was refused up front, so this is the "neither was sent" case.
  if (sendGainDb == null || sendReturn == null) return null;

  const returnTracks = LiveAPI.from(livePath.liveSet).getChildren(
    "return_tracks",
  );
  const names = returnTracks.map((rt) => rt.getProperty("name") as string);
  const index = findReturnIndex(
    names,
    sendReturn,
    returnTracks.map((rt) => rt.id),
  );

  if (index === -1) {
    const available =
      names.length > 0
        ? `Available: ${names.join(", ")}`
        : "the Live Set has no return tracks";

    console.warn(
      `updateTrack: sendReturn "${sendReturn}" names no return track, so sendGainDb was not written (${available})`,
    );

    return null;
  }

  return {
    index,
    name: names[index] as string,
    requested: sendReturn,
    gainDb: sendGainDb,
  };
}

/**
 * Write one resolved send on one track. Whether the track has that send is a
 * fact about the track, so it is checked here rather than once for the call.
 * @param track - Track object
 * @param send - The send from {@link resolveTrackSend}
 */
export function applyTrackSend(track: LiveAPI, send: ResolvedSend): void {
  const mixer = track.child("mixer_device");

  if (!mixer.exists()) {
    console.warn(
      `updateTrack: track ${targetLabel(track)} has no mixer device`,
    );

    return;
  }

  const sends = mixer.getChildren("sends");

  if (sends.length === 0) {
    console.warn(`updateTrack: track ${targetLabel(track)} has no sends`);

    return;
  }

  const target = sends[send.index];

  if (target == null) {
    console.warn(
      `updateTrack: track ${targetLabel(track)} has no send for return "${send.requested}"`,
    );

    return;
  }

  setParamIfEnabled(
    target,
    "display_value",
    send.gainDb,
    `updateTrack: track ${targetLabel(track)} send "${send.name}"`,
  );
}
