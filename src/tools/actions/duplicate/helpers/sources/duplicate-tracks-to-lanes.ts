// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A whole lane copied in one call: every clip on the source — a track's main
// arrangement lane, or a take lane of its own — is re-created on the
// destination, at the same position. A take-lane source also goes the other
// way, onto a track's main lane (a promote), replacing whatever already sits
// there. Either way a lane holds clips and nothing else, so the devices, mixer,
// routing and session clips a new-track copy carries stay behind — the
// destination's own entry says so.
//
// Every destination is checked before the first lane is created: a lane can't
// be deleted, so a cap or type error found halfway would strand the lanes
// already made.

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  assertTrackTakesLanes,
  takeLaneLabel,
  takeLaneTargetsThatFit,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  pathEntries,
  takeLanePathEntry,
  type TakeLanePath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  formatObjectPath,
  parseObjectPath,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { skippedCopy } from "../minimal-clip-info.ts";
import { type CopyMeter } from "../clip/copy-entries.ts";
import { copyLedger } from "../clip/overwrites/copy-overwrites.ts";
import {
  claimLabels,
  labelColor,
  labelName,
  type CopyLabels,
} from "./copy-labels.ts";
import {
  LANE_COPY_NOTE,
  runLaneCopy,
  type LanePlace,
  type LaneTarget,
} from "./copy-clip-to-lane.ts";
import { laneSource, type LaneSource } from "./lane-sources.ts";
import {
  refuseLaneOverwrites,
  type LaneCopySource,
} from "./source-overwrites.ts";
import { type SourceShare } from "./source-plan.ts";
import { type DuplicateParams } from "./duplicate-one-source.ts";

/** Everything a take-lane copy of a track reads off the call. */
export interface TracksToLanesArgs {
  sources: SourceShare[];
  labels: CopyLabels;
  count: number;
  params: DuplicateParams;
  takeLaneName: string | undefined;
}

/**
 * Copies each source's arrangement clips onto the take lanes its toPath names,
 * one entry per destination.
 * @param args - The sources, their destinations, and the call's labels
 * @returns One entry per destination, in the order toPath named them
 */
export function duplicateTracksToLanes(args: TracksToLanesArgs): object[] {
  warnUnusedTrackParams(args.count, args.params);

  const meter = songMeter();
  // Reads each lane once, so a copy can say what it overwrote.
  const ledger = copyLedger();

  return planLaneCopies(args.sources, args.labels).map((copy) =>
    copy.target == null
      ? skippedCopy(copy.entry, copy.refusal)
      : runLaneCopy(copy.entry, copy.target, args.takeLaneName, meter, ledger),
  );
}

/**
 * Whether the call names a take lane to copy onto, which is one of the two
 * things that send it here instead of to the new-track copier — a lane source
 * promoted onto a track's main lane is the other.
 * @param type - What is being duplicated
 * @param toPath - Destination path(s) as the caller wrote them
 * @param fromLane - Whether a source names a take lane
 * @returns True when a destination names a lane (`t2/l0`, `t2/l+`)
 * @throws Error when a destination carries a position, which a track copy can't use
 */
export function namesTakeLaneDestination(
  type: string,
  toPath: string | undefined,
  fromLane: boolean,
): boolean {
  if (type !== "track") {
    return false;
  }

  const entries = pathEntries(toPath, "toPath");

  for (const entry of entries) {
    refuseDestinationPosition(entry, fromLane);
  }

  return entries.some((entry) => takeLanePathEntry(entry) != null);
}

// --- Helpers below main exports ---

/** One destination of one source: where its clips go, or why they can't. */
type LaneCopy =
  | { entry: string; target: LaneTarget; refusal?: undefined }
  | { entry: string; target?: undefined; refusal: string };

/**
 * Refuses a destination that carries a position. A track copy keeps every clip
 * where it already sits, so one coordinate can't speak for them all — and
 * nothing has been created yet.
 * @param entry - One destination, as the caller wrote it
 * @param fromLane - Whether a source names a take lane, which makes a bare
 *   track a destination too
 * @throws Error when the entry names a position on a place this copier uses
 */
function refuseDestinationPosition(entry: string, fromLane: boolean): void {
  const path = parsedPath(entry);

  if (path?.kind !== "arrangement-position" || path.lane == null) {
    return;
  }

  const onLane = path.lane.kind === "take-lane";

  // A bare track is a destination only for a lane source; for a track source it
  // names a new track, which this copier doesn't make.
  if (!onLane && !fromLane) {
    return;
  }

  throw new Error(
    `toPath "${entry}" names a position, but a track copy keeps each clip's ` +
      `own; name the ${onLane ? "lane" : "track"} alone, as ` +
      `"${formatObjectPath(path.lane)}"`,
  );
}

