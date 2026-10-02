// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  createInSessionSlot,
  requireCreatedArrangementClip,
  type SlotWork,
} from "#src/tools/clip/helpers/clip-results.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";

export interface AudioSessionClipResult extends SlotWork {
  clip: LiveAPI;
  sceneIndex: number;
}

/**
 * Creates an audio clip in a session clip slot
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param sampleFile - Absolute path to audio file
 * @param liveSet - LiveAPI liveSet object
 * @returns Object with clip, sceneIndex, the scenes created, and what it replaced
 */
export function createAudioSessionClip(
  trackIndex: number,
  sceneIndex: number,
  sampleFile: string,
  liveSet: LiveAPI,
): AudioSessionClipResult {
  const { clip, created, overwrote } = createInSessionSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    (clipSlot) => clipSlot.call("create_audio_clip", sampleFile),
    sampleFile,
  );

  return { clip, sceneIndex, created, overwrote };
}

export interface AudioArrangementClipResult {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
}

/**
 * Creates an audio clip in arrangement view on a track or take lane
 * @param trackIndex - Track index (0-based)
 * @param arrangementStartBeats - Start position in Ableton beats
 * @param sampleFile - Absolute path to audio file
 * @param takeLane - Take lane to create on, or null for the track's main lane
 * @param track - The already-resolved destination track, or null to resolve it
 * @returns Object with clip and arrangementStartBeats
 */
export function createAudioArrangementClip(
  trackIndex: number,
  arrangementStartBeats: number | null,
  sampleFile: string,
  takeLane: LiveAPI | null = null,
  track: LiveAPI | null = null,
): AudioArrangementClipResult {
  // Live API limit check
  if (
    arrangementStartBeats != null &&
    arrangementStartBeats > MAX_ARRANGEMENT_POSITION_BEATS
  ) {
    throw new Error(
      `arrangementStart is past the last position Live allows (${maxArrangementBarBeat()})`,
    );
  }

  const target = takeLane ?? track ?? LiveAPI.from(livePath.track(trackIndex));

  // Create audio clip at position
  const newClipResult = target.call(
    "create_audio_clip",
    sampleFile,
    arrangementStartBeats,
  ) as string;
  const clip = requireCreatedArrangementClip(
    newClipResult,
    trackIndex,
    takeLane?.takeLaneIndex ?? null,
    arrangementStartBeats,
    sampleFile,
  );

  return { clip, arrangementStartBeats };
}

/**
 * The last arrangement position Live allows, as a bar|beat in the song's meter.
 * @returns The position, e.g. "394201|1" in 4/4
 */
function maxArrangementBarBeat(): string {
  const liveSet = LiveAPI.from(livePath.liveSet);

  return abletonBeatsToBarBeat(
    MAX_ARRANGEMENT_POSITION_BEATS,
    liveSet.getProperty("signature_numerator") as number,
    liveSet.getProperty("signature_denominator") as number,
  );
}
