// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding what a conversion made. Live starts the work and returns at once, so
// the new track shows up on a later tick, and nothing says where. The track is
// whatever wasn't in the regular track list before.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { type ConvertedResult } from "#src/tools/clip/helpers/clip-results.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** How often to look for the new track, and its clip. */
const POLL_MS = 100;

/** How long to look for the clip once the track is there. */
const CLIP_WAIT_MS = 1000;

/** Where the converted clip sat, which is where its MIDI clip lands. */
export type SourcePlace =
  | { kind: "session"; slot: number }
  | { kind: "arrangement"; startTime: number };

/**
 * Every regular track's id, in track order.
 * @returns The ids
 */
export function regularTrackIds(): string[] {
  return LiveAPI.from(livePath.liveSet).getChildIds("tracks");
}

/**
 * Wait for tracks that weren't there before.
 * @param before - The ids from before the conversion started
 * @param waitMs - The longest to wait
 * @returns The new tracks' ids, in track order; empty when none came
 */
export async function waitForNewTracks(
  before: ReadonlySet<string>,
  waitMs: number,
): Promise<string[]> {
  const added = (): string[] =>
    regularTrackIds().filter((id) => !before.has(id));

  await waitUntil(() => added().length > 0, {
    pollingInterval: POLL_MS,
    maxRetries: Math.max(1, Math.floor(waitMs / POLL_MS)),
  });

  return added();
}

/**
 * The MIDI clip a conversion made on its new track: in the same slot as the
 * source (Session), or starting where it did (Arrangement). Waits a moment, in
 * case the clip lags the track.
 * @param trackId - The new track
 * @param place - Where the source clip sat
 * @returns The clip, or null when the track has none there
 */
export async function findConvertedClip(
  trackId: string,
  place: SourcePlace,
): Promise<LiveAPI | null> {
  const look = (): LiveAPI | null => clipAt(trackId, place);

  await waitUntil(() => look() != null, {
    pollingInterval: POLL_MS,
    maxRetries: CLIP_WAIT_MS / POLL_MS,
  });

  return look();
}

/**
 * What the entry says about the new track, and its clip when there is one.
 * @param trackId - The new track
 * @param clip - Its MIDI clip, if the conversion makes one
 * @returns The `converted` field
 */
export function convertedResult(
  trackId: string,
  clip: LiveAPI | null,
): ConvertedResult {
  const track = LiveAPI.from(trackId);

  return {
    track: { id: track.id, ...pathField(track) },
    ...(clip != null && {
      clip: {
        id: clip.id,
        ...pathField(clip),
        noteCount: getClipNoteCount(clip),
      },
    }),
  };
}

/**
 * The clip on a track at a place, if it's there.
 * @param trackId - The track
 * @param place - A Session slot, or an Arrangement start time
 * @returns The clip, or null
 */
function clipAt(trackId: string, place: SourcePlace): LiveAPI | null {
  const track = LiveAPI.from(trackId);
  const index = track.trackIndex;

  if (index == null) {
    return null;
  }

  if (place.kind === "session") {
    const clip = LiveAPI.from(
      livePath.track(index).clipSlot(place.slot).clip(),
    );

    return clip.exists() ? clip : null;
  }

  return (
    track
      .getChildren("arrangement_clips")
      .find(
        (clip) =>
          Math.abs(
            (clip.getProperty("start_time") as number) - place.startTime,
          ) < 0.001,
      ) ?? null
  );
}