/**
 * One destination parsed, or null when it doesn't parse. A toPath that names
 * no lane is ignored by this copier, so it isn't complained about here either.
 * @param entry - One destination, as the caller wrote it
 * @returns What it names, or null
 */
function parsedPath(entry: string): ObjectPath | null {
  try {
    return parseObjectPath(entry, "toPath");
  } catch {
    return null;
  }
}

/**
 * Warns for the params a lane copy can't use. A lane takes clips at the
 * positions they already have, so the count and the new-track params say
 * nothing about it.
 * @param count - Requested number of copies
 * @param params - The track params the call sent
 */
function warnUnusedTrackParams(count: number, params: DuplicateParams): void {
  if (count > 1) {
    console.warn(
      `count ${count} ignored: a track's clips go once to each lane toPath names`,
    );
  }

  // routeToSource turns the other two on itself, so it speaks for all three.
  const unusable = params.routeToSource
    ? ["routeToSource"]
    : [
        ...(params.withoutClips === true ? ["withoutClips"] : []),
        ...(params.withoutDevices === true ? ["withoutDevices"] : []),
      ];

  if (unusable.length > 0) {
    console.warn(`${unusable.join("/")} ignored: ${LANE_COPY_NOTE}`);
  }
}

/**
 * Plans every destination in the call before any lane exists, so a refusal
 * costs nothing: the labels are claimed, the tracks are checked, a copy over
 * a later source is refused, and each `l+` lands after the lanes the entries
 * before it named.
 * @param sources - The sources, in call order
 * @param labels - The call's names and colors
 * @returns One plan per destination, in the order the call named them
 */
function planLaneCopies(
  sources: SourceShare[],
  labels: CopyLabels,
): LaneCopy[] {
  const copies: LaneCopy[] = [];
  /** Lanes each destination track will have, as the plan grows. */
  const laneCounts = new Map<number, number>();
  const planned: LaneCopySource[] = [];

  for (const share of sources) {
    const source = laneSource(share.id);
    const entries = pathEntries(share.toPath, "toPath");
    const first = copies.length;

    claimLabels(labels, entries.length);

    for (const [index, entry] of entries.entries()) {
      copies.push(
        planOneCopy(entry, source, laneCounts, {
          name: labelName(labels, index),
          color: labelColor(labels, index),
        }),
      );
    }

    planned.push({ ...share, ...source, copies: copies.slice(first) });
  }

  refuseLaneOverwrites(planned);

  return refuseLanesPastCap(copies);
}

/**
 * Plans one destination: the lane or main lane it names, or why its clips can't
 * land there.
 * @param entry - The destination as the caller wrote it
 * @param source - The source's clips and type
 * @param laneCounts - Lanes each track will have, updated as the plan grows
 * @param label - The name and color for this destination's clips
 * @param label.name - Name for them, or undefined to keep the source's
 * @param label.color - Color for them, or undefined to keep the source's
 * @returns The plan for this destination
 */
function planOneCopy(
  entry: string,
  source: LaneSource,
  laneCounts: Map<number, number>,
  label: { name: string | undefined; color: string | undefined },
): LaneCopy {
  const path = takeLanePathEntry(entry);
  const place =
    path == null
      ? mainLanePlace(entry, source)
      : lanePlace(entry, path, source, laneCounts);

  return typeof place === "string"
    ? refused(entry, place)
    : { entry, target: { ...place, sourceClips: source.clips, ...label } };
}

/**
 * Plans a lane destination: the lane it names, or why its clips can't land
 * there.
 * @param entry - The destination as the caller wrote it
 * @param path - The lane the entry names
 * @param source - The source's clips and type
 * @param laneCounts - Lanes each track will have, updated as the plan grows
 * @returns Where the clips go, or why they can't
 */
function lanePlace(
  entry: string,
  path: TakeLanePath,
  source: LaneSource,
  laneCounts: Map<number, number>,
): LanePlace | string {
  const { trackIndex } = path;
  const track = LiveAPI.from(livePath.track(trackIndex));

  // Lanes first: a group track holds no clips at all, so its own reason beats
  // whatever the type check would say about it.
  try {
    assertTrackTakesLanes(track, trackIndex);
  } catch (error) {
    return errorMessage(error);
  }

  const blocker = clipsFitTrack(track, trackIndex, source);

  if (blocker != null) {
    return blocker;
  }

  const before =
    laneCounts.get(trackIndex) ?? track.getChildCount("take_lanes");
  const laneIndex = path.kind === "take-lane" ? path.laneIndex : before;
  const label = takeLaneLabel({ trackIndex, takeLane: laneIndex });

  if (label === source.lanePath) {
    return `toPath "${entry}" is the source lane; a lane can't copy onto itself`;
  }

  laneCounts.set(trackIndex, Math.max(before, laneIndex + 1));

  return { trackIndex, laneIndex, track, label };
}

