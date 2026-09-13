// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Take lane targeting shared by ppal-create-clip and ppal-duplicate.
 *
 * Live API notes (verified against Live 12.4.3):
 * - `Track.take_lanes` excludes the main lane; `create_take_lane()` appends one
 *   and returns its ref. New lane index = prior `take_lanes.length`.
 * - `TakeLane` has one property (`name`) and two functions, `create_midi_clip(
 *   start, length)` and `create_audio_clip(file, start)`. They create
 *   arrangement clips on the lane and return the new clip ref directly. `Track`
 *   answers both too, landing on the main lane — that's what a promote uses.
 *   Neither audio call takes a length; the sample decides it.
 * - Take lanes are append-only: there is no `delete_take_lane`, `TakeLane` has
 *   no delete of its own, and `Track.delete_clip` silently no-ops on a
 *   take-lane clip. Clean up in Live's UI. A move off a lane empties the
 *   original instead (see take-lane-placeholder.ts).
 * - `Track.duplicate_clip_to_arrangement` silently no-ops when the SOURCE is a
 *   take-lane clip — it creates nothing anywhere. Re-create the clip instead
 *   (see recreate-clip.ts).
 * - Both no-ops return `id 0`, which a successful `delete_clip` returns too, so
 *   the return value can't be tested — check whether the clip is still there.
 * - An arrangement clip's extent (`end_time`) can't be set from the LOM.
 *   `end_marker` and `loop_end` accept the write and read back changed, but
 *   `end_time` doesn't follow, so a short sample can't be stretched to cover a
 *   longer clip. That's why an audio take is muted rather than overwritten with
 *   silence (see take-lane-placeholder.ts).
 */

import * as console from "#src/shared/max/v8-max-console.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { paramNamesSomething } from "#src/tools/shared/helpers/param-presence.ts";

/** Maximum take lanes per track (soft cap; total non-main lanes). */
export const MAX_TAKE_LANES = 8;

/** Matches the `take_lanes N` segment inside a clip path. The trailing `\b`
 * keeps the match anchored to the segment so future paths that happen to
 * contain the substring "take_lanes" elsewhere don't false-positive. */
const TAKE_LANE_PATH_RE = / take_lanes (\d+)\b/;

/**
 * Whether a clip lives on a take lane rather than the main arrangement lane.
 * Take-lane clip paths look like `live_set tracks N take_lanes M arrangement_clips K`;
 * main-lane arrangement clips use `live_set tracks N arrangement_clips K`.
 *
 * Use this whenever a tool is about to invoke a `Track`-scoped arrangement API
 * (`duplicate_clip_to_arrangement`, `delete_clip`) — those APIs silently no-op
 * on take-lane clips, so the caller must re-create the clip instead (duplicate,
 * move), empty it in place (the delete half of a move), or warn-and-skip
 * (everything else that needs the original gone).
 *
 * @param clip - The clip LiveAPI
 * @returns true when the clip's path includes a `take_lanes N` segment
 */
export function isTakeLaneClip(clip: LiveAPI): boolean {
  return TAKE_LANE_PATH_RE.test(clip.path);
}

/**
 * Which take lane a clip sits on.
 * @param clip - The clip LiveAPI
 * @returns The 0-based lane index, or null for a main-lane clip
 */
export function takeLaneIndexOfClip(clip: LiveAPI): number | null {
  const match = TAKE_LANE_PATH_RE.exec(clip.path);

  return match ? Number(match[1]) : null;
}

/**
 * A take lane target: a 0-based lane index.
 *
 * 0-based because `take_lanes` excludes the main lane, so the index is the Live
 * API index — the same number the `t0/l<n>` path segment carries. The 1-based
 * `takeLane` param is converted on the way in.
 */
export type TakeLaneTarget = number;

/** One arrangement destination: which track, and which of its lanes. */
export interface ArrangementTrack {
  trackIndex: number;
  /** Take lane target, or null for the main lane. */
  takeLane: TakeLaneTarget | null;
}

