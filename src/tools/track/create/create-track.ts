// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { atomToString } from "#src/shared/max/max-atoms.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";
import {
  type Insertion,
  planInsertions,
} from "#src/tools/shared/validation/lists/insertion-plan.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import {
  getColorForIndex,
  parseColors,
} from "#src/tools/shared/validation/color-parsing.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-parsing.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  type CreateTrackTarget,
  resolveCreateTrackTargets,
} from "./create-track-targets.ts";

interface CreateTrackArgs {
  path?: string;
  trackIndex?: number;
  count?: number;
  name?: string;
  color?: string;
  type?: "midi" | "audio" | "return";
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
}

interface CreatedTrackResult {
  id: string;
  path: string;
}

/**
 * Creates tracks at the places a path names
 * @param args - The track parameters
 * @param args.path - Where they go: "t+", "t<index>" or "rt+", comma-separated for several
 * @param args.trackIndex - Deprecated index (0-based, -1 or omit to append)
 * @param args.count - Deprecated repeat of a single path
 * @param args.name - Name for all, or one per track, in order
 * @param args.color - Color for all, or one per track, in order (CSS format: hex)
 * @param args.type - Type of tracks ("midi", "audio", or "return")
 * @param args.mute - Mute state for the tracks
 * @param args.solo - Solo state for the tracks
 * @param args.arm - Arm state for the tracks
 * @param _context - Internal context object (unused)
 * @returns One object per track, unwrapped when the call named one
 */
export function createTrack(
  args: CreateTrackArgs = {},
  _context: Partial<ToolContext> = {},
): CreatedTrackResult | CreatedTrackResult[] {
  const { count, name, color, mute, solo, arm } = args;
  const targets = resolveCreateTrackTargets(args);

  if (args.type === "return" && args.trackIndex != null) {
    console.warn(
      "trackIndex is ignored for return tracks (always added at end)",
    );
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const insertions = planTrackInsertions(liveSet, targets);

  validateTrackCap(targets.length, insertions);

  validateListLengths([
    {
      param: count == null ? "path" : "count",
      count: targets.length,
      noun: "track",
    },
    { param: "name", value: name },
    { param: "color", value: color },
  ]);

  const parsedNames = parseNames(name, targets.length, "track");
  const parsedColors = parseColors(color, targets.length, "track");
  const created: CreatedTrackResult[] = [];
  let returnIndex = returnTrackBase(liveSet, targets);
  let nextInsertion = 0;

  for (const [i, target] of targets.entries()) {
    const insertion =
      target.type === "return"
        ? null
        : (insertions[nextInsertion++] as Insertion);
    const trackId = createSingleTrack(liveSet, target, insertion);
    const track = LiveAPI.from(`id ${trackId}`);

    track.setAll({
      name: getNameForIndex(name, i, parsedNames),
      color: getColorForIndex(color, i, parsedColors),
      mute,
      solo,
      arm,
    });

    created.push({
      id: trackId,
      path: formatObjectPath(
        insertion == null
          ? { kind: "return-track", returnIndex: returnIndex++ }
          : { kind: "track", trackIndex: insertion.finalIndex },
      ),
    });
  }

  return unwrapSingleResult(created);
}

// --- Helpers below main exports ---

/**
 * Where each regular track is created and where it ends up. Return tracks are
 * not in this plan: Live always puts them on the end of their own list.
 * @param liveSet - Live set object
 * @param targets - Every track the call creates, in order
 * @returns One entry per regular track, in order
 */
function planTrackInsertions(
  liveSet: LiveAPI,
  targets: CreateTrackTarget[],
): Insertion[] {
  const spots = targets
    .filter((target) => target.type !== "return")
    .map((target) => target.spot);

  if (spots.length === 0) {
    return [];
  }

  return planInsertions(spots, liveSet.getChildIds("tracks").length);
}

/**
 * The index the first new return track lands on, read only when the call makes
 * one.
 * @param liveSet - Live set object
 * @param targets - Every track the call creates, in order
 * @returns The existing return track count, or 0 when none are created
 */
function returnTrackBase(
  liveSet: LiveAPI,
  targets: CreateTrackTarget[],
): number {
  return targets.some((target) => target.type === "return")
    ? liveSet.getChildIds("return_tracks").length
    : 0;
}

/**
 * Refuses a call that would grow the Set past the track cap, before any track
 * is made.
 * @param total - How many tracks the call creates
 * @param insertions - Where each regular track goes
 */
function validateTrackCap(total: number, insertions: Insertion[]): void {
  // The total must not exceed the cap in ANY mode. The reach check below only
  // sees inserts at a named index, so appends and return tracks would otherwise
  // be unbounded.
  if (total > MAX_AUTO_CREATED_TRACKS) {
    throw new Error(
      `creating ${total} tracks exceeds the maximum allowed (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }

  const indexes = insertions
    .map((insertion) => insertion.insertIndex)
    .filter((index): index is number => index !== "end");

  if (Math.max(-1, ...indexes) + 1 > MAX_AUTO_CREATED_TRACKS) {
    throw new Error(
      `creating ${total} tracks at index ${indexes[0]} would exceed the maximum allowed tracks (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }
}

/**
 * Create a single track via Live API
 * @param liveSet - Live set object
 * @param target - Which Live call to make
 * @param insertion - Where a regular track goes; null for a return track
 * @returns Track ID
 */
function createSingleTrack(
  liveSet: LiveAPI,
  target: CreateTrackTarget,
  insertion: Insertion | null,
): string {
  let result;

  if (insertion == null) {
    result = liveSet.call("create_return_track");
  } else {
    const index = insertion.insertIndex === "end" ? -1 : insertion.insertIndex;

    result =
      target.type === "midi"
        ? liveSet.call("create_midi_track", index)
        : liveSet.call("create_audio_track", index);
  }

  // Live API returns ["id", 123] — the second element is a NUMBER, verified
  // against Live 12.4.3. Every other tool derives its id from `api.id`, which
  // is always a string, so stringify here to keep `id` one type across the
  // whole tool surface (and to make this function's return type honest).
  return atomToString(
    assertDefined((result as unknown[])[1], "track id from result"),
  );
}
