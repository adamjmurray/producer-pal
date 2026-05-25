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

/** Maximum take lanes per track (soft cap; total non-main lanes). */
export const MAX_TAKE_LANES = 8;

/** Normalized take lane target: a 1-based lane number, or "new" to append. */
export type TakeLaneTarget = number | "new";

export interface ResolvedTakeLane {
  /** The resolved TakeLane LiveAPI object. */
  lane: LiveAPI;
  /** 1-based lane number (matches the takeLane param). */
  laneNumber: number;
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

  return n;
}

/**
 * Resolve (auto-creating as needed) the target take lane on a track.
 * A numeric target ensures at least that many lanes exist (auto-creating up to
 * the index, mirroring scene auto-create); "new" appends a fresh lane. The
 * MAX_TAKE_LANES cap is enforced. takeLaneName names only the target lane, and
 * only when this call created it — existing lanes and any intermediate lanes
 * auto-created to fill a gap are left unnamed.
 * @param track - The regular track LiveAPI to resolve the lane on
 * @param target - Normalized take lane target (lane number or "new")
 * @param takeLaneName - Optional name for a newly created lane
 * @returns The resolved take lane and its 1-based number
 */
export function resolveTakeLane(
  track: LiveAPI,
  target: TakeLaneTarget,
  takeLaneName?: string | null,
): ResolvedTakeLane {
  const currentCount = track.getChildIds("take_lanes").length;
  const targetCount = target === "new" ? currentCount + 1 : target;

  if (targetCount > MAX_TAKE_LANES) {
    throw new Error(
      `Track has reached the ${MAX_TAKE_LANES} take lane limit. Delete unwanted lanes in Live first.`,
    );
  }

  // Auto-create lanes until the target lane exists (empty lanes persist).
  for (let i = currentCount; i < targetCount; i++) {
    track.call("create_take_lane");
  }

  const laneIndex = targetCount - 1;
  const lane = track.child("take_lanes", String(laneIndex));
  const laneWasCreated = laneIndex >= currentCount;

  if (laneWasCreated && takeLaneName != null && takeLaneName !== "") {
    lane.setAll({ name: takeLaneName });
  }

  return { lane, laneNumber: targetCount };
}

/**
 * Throw a clean error if any clip on the lane overlaps the target time range.
 * No-op for lanes with no conflicting clip (including freshly created lanes).
 * @param lane - The resolved take lane LiveAPI object
 * @param startBeats - New clip start position in Ableton beats
 * @param lengthBeats - New clip length in beats (overlap window width)
 * @param laneNumber - 1-based lane number (for the message)
 * @param positionLabel - bar|beat label of the position (for the message)
 */
export function assertNoTakeLaneOverlap(
  lane: LiveAPI,
  startBeats: number,
  lengthBeats: number,
  laneNumber: number,
  positionLabel: string,
): void {
  const newEnd = startBeats + lengthBeats;

  for (const clip of lane.getChildren("arrangement_clips")) {
    const existingStart = clip.getProperty("start_time") as number;
    const existingEnd = clip.getProperty("end_time") as number;

    if (existingStart < newEnd && existingEnd > startBeats) {
      throw new Error(
        `Clip exists at ${positionLabel} on take lane ${laneNumber}. ` +
          `Use update-clip to modify, or takeLane: "new" for a fresh lane.`,
      );
    }
  }
}
