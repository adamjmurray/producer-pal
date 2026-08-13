// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";

export interface AudioClipTiming {
  /** Whether Live is time-stretching the sample to the Set tempo */
  warping: boolean;
  /** The sample's full duration in seconds, from its frame count and rate */
  sampleSeconds: number;
  /** Playable region start, in real Ableton beats at the current tempo */
  startBeats: number;
  /** Playable region end, in real Ableton beats at the current tempo */
  endBeats: number;
  /** Where playback begins on the first pass (the start marker), in real beats */
  firstStartBeats: number;
}

/**
 * Read an audio clip's playable region in real Ableton beats.
 *
 * Live's marker properties change unit with `warping`: beats when the clip is
 * warped, **seconds** when it is not. Reading them without checking `warping`
 * silently under-reports an unwarped clip's timing by a factor of tempo/60.
 *
 * `Clip.length` is deliberately not used. On an unwarped *session* clip Live
 * reports the length the clip would have if it were still warped — a stale
 * value that never recomputes and does not track the Set tempo. Deriving the
 * region from the markers matches what Live itself computes for an arrangement
 * clip (`end_time - start_time`).
 *
 * @param clip - The audio clip to read
 * @returns The clip's warp state, sample duration, and region in real beats
 */
export function audioClipTiming(clip: LiveAPI): AudioClipTiming {
  const warping = (clip.getProperty("warping") as number) > 0;
  const isLooping = (clip.getProperty("looping") as number) > 0;

  const startMarker = clip.getProperty("start_marker") as number;
  const endMarker = clip.getProperty("end_marker") as number;
  const loopStart = clip.getProperty("loop_start") as number;
  const loopEnd = clip.getProperty("loop_end") as number;

  // A looping clip plays its loop brace; an unlooped one plays marker to marker.
  // Only warped clips reach the loop branch — Live forces `looping` off when
  // warp goes off, and forces warp back on if you set `looping`.
  const rawStart = isLooping ? loopStart : startMarker;
  const rawEnd = isLooping ? loopEnd : endMarker;

  const sampleSeconds = audioClipSampleSeconds(clip);

  if (warping) {
    // Markers are already beats. Not clamped to the sample: a warped clip's
    // region legitimately extends past the file, playing silence.
    return {
      warping,
      sampleSeconds,
      startBeats: rawStart,
      endBeats: rawEnd,
      firstStartBeats: startMarker,
    };
  }

  // Markers are seconds. Clamp to the file because `end_marker` is not bounded
  // by it — Live keeps whatever number was there when warping was switched off
  // and clamps at the file boundary during playback.
  const beatsPerSecond = currentTempo() / 60;
  // Only clamp when the sample's duration is actually known
  const toBeats = (seconds: number) =>
    (sampleSeconds > 0 ? Math.min(seconds, sampleSeconds) : seconds) *
    beatsPerSecond;

  return {
    warping,
    sampleSeconds,
    startBeats: toBeats(rawStart),
    endBeats: toBeats(rawEnd),
    firstStartBeats: toBeats(startMarker),
  };
}

/**
 * A clip's playable length in real Ableton beats, for either clip type.
 *
 * `Clip.length` is right for MIDI but stale for an unwarped session audio clip
 * (see audioClipTiming), so anything that compares a clip's length against a
 * requested length has to go through the markers for audio.
 *
 * @param clip - The clip to measure
 * @returns Length in real beats at the current tempo
 */
export function clipLengthBeats(clip: LiveAPI): number {
  if ((clip.getProperty("is_midi_clip") as number) > 0) {
    return clip.getProperty("length") as number;
  }

  const { startBeats, endBeats } = audioClipTiming(clip);

  return endBeats - startBeats;
}

/**
 * How many real beats one unit of a clip's marker properties is worth.
 *
 * `start_marker`, `end_marker`, `loop_start` and `loop_end` hold beats for MIDI
 * and warped audio, but **seconds** on an unwarped audio clip. Multiply a
 * marker by this to get beats; divide a requested beat position by it to get
 * the value to write. Reading also needs `markerClampSeconds` to match what
 * audioClipTiming reports, so `start`/`length` round-trip.
 *
 * @param clip - The clip whose markers are being read or written
 * @returns 1, or tempo/60 for an unwarped audio clip
 */
export function markerBeatsPerUnit(clip: LiveAPI): number {
  return markersAreSeconds(clip) ? currentTempo() / 60 : 1;
}

/**
 * How far a marker may be trusted before converting it to beats.
 *
 * An unwarped clip's `end_marker` is not bounded by the file — Live keeps
 * whatever number was there when warping went off. audioClipTiming clamps it
 * to the sample, so anything reading markers directly has to clamp the same
 * way or a `length` that came from read-clip writes back a region past the end
 * of the sample.
 *
 * @param clip - The clip whose markers are being read
 * @returns The sample duration in seconds, or 0 when no clamp applies
 */
export function markerClampSeconds(clip: LiveAPI): number {
  return markersAreSeconds(clip) ? audioClipSampleSeconds(clip) : 0;
}

/**
 * Whether a clip's marker properties hold seconds rather than beats.
 * @param clip - The clip to check
 * @returns True for an unwarped audio clip
 */
function markersAreSeconds(clip: LiveAPI): boolean {
  return (
    (clip.getProperty("is_audio_clip") as number) > 0 &&
    !((clip.getProperty("warping") as number) > 0)
  );
}

/**
 * An audio clip's full sample duration in seconds.
 * @param clip - The audio clip to measure
 * @returns Duration in seconds, or 0 when the sample rate is unavailable
 */
export function audioClipSampleSeconds(clip: LiveAPI): number {
  const sampleLength = clip.getProperty("sample_length") as number;
  const sampleRate = clip.getProperty("sample_rate") as number;

  if (!sampleRate || sampleRate <= 0) return 0;

  return sampleLength / sampleRate;
}

/**
 * The Live Set's current tempo.
 * @returns Tempo in BPM
 */
function currentTempo(): number {
  return LiveAPI.from(livePath.liveSet).getProperty("tempo") as number;
}
