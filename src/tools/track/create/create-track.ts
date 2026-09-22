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
import { joinReasons } from "#src/tools/shared/helpers/entry-reasons.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import { unwrapSingleResult } from "#src/tools/shared/helpers/target-entries.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { labelNewTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { returnTrackRename } from "../helpers/return-track-rename.ts";
import {
  type TrackValueArgs,
  splitTrackValues,
  trackValueListArgs,
  trackValuesAt,
} from "../helpers/track-value-lists.ts";
import {
  type CreateTrackTarget,
  resolveCreateTrackTargets,
} from "./create-track-targets.ts";

interface CreateTrackArgs extends TrackValueArgs {
  path?: string;
  trackIndex?: number;
  count?: number;
  name?: string;
  color?: string;
  type?: "midi" | "audio" | "return";
}

interface CreatedTrackResult {
  id: string;
  path: string;
  /**
   * The name the track ended up with, when it isn't the one asked for. `reason`
   * says why, and there is no `ok` — the track was made.
   */
  name?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  reason?: string;
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
 * @param args.mute - Mute state, one per track
 * @param args.solo - Solo state, one per track
 * @param args.arm - Arm state, one per track
 * @param _context - Internal context object (unused)
 * @returns One object per track, unwrapped when the call named one
 */
export function createTrack(
  args: CreateTrackArgs = {},
  _context: Partial<ToolContext> = {},
): CreatedTrackResult | CreatedTrackResult[] {
  const { count, name, color } = args;
  const targets = resolveCreateTrackTargets(args);

  if (args.type === "return" && args.trackIndex != null) {
    console.warn(
      "trackIndex is ignored for return tracks (always added at end)",
    );
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const insertions = planTrackInsertions(liveSet, targets);

  validateTrackCap(targets.length, insertions);

  const { parsedNames, parsedColors } = labelNewTargets({
    noun: "track",
    param: count == null ? "path" : "count",
    count: targets.length,
    name,
    color,
    extraLists: trackValueListArgs(args),
  });
  const valueLists = splitTrackValues(args, targets.length);

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
    const rename = returnTrackRename(
      track.path,
      getNameForIndex(name, i, parsedNames),
    );

    const trackColor = getColorForIndex(color, i, parsedColors);
    const values = trackValuesAt(args, valueLists, i);

    track.setAll({
      name: rename.write,
      color: trackColor,
      mute: values.mute,
      solo: values.solo,
      arm: values.arm,
    });

    const landed = trackColor == null ? {} : landedColor(track, trackColor);
    const reason = joinReasons([rename.landed.reason, landed.reason]);

    created.push({
      id: trackId,
      path: formatObjectPath(
        insertion == null
          ? { kind: "return-track", returnIndex: returnIndex++ }
          : { kind: "track", trackIndex: insertion.finalIndex },
      ),
      ...rename.landed,
      ...landed,
      ...(reason == null ? {} : { reason }),
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
  // The total must not exceed the cap in ANY mode: the reach check below sees
  // only inserts at a named index, so appends and returns would be unbounded.
  if (total > MAX_AUTO_CREATED_TRACKS) {
    throw new Error(
      `creating ${total} tracks exceeds the maximum allowed (${MAX_AUTO_CREATED_TRACKS})`,
    );
  }

  const indexes = insertions
    .map((insertion) => insertion.reachIndex)
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

  // Live API returns ["id", 123] — the second element is a NUMBER (Live
  // 12.4.3). Every other tool's id comes from `api.id`, always a string, so
  // stringify to keep `id` one type across the whole tool surface.
  return atomToString(
    assertDefined((result as unknown[])[1], "track id from result"),
  );
}
