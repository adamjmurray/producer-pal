// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live creates and deletes a locator at the playhead, so a locator edit moves
// it. On a Set that was playing, the stop and the playhead writes also drag the
// start marker along. The call notes both and puts them back when the edits
// are done.

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { waitForPlayheadPosition } from "./locator-updates.ts";

/** Where the playhead and the start marker were, in beats. */
export interface RememberedTransport {
  playhead: number;
  startTime: number;
}

/**
 * Where the playhead and the start marker are, to put them back after locator
 * edits.
 * @param liveSet - The live_set LiveAPI object
 * @returns Both positions in beats
 */
export function rememberTransport(liveSet: LiveAPI): RememberedTransport {
  return {
    playhead: liveSet.getProperty("current_song_time") as number,
    startTime: liveSet.getProperty("start_time") as number,
  };
}

/**
 * Put the playhead, then the start marker, back where they were. Never throws,
 * so it can't hide the call's own result or error: a failure is a warning, and
 * one failing doesn't stop the other.
 *
 * Does nothing while playing: only a call that moved things has stopped
 * playback, and writing old positions over a running Set would jump it.
 * @param remembered - The positions to return to
 */
export async function restoreTransport(
  remembered: RememberedTransport,
): Promise<void> {
  let liveSet: LiveAPI;

  try {
    liveSet = LiveAPI.from(livePath.liveSet);

    if ((liveSet.getProperty("is_playing") as number) > 0) {
      return;
    }
  } catch (error) {
    console.warn(`Playhead not put back: ${errorMessage(error)}`);

    return;
  }

  await restorePlayhead(liveSet, remembered.playhead);
  await restoreStartTime(liveSet, remembered.startTime);
}

// --- Helpers below main export ---

/**
 * Put the playhead back, saying so if it can't be.
 * @param liveSet - The live_set LiveAPI object
 * @param beats - The position to return to, in beats
 */
async function restorePlayhead(liveSet: LiveAPI, beats: number): Promise<void> {
  try {
    const now = liveSet.getProperty("current_song_time") as number;

    if (Math.abs(now - beats) < SAME_TIME_EPSILON) {
      return;
    }

    liveSet.set("current_song_time", beats);

    if (await waitForPlayheadPosition(liveSet, beats)) {
      return;
    }

    console.warn(`Playhead not put back at ${barBeat(liveSet, beats)}`);
  } catch (error) {
    console.warn(`Playhead not put back: ${errorMessage(error)}`);
  }
}

/**
 * Put the start marker back, saying so if it can't be.
 * @param liveSet - The live_set LiveAPI object
 * @param beats - The position to return to, in beats
 */
async function restoreStartTime(
  liveSet: LiveAPI,
  beats: number,
): Promise<void> {
  const isBack = (): boolean =>
    Math.abs((liveSet.getProperty("start_time") as number) - beats) <
    SAME_TIME_EPSILON;

  try {
    if (isBack()) {
      return;
    }

    liveSet.set("start_time", beats);

    if (await waitUntil(isBack, { pollingInterval: 10, maxRetries: 10 })) {
      return;
    }

    console.warn(`Start marker not put back at ${barBeat(liveSet, beats)}`);
  } catch (error) {
    console.warn(`Start marker not put back: ${errorMessage(error)}`);
  }
}

/**
 * A time in the Set's meter, as the model reads it.
 * @param liveSet - The live_set LiveAPI object
 * @param beats - The time in beats
 * @returns The bar|beat
 */
function barBeat(liveSet: LiveAPI, beats: number): string {
  return abletonBeatsToBarBeat(
    beats,
    liveSet.getProperty("signature_numerator") as number,
    liveSet.getProperty("signature_denominator") as number,
  );
}
