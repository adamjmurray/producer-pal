// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A track source with a take-lane destination: every clip on the source's main
// arrangement lane is re-created on the target lane, at the same position. A
// lane holds clips and nothing else, so the devices, mixer, routing and session
// clips a new-track copy carries stay behind — the lane's own entry says so.
//
// Every destination is checked before the first lane is created: a lane can't
// be deleted, so a cap or type error found halfway would strand the lanes
// already made.

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  assertTrackTakesLanes,
  isTakeLaneClip,
  resolveTakeLane,
  takeLaneLabel,
  takeLaneTargetsThatFit,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  canRecreateClip,
  PartialRecreateError,
  recreateClip,
  recreatedClipLosses,
} from "#src/tools/shared/clip/recreate-clip.ts";
import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";
import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import {
  pathEntries,
  takeLanePathEntry,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  formatObjectPath,
  parseObjectPath,
  type ObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  getMinimalClipInfo,
  skippedCopy,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";
import { type CopyMeter, refusedCopy } from "../clip/copy-entries.ts";
import {
  claimLabels,
  labelColor,
  labelName,
  type CopyLabels,
} from "./copy-labels.ts";
import { type SourceShare } from "./source-plan.ts";
import { type DuplicateParams } from "./duplicate-one-source.ts";

/** What a lane copy leaves behind, said once on the lane's own entry. */
const LANE_COPY_NOTE =
  "clips only: a take lane takes no devices, routing, mixer settings or session clips";

/** Everything a take-lane copy of a track reads off the call. */
export interface TracksToLanesArgs {
  sources: SourceShare[];
  labels: CopyLabels;
  count: number;
  params: DuplicateParams;
  takeLaneName: string | undefined;
}

/**
 * Copies each source track's main-lane arrangement clips onto the take lanes
 * its toPath names, one entry per destination.
 * @param args - The sources, their destinations, and the call's labels
 * @returns One entry per destination, in the order toPath named them
 */
export function duplicateTracksToLanes(args: TracksToLanesArgs): object[] {
  warnUnusedTrackParams(args.count, args.params);

  const meter = songMeter();

  return planLaneCopies(args.sources, args.labels).map((copy) =>
    runLaneCopy(copy, args.takeLaneName, meter),
  );
}

/**
 * Whether the call copies a track onto a take lane, which is what sends it here
 * instead of to the new-track copier.
 * @param type - What is being duplicated
 * @param toPath - Destination path(s) as the caller wrote them
 * @returns True when a track source's toPath names a lane (`t2/l0`, `t2/l+`)
 * @throws Error when a lane entry carries a position, which a track copy can't use
 */
export function namesTakeLaneDestination(
  type: string,
  toPath: string | undefined,
): boolean {
  if (type !== "track") {
    return false;
  }

  const entries = pathEntries(toPath, "toPath");

  for (const entry of entries) {
    refuseLanePosition(entry);
  }

  return entries.some((entry) => takeLanePathEntry(entry) != null);
}

// --- Helpers below main exports ---

/** Where one destination's clips go, once the checks have passed. */
interface LaneTarget {
  trackIndex: number;
  laneIndex: number;
  /** The destination track. Planning and copying are one synchronous call, so
   * this object lives no longer than the request that built it. */
  track: LiveAPI;
  /** `t2/l1`: the cap check's key, and the path the entry reports. */
  label: string;
  /** The source's main-lane clips, in order */
  sourceClips: LiveAPI[];
  name: string | undefined;
  color: string | undefined;
}

/** One destination of one source: where its clips go, or why they can't. */
type LaneCopy =
  | { entry: string; target: LaneTarget; refusal?: undefined }
  | { entry: string; target?: undefined; refusal: string };

/** What one source contributes to every destination it names. */
interface LaneSource {
  clips: LiveAPI[];
  /** Whether any clip can be rebuilt at all: an audio one needs its sample. */
  recreatable: boolean;
  isMidi: boolean;
  /** How the source is addressed, for a refusal that names it */
  label: string;
}

/** Where one clip lands, and how the copy is labeled. */
interface LaneDestination {
  lane: LiveAPI;
  /** The lane's path, so an entry can name where the copy would have gone. */
  label: string;
  meter: CopyMeter;
  name: string | undefined;
  color: string | undefined;
}

/**
 * Refuses a lane destination that carries a position. A track copy keeps every
 * clip where it already sits, so one coordinate can't speak for them all —
 * and nothing has been created yet.
 * @param entry - One destination, as the caller wrote it
 * @throws Error when the entry names a take lane and a position
 */
function refuseLanePosition(entry: string): void {
  const path = parsedPath(entry);

  if (
    path?.kind !== "arrangement-position" ||
    path.lane?.kind !== "take-lane"
  ) {
    return;
  }

  throw new Error(
    `toPath "${entry}" names a position, but a track copy keeps each clip's ` +
      `own; name the lane alone, as "${formatObjectPath(path.lane)}"`,
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
 * costs nothing: the labels are claimed, the tracks are checked, and each `l+`
 * lands after the lanes the entries before it named.
 * @param sources - The source tracks, in call order
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

  for (const share of sources) {
    const track = validateIdType(share.id, "track");
    const entries = pathEntries(share.toPath, "toPath");
    const clips = mainLaneClips(track);
    const source: LaneSource = {
      clips,
      recreatable: clips.some(canRecreateClip),
      isMidi: (track.getProperty("has_midi_input") as number) > 0,
      label: targetLabel(track),
    };

    claimLabels(labels, entries.length);

    for (const [index, entry] of entries.entries()) {
      copies.push(
        planOneCopy(entry, source, laneCounts, {
          name: labelName(labels, index),
          color: labelColor(labels, index),
        }),
      );
    }
  }

  return refuseLanesPastCap(copies);
}

/**
 * Plans one destination: the lane it names, or why its clips can't land there.
 * @param entry - The destination as the caller wrote it
 * @param source - The source track's clips and type
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

  if (path == null) {
    return refused(
      entry,
      `toPath "${entry}" names no take lane; a track's clips copy onto one, ` +
        `as "t2/l0" or "t2/l+"`,
    );
  }

  const { trackIndex } = path;
  const track = LiveAPI.from(livePath.track(trackIndex));
  const blocker = laneTrackBlocker(track, trackIndex, source);

  if (blocker != null) {
    return refused(entry, blocker);
  }

  const before =
    laneCounts.get(trackIndex) ?? track.getChildCount("take_lanes");
  const laneIndex = path.kind === "take-lane" ? path.laneIndex : before;

  laneCounts.set(trackIndex, Math.max(before, laneIndex + 1));

  return {
    entry,
    target: {
      trackIndex,
      laneIndex,
      track,
      label: takeLaneLabel({ trackIndex, takeLane: laneIndex }),
      sourceClips: source.clips,
      ...label,
    },
  };
}

/**
 * Why the source's clips can't go on a lane of this track, or null when they
 * can. Both halves are checked before any lane is made, because a lane that
 * ends up empty can't be taken back.
 * @param track - The destination track
 * @param trackIndex - Its index, for the message
 * @param source - The source track's clips and type
 * @returns The reason, or null
 */
function laneTrackBlocker(
  track: LiveAPI,
  trackIndex: number,
  source: LaneSource,
): string | null {
  // Lanes first: a group track reads as audio, and "is audio" would be the
  // wrong reason for one.
  try {
    assertTrackTakesLanes(track, trackIndex);
  } catch (error) {
    return errorMessage(error);
  }

  const blocker = clipCopyBlocker(source.isMidi, trackIndex, track);

  if (blocker != null) {
    return blocker;
  }

  if (source.clips.length === 0) {
    return `${source.label} has no arrangement clips on its main lane to copy`;
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
    copies.flatMap((copy) =>
      copy.target == null
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
 * Copies one source's clips onto the lane its plan named, creating the lane
 * (and any before it) on the way.
 * @param copy - The plan for this destination
 * @param takeLaneName - Deprecated: name for a lane this call creates
 * @param meter - The song meter every position is spelled in
 * @returns The lane's entry in the result
 */
function runLaneCopy(
  copy: LaneCopy,
  takeLaneName: string | undefined,
  meter: CopyMeter,
): object {
  if (copy.target == null) {
    return skippedCopy(copy.entry, copy.refusal);
  }

  const { track, laneIndex, label, sourceClips, name, color } = copy.target;
  const before = track.getChildCount("take_lanes");
  const { lane } = resolveTakeLane(track, laneIndex, takeLaneName);
  const created = laneIndex >= before;
  const losses = new Set<string>();
  // A create truncates whatever it lands on, so a take already at the position
  // is replaced, as it is on the main lane.
  const clips = sourceClips.map((clip) =>
    copyClipToLane(clip, { lane, label, meter, name, color }, losses),
  );

  return {
    id: lane.id,
    path: label,
    ...(created ? { created: true as const } : {}),
    // resolveTakeLane names a lane only when it made it, so that is the one
    // case the name is worth reporting.
    ...(created && paramNamesSomething(takeLaneName)
      ? { name: takeLaneName }
      : {}),
    clips,
    reason: [LANE_COPY_NOTE, ...losses].join("; "),
  };
}

/**
 * Re-creates one clip on the lane, at the position it already had.
 * @param clip - The source clip
 * @param destination - The lane, its path, the song meter, and the copy's labels
 * @param losses - What re-creating cost, collected for the lane's own entry
 * @returns The copy, or why this clip got none
 */
function copyClipToLane(
  clip: LiveAPI,
  destination: LaneDestination,
  losses: Set<string>,
): MinimalClipInfo | TargetSkip {
  const { lane, label, meter, name, color } = destination;
  const startBeats = clip.getProperty("start_time") as number;
  // Addressed where the copy was headed, so an entry pastes back as a path.
  const missed = (reason: string): TargetSkip =>
    refusedCopy({ beats: startBeats, label }, meter, reason);

  if (!canRecreateClip(clip)) {
    return missed(
      "a lane copy is re-created from the sample, and this audio clip has none",
    );
  }

  const clipLosses = recreatedClipLosses(clip);

  try {
    const copy = recreateClip(clip, lane, startBeats, name, color, clipLosses);

    for (const loss of clipLosses) {
      losses.add(loss);
    }

    return getMinimalClipInfo(copy);
  } catch (error) {
    if (error instanceof PartialRecreateError) {
      return {
        ...getMinimalClipInfo(error.partialClip),
        reason: `the take-lane copy is incomplete (${errorMessage(error)})`,
      };
    }

    return missed(`the take-lane copy failed: ${errorMessage(error)}`);
  }
}

/**
 * The clips on a track's main arrangement lane. Whether Live's
 * `arrangement_clips` takes in the lanes' clips on a track that has lanes isn't
 * settled here, so the take-lane paths are filtered out.
 * @param track - The source track
 * @returns Its main-lane clips, in order
 */
function mainLaneClips(track: LiveAPI): LiveAPI[] {
  return track
    .getChildIds("arrangement_clips")
    .map((id) => LiveAPI.from(id))
    .filter((clip) => clip.exists() && !isTakeLaneClip(clip));
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
