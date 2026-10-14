// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Finding what a conversion made. Live starts the work and returns at once, so
// the new track shows up on a later tick, and nothing says where. The track is
// whatever wasn't in the regular track list before.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { waitUntil } from "#src/shared/max/v8-wait-until.ts";
import { type ConvertedResult } from "#src/tools/clip/helpers/clip-results.ts";
import { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";
import { getDeviceType } from "#src/tools/shared/device/device-reader.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

/** How often to look for the new track, and its clip. */
const POLL_MS = 100;

/** How long to look for the clip and instrument once the track is there. */
const PARTS_WAIT_MS = 1000;

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

/** What a conversion put on its new track, besides the track itself. */
export interface ConvertedParts {
  /** The MIDI clip, in the source's slot or at its arrangement start */
  clip: LiveAPI | null;
  /** The track's first device, which plays the clip */
  instrument: LiveAPI | null;
}

/**
 * The MIDI clip and instrument a conversion made on its new track. The clip is
 * in the same slot as the source (Session), or starts where it did
 * (Arrangement). Waits a moment, in case either lags the track; returns at once
 * when both are there.
 * @param trackId - The new track
 * @param place - Where the source clip sat
 * @returns The clip and instrument, each null when the track has none
 */
export async function findConvertedParts(
  trackId: string,
  place: SourcePlace,
): Promise<ConvertedParts> {
  const look = (): ConvertedParts => ({
    clip: clipAt(trackId, place),
    instrument: LiveAPI.from(trackId).getChildAt("devices", 0),
  });

  await waitUntil(
    () => {
      const { clip, instrument } = look();

      return clip != null && instrument != null;
    },
    { pollingInterval: POLL_MS, maxRetries: PARTS_WAIT_MS / POLL_MS },
  );

  return look();
}

/**
 * What the entry says about the new track, its instrument and its clip.
 * @param trackId - The new track
 * @param parts - Its instrument and MIDI clip, whichever Live made
 * @returns The `converted` field
 */
export function convertedResult(
  trackId: string,
  parts: ConvertedParts,
): ConvertedResult {
  const { clip, instrument } = parts;
  const track = LiveAPI.from(trackId);

  return {
    track: { id: track.id, ...pathField(track), name: track.getName() },
    ...(instrument != null && {
      instrument: {
        id: instrument.id,
        ...pathField(instrument),
        type: getDeviceType(instrument),
        name: instrument.getName(),
      },
    }),
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