/**
 * Read the take lane a clip path names.
 * @param path - A parsed clip path
 * @returns The lane target, or null for the main lane
 */
export function takeLaneFromPath(path: ClipPath): TakeLaneTarget | null {
  return path.kind === "take-lane" ? path.laneIndex : null;
}

/**
 * Spells a destination the way the caller wrote it — the bare track for the
 * main lane. Doubles as the key a resolved lane is stored under.
 * @param target - The destination
 * @returns The path, e.g. "t0/l3" or "t0"
 */
export function takeLaneLabel(target: ArrangementTrack): string {
  const { trackIndex, takeLane } = target;

  return takeLane == null ? `t${trackIndex}` : `t${trackIndex}/l${takeLane}`;
}

/**
 * Warn when `duplicate` was given take-lane params it has no use for — a
 * non-clip type, or a session destination. Neither value is validated here: a
 * malformed one on a duplicate that ignores it should warn, not throw.
 * @param type - The duplicate target type ("clip", "track", etc.)
 * @param destination - "session" | "arrangement" | undefined
 * @param takeLane - Raw takeLane value from the tool args
 * @param warn - console.warn binding (Max-aware in V8, native in tests)
 * @param takeLaneName - Raw takeLaneName value from the tool args
 */
export function warnUnusedTakeLane(
  type: string,
  destination: string | undefined,
  takeLane: number | string | null | undefined,
  warn: (...args: unknown[]) => void,
  takeLaneName?: string | null,
): void {
  const unusable = [
    ...(isTakeLaneRequested(takeLane) ? ["takeLane"] : []),
    ...(paramNamesSomething(takeLaneName) ? ["takeLaneName"] : []),
  ].join(" and ");

  if (unusable === "") {
    return;
  }

  if (type !== "clip") {
    warn(
      `${unusable} ignored: only supported when duplicating clips (type "${type}")`,
    );
  } else if (destination === "session") {
    warn(`${unusable} ignored for session destination (arrangement-only)`);
  }
}

export interface ResolvedTakeLane {
  /** The resolved TakeLane LiveAPI object. */
  lane: LiveAPI;
  /** 0-based lane index (matches the `l<n>` path segment). */
  laneIndex: number;
}

/**
 * Whether a raw takeLane value requests a (non-main) take lane. `0` and `"0"`
 * pick the main lane, and so does anything that names nothing. takeLane is
 * deprecated, so a caller dropping it may still send a null — which arrives as
 * the string "null", and which the framework already treats as unsent.
 * @param takeLane - Raw takeLane value from a tool argument
 * @returns true when a non-main take lane was requested
 */
export function isTakeLaneRequested(
  takeLane: number | string | null | undefined,
): boolean {
  if (!paramNamesSomething(takeLane)) {
    return false;
  }

  return takeLane !== 0 && takeLane !== "0";
}

/**
 * Normalize a raw takeLane argument to a target, or null for the main lane.
 * Everything {@link isTakeLaneRequested} calls unset means the main lane.
 * The param is 1-based and the target is 0-based, so `N` becomes lane `N - 1`.
 * @param takeLane - Raw takeLane value from a tool argument
 * @returns A TakeLaneTarget, or null to target the main lane
 */
export function normalizeTakeLaneTarget(
  takeLane: number | string | null | undefined,
): TakeLaneTarget | null {
  if (!isTakeLaneRequested(takeLane)) {
    return null;
  }

  const n = typeof takeLane === "number" ? takeLane : Number(takeLane);

  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `takeLane must be 0 or a positive integer (got "${takeLane}"); ` +
        `name the lane by index, e.g. path "t0/l0"`,
    );
  }

  return n - 1;
}

