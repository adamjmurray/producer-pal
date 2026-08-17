// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Take lane targeting shared by ppal-create-clip and ppal-duplicate.
 *
 * Live API notes (verified against Live 12):
 * - `Track.take_lanes` excludes the main lane; `create_take_lane()` appends one
 *   and returns its ref. New lane index = prior `take_lanes.length`.
 * - `TakeLane.create_midi_clip(start, length)` / `create_audio_clip(file, start)`
 *   create arrangement clips on the lane and return the new clip ref directly.
 * - There is no `delete_take_lane` and `Track.delete_clip` does not remove
 *   take-lane clips, so take lanes are append-only (clean up in Live's UI).
 */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type ClipPath } from "#src/tools/shared/validation/object-path-helpers.ts";

/** Maximum take lanes per track (soft cap; total non-main lanes). */
export const MAX_TAKE_LANES = 8;

/** Matches the `take_lanes N` segment inside a clip path. The trailing `\b`
 * keeps the match anchored to the segment so future paths that happen to
 * contain the substring "take_lanes" elsewhere don't false-positive. */
const TAKE_LANE_PATH_RE = / take_lanes \d+\b/;

/**
 * Whether a clip lives on a take lane rather than the main arrangement lane.
 * Take-lane clip paths look like `live_set tracks N take_lanes M arrangement_clips K`;
 * main-lane arrangement clips use `live_set tracks N arrangement_clips K`.
 *
 * Use this whenever a tool is about to invoke a `Track`-scoped arrangement API
 * (`duplicate_clip_to_arrangement`, `delete_clip`) — those APIs silently
 * no-op on take-lane clips and the caller must warn-and-skip instead.
 *
 * @param clip - The clip LiveAPI
 * @returns true when the clip's path includes a `take_lanes N` segment
 */
export function isTakeLaneClip(clip: LiveAPI): boolean {
  return TAKE_LANE_PATH_RE.test(clip.path);
}

/**
 * A take lane target: a 0-based lane index, or "new" to append one.
 *
 * 0-based because `take_lanes` excludes the main lane, so the index is the Live
 * API index — the same number the `t0/l<n>` path segment carries. The 1-based
 * `takeLane` param is converted on the way in.
 */
export type TakeLaneTarget = number | "new";

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
  if (path.kind === "take-lane") return path.laneIndex;

  return path.kind === "new-take-lane" ? "new" : null;
}

/**
 * Keys a resolved take lane by the destination that asked for it, so several
 * destinations naming one lane share it. "new" keeps its own key: two
 * destinations both asking for a fresh lane on a track want the same new lane,
 * not one each.
 * @param trackIndex - Destination track index
 * @param target - Take lane target
 * @returns The key, spelled as the path segment it came from
 */
export function takeLaneKey(
  trackIndex: number,
  target: TakeLaneTarget,
): string {
  return `t${trackIndex}/l${target === "new" ? "+" : target}`;
}

/**
 * Warn when `duplicate` was given a takeLane it has no use for — a non-clip
 * type, or a session destination. The value isn't validated here: a malformed
 * takeLane on a duplicate that ignores it should warn, not throw.
 * @param type - The duplicate target type ("clip", "track", etc.)
 * @param destination - "session" | "arrangement" | undefined
 * @param takeLane - Raw takeLane value from the tool args
 * @param warn - console.warn binding (Max-aware in V8, native in tests)
 */
export function warnUnusedTakeLane(
  type: string,
  destination: string | undefined,
  takeLane: number | string | null | undefined,
  warn: (...args: unknown[]) => void,
): void {
  if (!isTakeLaneRequested(takeLane)) return;

  if (type !== "clip") {
    warn(
      `takeLane ignored: only supported when duplicating clips (type "${type}")`,
    );
  } else if (destination === "session") {
    warn(
      "duplicate: takeLane ignored for session destination (arrangement-only)",
    );
  }
}

export interface ResolvedTakeLane {
  /** The resolved TakeLane LiveAPI object. */
  lane: LiveAPI;
  /** 0-based lane index (matches the `l<n>` path segment). */
  laneIndex: number;
}

/**
 * Whether a raw takeLane value requests a (non-main) take lane. The main lane is
 * the default, selected by `0`, `null`, `undefined`, `""`, or `"0"`.
 * @param takeLane - Raw takeLane value from a tool argument
 * @returns true when a non-main take lane was requested
 */
