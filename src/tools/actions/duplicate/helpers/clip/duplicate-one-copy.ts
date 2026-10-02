// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  isTakeLaneClip,
  takeLaneLabel,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import { type LaneLedger } from "#src/tools/shared/arrangement/helpers/arrangement-lane-ledger.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { duplicateClipToArrangement } from "./duplicate-clip-to-arrangement.ts";
import { readCopyBack } from "../minimal-clip-info.ts";
import {
  clearedBefore,
  copiedIds,
  copyClearingAsync,
  copyReach,
  mainLaneOf,
  noteCleared,
  takeLaneOf,
  type CopyLane,
} from "./overwrites/copy-overwrites.ts";
import { copySpanBeats } from "./copy-plan.ts";
import {
  PartialRecreateError,
  recreateClip,
  recreatedClipLosses,
  recreateLossesNote,
} from "#src/tools/shared/clip/recreate-clip.ts";
import {
  arrangementSpan,
  keptSpan,
} from "#src/tools/shared/clip/arrangement-span.ts";
import { type ResolvedDuplicateLane } from "./duplicate-take-lanes.ts";

/** What one copy attempt produced: the clip (with a detail when it isn't quite
 * what was asked for), or why there is none. */
export type CopyAttempt =
  | { copy: object; refused?: undefined; cleared?: undefined }
  | { copy?: undefined; refused: string; cleared?: string };

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
  /** Why a lane destination got no lane, by {@link takeLaneLabel}. */
  laneRefusals: Map<string, string>;
  /** Whether a take-lane source may be re-created on the main lane. */
  canPromote: boolean;
  object: LiveAPI;
  id: string;
  name: string | undefined;
  color: string | undefined;
  arrangementLength: string | undefined;
  /**
   * Why a copy this call has to re-create can't be made at all — an audio
   * source with no sample file — or null when it can.
   */
  noSample: string | null;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  context: Partial<ToolContext>;
  /** The destination tracks, keyed by index */
  tracks: Map<number, LiveAPI>;
  /** The call's arrangement lanes, shared by every copy */
  ledger: LaneLedger;
}

/**
 * Makes one arrangement copy, on a take lane or the main lane. A throw before
 * the copy exists is the destination's refusal, so the other destinations still
 * land. The steps after it report on the copy's own entry instead of throwing.
 * @param options - Everything the copy needs
 * @returns The created clip, or why this destination got none
 */
export async function duplicateOneCopy(
  options: CopyOptions,
): Promise<CopyAttempt> {
  try {
    return await copyAtDestination(options);
  } catch (error) {
    // A copy that cleared clips before it threw changed the Set: the entry
    // says so, and isn't a skip.
    const cleared = clearedBefore(error);

    return {
      refused: errorMessage(error),
      ...(cleared != null && { cleared }),
    };
  }
}

// --- Helpers below main exports ---

/**
 * Routes one copy to the way its destination and source need.
 * @param options - Everything the copy needs
 * @returns The created clip, or why this destination got none
 */
async function copyAtDestination(options: CopyOptions): Promise<CopyAttempt> {
  const { target, startBeats, lanes, object, id, tracks } = options;

  if (target.takeLane != null) {
    const label = takeLaneLabel(target);
    const resolved = lanes.get(label);

    if (resolved == null) {
      return {
        refused:
          options.noSample ??
          options.laneRefusals.get(label) ??
          "no take lane was resolved for this destination",
      };
    }

    return await clearingCopy(
      options,
      takeLaneOf(target.trackIndex, resolved.laneIndex, resolved.lane),
      () => recreateCopy(options, resolved.lane, "take-lane"),
    );
  }

  const track =
    tracks.get(target.trackIndex) ??
    LiveAPI.from(livePath.track(target.trackIndex));
  const mainLane = mainLaneOf(target.trackIndex, track);

  // Main-lane destination with a take-lane source: duplicate_clip_to_arrangement
  // silently no-ops on a take-lane source id (see take-lanes.ts header),
  // so re-create it here instead.
  if (isTakeLaneClip(object)) {
    if (!options.canPromote) {
      return {
        refused:
          options.noSample ??
          "promoting off a take lane re-creates the clip, which this source can't be",
      };
    }

    return await clearingCopy(options, mainLane, () =>
      recreateCopy(options, track, "promoted"),
    );
  }

  return await clearingCopy(options, mainLane, () =>
    duplicateClipToArrangement(
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
    ),
  );
}