/**
 * Resolve (auto-creating as needed) the target take lane on a track.
 * The target auto-creates lanes up to that index (mirroring scene
 * auto-create). The MAX_TAKE_LANES cap is enforced. takeLaneName names only the
 * target lane, and only when this call created it — existing lanes and any
 * intermediate lanes auto-created to fill a gap are left unnamed.
 *
 * NO ROLLBACK: Live has no take-lane delete (see file header), so a lane created
 * here is permanent. The one residual leak is unfixable: if a later clip write
 * fails on a freshly created lane, that empty lane persists. Do all other
 * throwing validation (e.g. invalid takeLane) before calling this — and pick
 * the destinations with {@link takeLaneTargetsThatFit} first, or a later
 * destination's cap error strands the lanes the earlier ones made.
 * @param track - The regular track LiveAPI to resolve the lane on
 * @param target - Normalized take lane target (0-based lane index)
 * @param takeLaneName - Optional name for a newly created lane
 * @returns The resolved take lane and its 0-based index
 */
export function resolveTakeLane(
  track: LiveAPI,
  target: TakeLaneTarget,
  takeLaneName?: string | null,
): ResolvedTakeLane {
  const currentCount = track.getChildIds("take_lanes").length;
  const laneIndex = target;

  assertTakeLaneCapacity(laneIndex);

  // Auto-create lanes until the target lane exists (empty lanes persist).
  for (let i = currentCount; i <= laneIndex; i++) {
    track.call("create_take_lane");
  }

  const lane = track.child("take_lanes", String(laneIndex));
  const laneWasCreated = laneIndex >= currentCount;

  if (takeLaneName != null && takeLaneName !== "") {
    if (laneWasCreated) {
      lane.setAll({ name: takeLaneName });
    } else {
      console.warn(
        `takeLaneName ignored: take lane ${laneIndex} already exists and keeps its own name`,
      );
    }
  }

  return { lane, laneIndex };
}

/** A destination {@link takeLaneTargetsThatFit} kept, so its lane is known. */
export type FittingTakeLaneTarget<T extends ArrangementTrack> = T & {
  takeLane: TakeLaneTarget;
};

/**
 * Picks the take-lane destinations that fit, warning once per lane dropped.
 *
 * A destination that doesn't fit is dropped rather than failing the call, so
 * the destinations alongside it — main lane included — still land. Resolving
 * auto-creates lanes up to the index, so only that index has to fit.
 * @param targets - Every destination in the call, in resolve order
 * @returns The take-lane destinations that fit, in the order given
 */
export function takeLaneTargetsThatFit<T extends ArrangementTrack>(
  targets: T[],
): FittingTakeLaneTarget<T>[] {
  const dropped = new Set<string>();
  const fitting: FittingTakeLaneTarget<T>[] = [];

  for (const target of targets) {
    const { takeLane } = target;

    if (takeLane == null) {
      continue;
    }

    const key = takeLaneLabel(target);

    if (dropped.has(key)) {
      continue;
    }

    if (takeLane + 1 > MAX_TAKE_LANES) {
      dropped.add(key);
      console.warn(`skipping "${key}" — ` + takeLaneCapacityMessage(takeLane));
      continue;
    }

    fitting.push({ ...target, takeLane });
  }

  return fitting;
}

/**
 * Checks a lane index is within the per-track cap. Callers pick their
 * destinations with {@link takeLaneTargetsThatFit} first, so this is a
 * backstop — reaching it means a lane was resolved that was never checked.
 * @param laneIndex - 0-based index of the lane about to be resolved
 * @throws If the lane would exceed MAX_TAKE_LANES
 */
function assertTakeLaneCapacity(laneIndex: number): void {
  if (laneIndex + 1 <= MAX_TAKE_LANES) {
    return;
  }

  throw new Error(takeLaneCapacityMessage(laneIndex));
}

/**
 * Says why a lane doesn't fit.
 * @param laneIndex - 0-based index of the lane that didn't fit
 * @returns The explanation
 */
function takeLaneCapacityMessage(laneIndex: number): string {
  return `take lane "l${laneIndex}" is out of range: a track has "l0" through "l${MAX_TAKE_LANES - 1}"`;
}
