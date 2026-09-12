// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Builds the track/clip/location/Live Set context handed to user code.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { PITCH_CLASS_NAMES } from "#src/shared/pitch.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import {
  type CodeClipContext,
  type CodeExecutionContext,
  type CodeLiveSetContext,
  type CodeLocationContext,
  type CodeTrackContext,
} from "./code-exec-types.ts";

/**
 * Build the full code execution context from Live API.
 *
 * @param clip - LiveAPI clip object
 * @param view - Session or arrangement view
 * @param clipIndex - 0-based position in the current batch (matches transforms' clip.index)
 * @param clipCount - Total clips in the current batch (matches transforms' clip.count)
 * @param sceneIndex - Scene index (session only)
 * @returns Context object for code execution
 */
export function buildCodeExecutionContext(
  clip: LiveAPI,
  view: "session" | "arrangement",
  clipIndex: number,
  clipCount: number,
  sceneIndex?: number,
): CodeExecutionContext {
  const track = buildTrackContext(clip);
  const clipContext = buildClipContext(clip, clipIndex, clipCount);
  const location = buildLocationContext(clip, view, sceneIndex);
  const liveSet = buildLiveSetContext();
  const beatsPerBar = getBeatsPerBar(clip);

  return { track, clip: clipContext, location, liveSet, beatsPerBar };
}

/**
 * Determine the view and location info for a clip.
 *
 * @param clip - LiveAPI clip object
 * @returns View, plus the scene index for a session clip
 */
export function getClipLocationInfo(clip: LiveAPI): {
  view: "session" | "arrangement";
  sceneIndex?: number;
} {
  const isArrangement = (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (isArrangement) {
    return { view: "arrangement" };
  }

  // Session clip — extract scene index from path
  const clipPath = clip.path;
  const slotMatch = clipPath.match(/clip_slots (\d+)/);
  const sceneIndex = slotMatch?.[1]
    ? Number.parseInt(slotMatch[1], 10)
    : undefined;

  return { view: "session", sceneIndex };
}

// --- Private helpers ---

function buildTrackContext(clip: LiveAPI): CodeTrackContext {
  // Navigate from clip to track
  const clipPath = clip.path;
  // Clip path is like "live_set tracks 0 clip_slots 1 clip"
  // or "live_set tracks 0 arrangement_clips 2"
  const trackMatch = clipPath.match(/tracks (\d+)/);
  const trackIndex = trackMatch?.[1] ? Number.parseInt(trackMatch[1], 10) : 0;

  const track = LiveAPI.from(livePath.track(trackIndex));

  const name = track.getProperty("name") as string;
  const hasMidiInput = (track.getProperty("has_midi_input") as number) > 0;
  const color = track.getColor();

  return {
    index: trackIndex,
    name,
    type: hasMidiInput ? "midi" : "audio",
    color,
  };
}

function buildClipContext(
  clip: LiveAPI,
  index: number,
  count: number,
): CodeClipContext {
  const id = clip.id;
  const name = clip.getProperty("name") as string | null;
  const sigNum = clip.getProperty("signature_numerator") as number;
  const sigDenom = clip.getProperty("signature_denominator") as number;
  // Live reports length in Ableton (quarter-note) beats; expose musical beats so
  // it shares a unit with note start/duration and beatsPerBar.
  const length = (clip.getProperty("length") as number) * (sigDenom / 4);
  const looping = (clip.getProperty("looping") as number) > 0;

  return {
    id,
    name,
    length,
    timeSignature: `${sigNum}/${sigDenom}`,
    looping,
    index,
    count,
  };
}

function buildLocationContext(
  clip: LiveAPI,
  view: "session" | "arrangement",
  sceneIndex?: number,
): CodeLocationContext {
  const location: CodeLocationContext = { view };
  const trackIndex = clip.trackIndex;

  // Omitted rather than guessed when the clip's own coordinates don't say where
  // it is — a wrong path here is one user code would act on.
  if (trackIndex == null) {
    return location;
  }

  if (view === "arrangement") {
    location.path = objectPathForApi(clip);

    // Musical beats (song denominator), matching the musical-beat clip fields.
    location.arrangementStartBeats =
      (clip.getProperty("start_time") as number) *
      (songMeter().denominator / 4);
  } else if (sceneIndex != null) {
    location.path = slotPath(trackIndex, sceneIndex);
  }

  return location;
}

function buildLiveSetContext(): CodeLiveSetContext {
  const liveSet = LiveAPI.from(livePath.liveSet);

  const tempo = liveSet.getProperty("tempo") as number;
  const sigNum = liveSet.getProperty("signature_numerator") as number;
  const sigDenom = liveSet.getProperty("signature_denominator") as number;
  const timeSignature = `${sigNum}/${sigDenom}`;

  const context: CodeLiveSetContext = { tempo, timeSignature };

  // Include scale if available
  const scaleMode = liveSet.getProperty("scale_mode") as number;

  if (scaleMode === 1) {
    const scaleName = liveSet.getProperty("scale_name") as string;
    const rootNote = liveSet.getProperty("root_note") as number;
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];

    context.scale = `${scaleRoot} ${scaleName}`;
  }

  return context;
}

// Musical beats per bar = the time-signature numerator (6 in 6/8). Note
// start/duration and clip length are exposed in the same musical-beat unit, so
// `start / beatsPerBar` gives the bar offset in any meter.
function getBeatsPerBar(clip: LiveAPI): number {
  return clip.getProperty("signature_numerator") as number;
}