/**
 * Runs one copy and says on its entry what it did to the clips already on its
 * lane. A copy that made nothing may still have cleared its range first, so the
 * refusal says so too.
 * @param options - Everything the copy needs
 * @param where - The lane the copy writes to
 * @param write - Makes the copy
 * @returns The copy attempt, with what it cleared added
 */
async function clearingCopy(
  options: CopyOptions,
  where: CopyLane,
  write: () => CopyAttempt | Promise<CopyAttempt>,
): Promise<CopyAttempt> {
  const { object, startBeats } = options;
  // Re-created copies ignore the length, so it is only ever a wider net here.
  const spanBeats = copySpanBeats(
    object,
    options.arrangementLength,
    options.songTimeSigNumerator,
    options.songTimeSigDenominator,
  );
  const sourceBeats = clipLengthBeats(object);
  const { made, cleared } = await copyClearingAsync(
    options.ledger,
    where,
    copyReach(startBeats, sourceBeats, spanBeats),
    write,
    ({ copy }) => (copy == null ? [] : copiedIds(copy)),
  );

  if (cleared == null) {
    return made;
  }

  // Nothing landed, but the range was cleared: the entry still reports it.
  if (made.copy == null) {
    return { refused: made.refused, cleared };
  }

  noteCleared(made.copy, cleared);

  return made;
}

/**
 * Re-creates one copy, reporting a refusal on the destination's own entry so the
 * rest of a multi-position call still lands.
 *
 * A failure after the clip was created still leaves a real, partial clip at
 * the destination ({@link PartialRecreateError}), which says so: reporting the
 * create as "failed" would be wrong when something is actually there. Unlike
 * the move path this feeds into no delete, so there's no "original was kept"
 * half to add — the source was never at risk.
 * @param options - Everything the copy needs
 * @param destination - The TakeLane, or the Track for a promoted copy
 * @param kind - What to call this copy in the reason
 * @returns The created clip, or why this destination got none
 */
function recreateCopy(
  options: CopyOptions,
  destination: LiveAPI,
  kind: "take-lane" | "promoted",
): CopyAttempt {
  // Seeded with what a re-create is known to cost this source, then added to
  // with anything the copy itself turned out to lose.
  const losses = recreatedClipLosses(options.object);
  // Read before the create, which can truncate the source itself.
  const sourceSpan = arrangementSpan(options.object);

  let clip: LiveAPI;

  try {
    clip = recreateClip(
      options.object,
      destination,
      options.startBeats,
      options.name,
      options.color,
      losses,
    );
  } catch (error) {
    // A real clip is there, so it is reported — with what it cost. Calling it a
    // refusal would lose a clip the caller has to know about.
    if (error instanceof PartialRecreateError) {
      return {
        copy: readCopyBack(error.partialClip, () =>
          joinDetails([
            `the ${kind} copy is incomplete (${error.message})`,
            ignoredLength(options, keptSpan(error.partialClip, sourceSpan)),
          ]),
        ),
      };
    }

    return {
      refused: `the ${kind} copy failed: ${errorMessage(error)}`,
    };
  }

  // The clip exists, so a failure describing it is on its entry, not a refusal.
  return {
    copy: readCopyBack(clip, () =>
      joinDetails([
        landedNote(kind, losses),
        ignoredLength(options, keptSpan(clip, sourceSpan)),
      ]),
    ),
  };
}

/**
 * How a re-created copy got where it is, and what that cost. Live's arrangement
 * duplicate can make neither move, so the copy's own entry says so.
 * @param kind - Which re-create this was
 * @param losses - What the re-create lost
 * @returns The note for the entry
 */
function landedNote(kind: "take-lane" | "promoted", losses: string[]): string {
  const cost = recreateLossesNote(losses);

  // Live hides take lanes until the track's arrow is expanded, so a copy on one
  // looks missing.
  return kind === "take-lane"
    ? `re-created on the take lane${cost}; expand the take-lanes arrow on the track header in Live to see it`
    : `promoted to the main lane by re-creating it${cost}`;
}

/**
 * The note for an arrangementLength a re-created copy was sent. It is never
 * used: the copy is rebuilt from the source, not resized. The kept-length claim
 * is made only when the copy's span was read back and matched.
 * @param options - Everything the copy needs
 * @param keptLength - Whether the copy's span was verified to match the source's
 * @returns The note for the copy's entry, or undefined when none was sent
 */
function ignoredLength(
  options: CopyOptions,
  keptLength: boolean,
): string | undefined {
  if (options.arrangementLength == null) {
    return undefined;
  }

  return keptLength
    ? "arrangementLength ignored: the copy keeps the source's arrangement length"
    : "arrangementLength ignored: a re-created copy isn't resized";
}