export function isTakeLaneRequested(
  takeLane: number | string | null | undefined,
): boolean {
  return !(
    takeLane == null ||
    takeLane === "" ||
    takeLane === 0 ||
    takeLane === "0"
  );
}

/**
 * Normalize a raw takeLane argument to a target, or null for the main lane.
 * `0`, `null`, `undefined`, and `""` mean the main lane (unchanged behavior).
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

  if (takeLane === "new") {
    return "new";
  }

  const n = typeof takeLane === "number" ? takeLane : Number(takeLane);

  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `takeLane must be 0, a positive integer, or "new" (got "${takeLane}")`,
    );
  }

  return n - 1;
}

/**
 * Resolve (auto-creating as needed) the target take lane on a track.
 * A numeric target auto-creates lanes up to that index (mirroring scene
 * auto-create); "new" appends a fresh lane. The
 * MAX_TAKE_LANES cap is enforced. takeLaneName names only the target lane, and
 * only when this call created it — existing lanes and any intermediate lanes
 * auto-created to fill a gap are left unnamed.
 *
 * NO ROLLBACK: Live has no take-lane delete (see file header), so a lane created
 * here is permanent. The one residual leak is unfixable: if a later clip write
 * fails on a freshly created lane, that empty lane persists. Do all other
 * throwing validation (e.g. invalid takeLane) before calling this — and run
 * {@link assertAllTakeLanesFit} over the whole call first, or a later
 * destination's cap error strands the lanes the earlier ones made.
 * @param track - The regular track LiveAPI to resolve the lane on
 * @param target - Normalized take lane target (lane number or "new")
 * @param takeLaneName - Optional name for a newly created lane
 * @returns The resolved take lane and its 0-based index
 */
export function resolveTakeLane(
  track: LiveAPI,
  target: TakeLaneTarget,
  takeLaneName?: string | null,
): ResolvedTakeLane {
  const currentCount = track.getChildIds("take_lanes").length;
  const laneIndex = target === "new" ? currentCount : target;

  assertTakeLaneCapacity(laneIndex);

  // Auto-create lanes until the target lane exists (empty lanes persist).
  for (let i = currentCount; i <= laneIndex; i++) {
    track.call("create_take_lane");
  }

  const lane = track.child("take_lanes", String(laneIndex));
  const laneWasCreated = laneIndex >= currentCount;

  if (laneWasCreated && takeLaneName != null && takeLaneName !== "") {
    lane.setAll({ name: takeLaneName });
  }

  return { lane, laneIndex };
}

/**
 * Checks every destination in a call fits before any lane is created.
 *
 * Checking each destination on its own is not enough: they all read the track's
 * pre-call lane count, so nothing sees the lanes an earlier destination is
 * about to add. "t0/l7,t0/l+" passes that way and then throws mid-resolve,
 * leaving 8 permanent empty lanes and creating no clips.
 *
 * So count along instead, in the order the lanes are resolved and skipping
 * repeats the same way {@link takeLaneKey} does.
 * @param targets - Every destination in the call, in resolve order
 * @throws If any track would go past MAX_TAKE_LANES
 */
export function assertAllTakeLanesFit(targets: ArrangementTrack[]): void {
  const counts = new Map<number, number>();
  const resolved = new Set<string>();

  for (const { trackIndex, takeLane } of targets) {
    if (takeLane == null) continue;

    const key = takeLaneKey(trackIndex, takeLane);

    if (resolved.has(key)) continue;

    resolved.add(key);

    const count =
      counts.get(trackIndex) ??
      LiveAPI.from(livePath.track(trackIndex)).getChildIds("take_lanes").length;
    // Resolving auto-creates lanes up to the target, so the track ends up with
    // at least laneIndex + 1 of them.
    const laneIndex = takeLane === "new" ? count : takeLane;

    assertTakeLaneCapacity(laneIndex);
    counts.set(trackIndex, Math.max(count, laneIndex + 1));
  }
}

/**
 * Checks a lane index is within the per-track cap.
 * @param laneIndex - 0-based index of the lane about to be resolved
 * @throws If the lane would exceed MAX_TAKE_LANES
 */
function assertTakeLaneCapacity(laneIndex: number): void {
  if (laneIndex + 1 > MAX_TAKE_LANES) {
    throw new Error(
      `Track has reached the ${MAX_TAKE_LANES} take lane limit. Delete unwanted lanes in Live first.`,
    );
  }
}
