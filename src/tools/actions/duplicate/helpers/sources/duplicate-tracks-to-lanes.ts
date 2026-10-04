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
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import {
  assertTrackTakesLanes,
  takeLaneLabel,
  takeLaneTargetsThatFit,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  arrangementPositionPath,
  pathEntries,
  takeLanePathEntry,
  type TakeLanePath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  formatObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import { type Cover } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type CopyDraft } from "../call/duplicate-call-types.ts";
import { type LanePlace, type LaneTarget } from "./copy-clip-to-lane.ts";
import { laneSource, type LaneSource } from "./lane-sources.ts";
import {
  refuseLaneOverwrites,
  type LaneCopySource,
} from "./source-overwrites.ts";
import { type SourceShare } from "./source-plan.ts";

/**
 * One draft per destination of each lane-copy source: the clips of its main
 * lane or take lane, re-created on each lane toPath names.
 * @param sources - The sources, in call order
 * @returns The drafts, a source's destinations together
 */
export function laneCopyDrafts(sources: SourceShare[]): CopyDraft[] {
  const copies = planLaneCopies(sources);

  return copies.map(({ entry, target, refusal }): CopyDraft => {
    const named: NamedTarget = { param: "path", value: entry };

    if (target == null) {
      return { named, skip: refusal };
    }

    return {
      named,
      make: (label) => ({
        body: {
          kind: "lane",
          entry,
          target: { ...target, name: label.name, color: label.color },
        },
        covers: () => laneCovers(target),
      }),
    };
  });
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

/** Where one destination's clips go, before the call's labels are paired. */
type PlannedLane = Omit<LaneTarget, "name" | "color">;

/** One destination of one source: where its clips go, or why they can't. */
type LaneCopy =
  | { entry: string; target: PlannedLane; refusal?: undefined }
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
  // The call already refused any entry that doesn't parse.
  const path = parseObjectPath(entry, "toPath");

  if (path.kind !== "arrangement-position" || path.lane == null) {
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
 * Plans every destination in the call before any lane exists, so a refusal
 * costs nothing: the tracks are checked, a copy over a later source is refused,
 * and each `l+` lands after the lanes the entries before it named.
 * @param sources - The sources, in call order
 * @returns One plan per destination, in the order the call named them
 */
function planLaneCopies(sources: SourceShare[]): LaneCopy[] {
  const copies: LaneCopy[] = [];
  /** Lanes each destination track will have, as the plan grows. */
  const laneCounts = new Map<number, number>();
  const planned: LaneCopySource[] = [];

  for (const share of sources) {
    const entries = pathEntries(share.toPath, "toPath");

    // Nothing can be copied from it: each destination keeps its slot.
    if (share.skip != null) {
      copies.push(
        ...entries.map((entry) => refused(entry, share.skip as string)),
      );

      continue;
    }

    const source = laneSource(share.id);
    const first = copies.length;

    for (const entry of entries) {
      copies.push(planOneCopy(entry, source, laneCounts));
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
 * @returns The plan for this destination
 */
function planOneCopy(
  entry: string,
  source: LaneSource,
  laneCounts: Map<number, number>,
): LaneCopy {
  const path = takeLanePathEntry(entry);
  const place =
    path == null
      ? mainLanePlace(entry, source)
      : lanePlace(entry, path, source, laneCounts);

  return typeof place === "string"
    ? refused(entry, place)
    : { entry, target: { ...place, sourceClips: source.clips } };
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
  const path = parseObjectPath(entry, "toPath");

  if (source.lanePath == null || path.kind !== "track") {
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
 * A destination that gets no copy, with the reason for its entry.
 * @param entry - The destination as the caller wrote it
 * @param refusal - Why its clips can't land there
 * @returns The plan for it
 */
function refused(entry: string, refusal: string): LaneCopy {
  return { entry, refusal };
}

/**
 * What a lane copy writes over: each source clip's own stretch of the lane it
 * lands on, since every clip keeps its position.
 * @param target - Where the clips go
 * @returns One stretch per source clip
 */
function laneCovers(target: PlannedLane): Cover[] {
  const lane = arrangementLaneOf({
    trackIndex: target.trackIndex,
    takeLane: target.laneIndex,
  });

  return target.sourceClips.flatMap((clip): Cover[] => {
    const from = clip.getProperty("start_time") as number;
    const to = clip.getProperty("end_time") as number;

    return Number.isFinite(from) && Number.isFinite(to) && to > from
      ? [
          {
            lane: target.label,
            from,
            to,
            as: arrangementPositionPath(lane, from),
          },
        ]
      : [];
  });
}