/**
 * Plans a destination that names a track rather than a lane: a lane source's
 * clips are promoted onto that track's main lane, replacing whatever sits at
 * their positions. A track source has no such destination — a bare toPath makes
 * it a new track, which this copier doesn't do.
 * @param entry - The destination as the caller wrote it
 * @param source - The source's clips and type
 * @returns Where the clips go, or why they can't
 */
function mainLanePlace(entry: string, source: LaneSource): LanePlace | string {
  const path = parsedPath(entry);

  if (source.lanePath == null || path?.kind !== "track") {
    return noDestinationReason(entry, source);
  }

  const { trackIndex } = path;
  const track = LiveAPI.from(livePath.track(trackIndex));

  // Before the type check: a MIDI group track passes it and then fails every
  // create, one clip at a time.
  if (track.exists() && (track.getProperty("is_foldable") as number) > 0) {
    return `toPath "${entry}" is a group track, which holds no arrangement clips`;
  }

  return (
    clipsFitTrack(track, trackIndex, source) ?? {
      trackIndex,
      laneIndex: null,
      track,
      label: takeLaneLabel({ trackIndex, takeLane: null }),
    }
  );
}

/**
 * Why an entry names nowhere this copier can use.
 * @param entry - The destination as the caller wrote it
 * @param source - The source's clips and type
 * @returns The reason
 */
function noDestinationReason(entry: string, source: LaneSource): string {
  return source.lanePath == null
    ? `toPath "${entry}" names no take lane; a track's clips copy onto one, ` +
        `as "t2/l0" or "t2/l+"`
    : `toPath "${entry}" names no lane or track; a lane's clips copy onto ` +
        `another lane, as "t3/l0", or onto a track, as "t3", for its main lane`;
}

/**
 * Why the source's clips can't go on this track, or null when they can. Checked
 * before any lane is made, because a lane that ends up empty can't be taken
 * back.
 * @param track - The destination track
 * @param trackIndex - Its index, for the message
 * @param source - The source's clips and type
 * @returns The reason, or null
 */
function clipsFitTrack(
  track: LiveAPI,
  trackIndex: number,
  source: LaneSource,
): string | null {
  const blocker = clipCopyBlocker(source.isMidi, trackIndex, track);

  if (blocker != null) {
    return blocker;
  }

  if (source.clips.length === 0) {
    return source.lanePath == null
      ? `${source.label} has no arrangement clips on its main lane to copy`
      : `${source.label} has no arrangement clips to copy`;
  }

  if (!source.recreatable) {
    return (
      `${source.label} has no clip a lane copy can re-create: ` +
      `each is an audio clip with no sample`
    );
  }

  return null;
}

/**
 * Refuses the destinations that would put a track over the lane cap, before
 * any of them is created.
 * @param copies - Every destination in the call, in plan order
 * @returns The same plans, with the ones past the cap refused
 */
function refuseLanesPastCap(copies: LaneCopy[]): LaneCopy[] {
  const { dropped } = takeLaneTargetsThatFit(
    // A main-lane destination makes no lane, so it can't push a track over.
    copies.flatMap((copy) =>
      copy.target?.laneIndex == null
        ? []
        : [
            {
              trackIndex: copy.target.trackIndex,
              takeLane: copy.target.laneIndex,
            },
          ],
    ),
  );

  if (dropped.size === 0) {
    return copies;
  }

  return copies.map((copy) => {
    const reason =
      copy.target == null ? undefined : dropped.get(copy.target.label);

    return reason == null ? copy : refused(copy.entry, reason);
  });
}

/**
 * The song meter the result spells positions in.
 * @returns The Live Set's time signature
 */
function songMeter(): CopyMeter {
  const liveSet = LiveAPI.from(livePath.liveSet);

  return {
    songTimeSigNumerator: liveSet.getProperty("signature_numerator") as number,
    songTimeSigDenominator: liveSet.getProperty(
      "signature_denominator",
    ) as number,
  };
}

/**
 * A destination that gets no copy, with the reason for its entry.
 * @param entry - The destination as the caller wrote it
 * @param refusal - Why its clips can't land there
 * @returns The plan for it
 */
function refused(entry: string, refusal: string): LaneCopy {
  return { entry, refusal };
}
