// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  isTakeLaneClip,
  takeLaneKey,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { duplicateClipToArrangement } from "../duplicate-helpers.ts";
import { recreateMidiClip } from "./duplicate-clip-recreate-helpers.ts";
import { type ResolvedDuplicateLane } from "./duplicate-take-lane-helpers.ts";

/**
 * One object per destination track, shared by every copy in the call. Copying
 * a clip onto a track never moves the track, so one serves the whole batch.
 * @param targets - Every destination, in copy order
 * @returns The destination tracks, keyed by index
 */
export function destinationTracks(
  targets: ArrangementTrack[],
): Map<number, LiveAPI> {
  return new Map(
    [...new Set(targets.map((target) => target.trackIndex))].map((index) => [
      index,
      LiveAPI.from(livePath.track(index)),
    ]),
  );
}

export interface CopyOptions {
  target: ArrangementTrack;
  startBeats: number;
  lanes: Map<string, ResolvedDuplicateLane>;
  /** Whether a take-lane source may be re-created on the main lane (MIDI only). */
  canPromote: boolean;
  object: LiveAPI;
  id: string;
  name: string | undefined;
  color: string | undefined;
  arrangementLength: string | undefined;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  context: Partial<ToolContext>;
  /** The destination tracks, keyed by index */
  tracks: Map<number, LiveAPI>;
}

/**
 * Makes one arrangement copy, on a take lane or the main lane.
 * @param options - Everything the copy needs
 * @returns The created clip info, or null when the copy was skipped
 */
export async function duplicateOneCopy(
  options: CopyOptions,
): Promise<object | null> {
  const { target, startBeats, lanes, object, id, tracks } = options;

  if (target.takeLane != null) {
    const resolved = lanes.get(takeLaneKey(target));

    // A rejected source (audio, for now) warned once during lane resolution.
    if (resolved == null) return null;

    return recreateCopy(options, resolved.lane, "take-lane");
  }

  // Main-lane destination with a take-lane source: duplicate_clip_to_arrangement
  // silently no-ops on a take-lane source id (see take-lane-helpers.ts header),
  // so re-create it here instead. An audio source warned once in the caller.
  if (isTakeLaneClip(object)) {
    if (!options.canPromote) return null;

    return recreateCopy(
      options,
      tracks.get(target.trackIndex) ??
        LiveAPI.from(livePath.track(target.trackIndex)),
      "promoted",
    );
  }

  return await duplicateClipToArrangement(
    id,
    startBeats,
    target.trackIndex,
    options.name,
    options.color,
    options.arrangementLength,
    options.songTimeSigNumerator,
    options.songTimeSigDenominator,
    options.context,
    object,
    tracks,
  );
}

/**
 * Re-creates one copy, warning and skipping if Live refuses it so the rest of a
 * multi-position call still lands.
 * @param options - Everything the copy needs
 * @param destination - The TakeLane, or the Track for a promoted copy
 * @param kind - What to call this copy in the warning
 * @returns The created clip info, or null when Live refused it
 */
function recreateCopy(
  options: CopyOptions,
  destination: LiveAPI,
  kind: "take-lane" | "promoted",
): object | null {
  try {
    return recreateMidiClip(
      options.object,
      destination,
      options.startBeats,
      options.name,
      options.color,
    );
  } catch (error) {
    console.warn(
      `duplicate: failed to create ${kind} clip at beat ${options.startBeats}: ${errorMessage(error)}`,
    );

    return null;
  }
}
