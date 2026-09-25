// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { findLocator } from "#src/tools/shared/locator/locators.ts";
import {
  locateTarget,
  type LocatorTarget,
  type SongMeter,
} from "./locator-targets.ts";
import { cleanupTempClip, extendSongIfNeeded } from "./song-extension.ts";

/**
 * Stop playback if currently playing (required for locator modifications)
 * @param liveSet - The live_set LiveAPI object
 * @returns True if playback was stopped
 */
export function stopPlaybackIfNeeded(liveSet: LiveAPI): boolean {
  const isPlaying = (liveSet.getProperty("is_playing") as number) > 0;

  if (isPlaying) {
    liveSet.call("stop_playing");
    console.warn("Playback stopped to modify locators");

    return true;
  }

  return false;
}

/**
 * Wait for the playhead to reach a time. Live moves it asynchronously after a
 * `current_song_time` write, and `set_or_delete_cue` acts wherever it is.
 *
 * The playhead can't pass the song's end: extend the song first
 * (`extendSongIfNeeded`) to reach a time beyond it.
 * @param liveSet - The live_set LiveAPI object
 * @param targetBeats - Expected position in beats
 * @returns True once it's there, false if it never got there
 */
export async function waitForPlayheadPosition(
  liveSet: LiveAPI,
  targetBeats: number,
): Promise<boolean> {
  return await waitUntil(
    () =>
      Math.abs(
        (liveSet.getProperty("current_song_time") as number) - targetBeats,
      ) < SAME_TIME_EPSILON,
    { pollingInterval: 10, maxRetries: 10 },
  );
}

/**
 * Toggle Live's cue at one time, which deletes the locator there — or creates
 * one where there is none. Stop playback first.
 * @param liveSet - The live_set LiveAPI object
 * @param beats - The time, in beats
 * @param meter - The song meter, to name the time in an error
 * @throws Error when the playhead doesn't get there: a toggle where it stalled
 *   would hit some other locator
 */
export async function toggleCueAt(
  liveSet: LiveAPI,
  beats: number,
  meter: SongMeter,
): Promise<void> {
  liveSet.set("current_song_time", beats);

  if (!(await waitForPlayheadPosition(liveSet, beats))) {
    const time = abletonBeatsToBarBeat(
      beats,
      meter.timeSigNumerator,
      meter.timeSigDenominator,
    );

    throw new Error(
      `Live didn't move the playhead to ${time}, so nothing changed there`,
    );
  }

  liveSet.call("set_or_delete_cue");
}

/**
 * Create a locator at the target's time.
 * @param liveSet - The live_set LiveAPI object
 * @param target - The time to create at, and the name to give it
 * @param meter - The song meter a bar|beat is read in
 * @param context - Context object with silenceWavPath
 * @returns Created locator info
 */
export async function createLocator(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
  context: { silenceWavPath?: string },
): Promise<Record<string, unknown>> {
  const { beats, found: existing } = locateTarget(liveSet, target, meter);
  const targetBeats = beats as number;

  if (existing) {
    return {
      operation: "skipped",
      detail: `a locator is already at ${target.value}`,
      time: target.value,
      existingId: existing.locator.id,
    };
  }

  stopPlaybackIfNeeded(liveSet);

  // The playhead can't pass the song's end, so extend it for a later locator.
  const tempClipInfo = extendSongIfNeeded(liveSet, targetBeats, context);

  try {
    await toggleCueAt(liveSet, targetBeats, meter);
  } finally {
    cleanupTempClip(tempClipInfo);
  }

  const found = findLocator(liveSet, { timeInBeats: targetBeats });

  if (found == null) {
    return {
      operation: "skipped",
      time: target.value,
      ...(target.name != null && { name: target.name }),
      ok: false,
      detail: `Live made no locator at ${target.value}`,
    };
  }

  if (target.name != null) {
    found.locator.set("name", target.name);
  }

  return { operation: "create", id: found.locator.id };
}

/**
 * Rename the locator an id or time target names.
 * @param liveSet - The live_set LiveAPI object
 * @param target - The locator, and its new name
 * @param meter - The song meter a bar|beat is read in
 * @returns Rename result
 */
export function renameLocator(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
): Record<string, unknown> {
  const { found } = locateTarget(liveSet, target, meter);

  if (found == null) {
    return {
      operation: "skipped",
      ok: false,
      ...(target.param === "locatorId"
        ? { detail: `no locator with id "${target.value}"`, id: target.value }
        : { detail: `no locator at ${target.value}`, time: target.value }),
    };
  }

  found.locator.set("name", target.name);

  return { operation: "rename", id: found.locator.id };
}

/**
 * Refuse a call that sends locator args with no locatorOperation to act on.
 *
 * Without an operation there is nothing to create, delete or rename, so the
 * args name no work at all and the call returns a bare id that reads as
 * success. They apply to the whole call, so there is no per-target result to
 * carry a skip. Nothing has been written yet when this runs.
 * @param locatorOperation - The operation, if given
 * @param args - The locator args that only mean something with an operation
 */
export function validateLocatorOperation(
  locatorOperation: string | undefined,
  args: { locatorId?: string; locatorTime?: string; locatorName?: string },
): void {
  if (locatorOperation != null) {
    return;
  }

  const sent = (["locatorId", "locatorTime", "locatorName"] as const).filter(
    (key) => args[key] != null,
  );

  if (sent.length > 0) {
    throw new Error(
      `${sent.join(", ")} require locatorOperation ("create", "delete", or "rename")`,
    );
  }
}
