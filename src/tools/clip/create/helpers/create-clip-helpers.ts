// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  durationToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { setAudioClipProperties } from "#src/tools/clip/helpers/audio-clip-properties.ts";
import { applyAudioClipWarping } from "#src/tools/clip/helpers/audio-clip-warping.ts";
import {
  prepareSessionClipSlot,
  requireCreatedSessionClip,
  type MidiNote,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import {
  createAudioArrangementClip,
  createAudioSessionClip,
} from "./create-clip-audio-helpers.ts";
import {
  buildClipProperties,
  buildClipResult,
} from "./create-clip-result-helpers.ts";

export interface TimingParameters {
  arrangementStartBeats: number | null;
  startBeats: number | null;
  firstStartBeats: number | null;
  endBeats: number | null;
}

/**
 * Converts bar|beat timing parameters to Ableton beats
 * @param arrangementStart - Arrangement start position in bar|beat format
 * @param start - Loop start position in bar|beat format
 * @param firstStart - First playback start position in bar|beat format
 * @param length - Clip length in bar|beat duration format
 * @param looping - Whether the clip is looping
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param songTimeSigNumerator - Song time signature numerator
 * @param songTimeSigDenominator - Song time signature denominator
 * @returns Converted timing parameters in beats
 */
export function convertTimingParameters(
  arrangementStart: string | null,
  start: string | null,
  firstStart: string | null,
  length: string | null,
  looping: boolean | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  songTimeSigNumerator: number,
  songTimeSigDenominator: number,
): TimingParameters {
  // Convert bar|beat timing parameters to Ableton beats. Validate the standalone
  // position fields first so a 0-indexed/zero-bar position is a hard error
  // (matching the notes grammar), not a silent pre-origin beat.
  let arrangementStartBeats: number | null = null;

  if (arrangementStart != null) {
    validateBarBeatPosition(arrangementStart);
    arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  }

  let startBeats: number | null = null;

  if (start != null) {
    validateBarBeatPosition(start);
    startBeats = barBeatToAbletonBeats(
      start,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  let firstStartBeats: number | null = null;

  if (firstStart != null) {
    validateBarBeatPosition(firstStart);
    firstStartBeats = barBeatToAbletonBeats(
      firstStart,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && looping === false) {
    console.warn("firstStart parameter ignored for non-looping clips");
  }

  // Convert length parameter to end position
  let endBeats: number | null = null;

  if (length != null) {
    const lengthBeats = durationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    const startOffsetBeats = startBeats ?? 0;

    endBeats = startOffsetBeats + lengthBeats;
  }

  return { arrangementStartBeats, startBeats, firstStartBeats, endBeats };
}

interface SessionClipResult {
  clip: LiveAPI;
  sceneIndex: number;
}

/**
 * Creates a session clip in a clip slot, auto-creating scenes if needed
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param clipLength - Clip length in beats
 * @param liveSet - LiveAPI live_set object
 * @param maxAutoCreatedScenes - Maximum scenes allowed
 * @returns Object with clip and sceneIndex
 */
function createSessionClip(
  trackIndex: number,
  sceneIndex: number,
  clipLength: number,
  liveSet: LiveAPI,
  maxAutoCreatedScenes: number,
): SessionClipResult {
  const clipSlot = prepareSessionClipSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    maxAutoCreatedScenes,
  );

  clipSlot.call("create_clip", clipLength);

  return {
    clip: requireCreatedSessionClip(clipSlot, "MIDI"),
    sceneIndex,
  };
}

interface ArrangementClipResult {
  clip: LiveAPI;
  arrangementStartBeats: number | null;
}

/**
 * Creates an arrangement clip on a track or a take lane
 * @param trackIndex - Track index (0-based)
 * @param arrangementStartBeats - Starting position in beats
 * @param clipLength - Clip length in beats
 * @param takeLane - Take lane to create on, or null for the track's main lane
 * @param track - The already-resolved destination track, or null to resolve it
 * @returns Object with clip and arrangementStartBeats
 */
function createArrangementClip(
  trackIndex: number,
  arrangementStartBeats: number | null,
  clipLength: number,
  takeLane: LiveAPI | null = null,
  track: LiveAPI | null = null,
): ArrangementClipResult {
  const target = takeLane ?? track ?? LiveAPI.from(livePath.track(trackIndex));
  const newClipResult = target.call(
    "create_midi_clip",
    arrangementStartBeats,
    clipLength,
  ) as string;
  const clip = LiveAPI.from(newClipResult);

  if (!clip.exists()) {
    throw new Error("failed to create Arrangement clip");
  }

  return { clip, arrangementStartBeats };
}

export interface CreateClipAudioParams {
  /** Requested warp state, or null/undefined to keep Live's own choice */
  warping?: boolean | null;
  /** Gain in decibels, or null to leave it alone */
  gainDb?: number | null;
  /** Pitch shift in semitones, or null to leave it alone */
  pitchShift?: number | null;
  /** Warp mode, or null to leave it alone */
  warpMode?: string | null;
}

/** Name/color/meter to stamp on a freshly created audio clip. */
interface CreatedAudioClipSettings {
  clipName: string | undefined;
  color: string | null;
  timeSignature: string | null;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * Stamp a new audio clip's settings. The sample defines the region, so there is
 * no looping or timing to set — an explicit timeSignature still applies, since
 * it sets the clip's grid and update-clip already honors that for audio.
 * @param clip - The newly created audio clip
 * @param audio - Audio clip properties; a null entry leaves that property alone
 * @param settings - Name, color, and meter for the clip
 */
function applyCreatedAudioClipSettings(
  clip: LiveAPI,
  audio: CreateClipAudioParams,
  settings: CreatedAudioClipSettings,
): void {
  const { clipName, color, timeSignature } = settings;
  const propsToSet: Record<string, unknown> = {};

  if (clipName) propsToSet.name = clipName;
  if (color != null) propsToSet.color = color;

  if (timeSignature != null) {
    propsToSet.signature_numerator = settings.timeSigNumerator;
    propsToSet.signature_denominator = settings.timeSigDenominator;
  }

  if (Object.keys(propsToSet).length > 0) {
    clip.setAll(propsToSet);
  }

  // Same order as update-clip: properties first, then the warp toggle, which is
  // the one with side effects on the clip region.
  setAudioClipProperties(clip, {
    gainDb: audio.gainDb ?? undefined,
    pitchShift: audio.pitchShift ?? undefined,
    warpMode: audio.warpMode ?? undefined,
  });
  applyAudioClipWarping(clip, audio.warping);
}

/**
 * Processes one clip creation at a specific position
 * @param view - View type (session or arrangement)
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index for session clips (explicit position)
 * @param arrangementStartBeats - Arrangement start in beats (explicit position)
 * @param arrangementStart - Arrangement start in bar|beat format (for result)
 * @param clipLength - Clip length in beats
 * @param liveSet - LiveAPI live_set object
 * @param startBeats - Loop start in beats
 * @param endBeats - Loop end in beats
 * @param firstStartBeats - First playback start in beats
 * @param looping - Whether the clip is looping
 * @param clipName - Clip name
 * @param color - Clip color
 * @param timeSigNumerator - Clip time signature numerator
 * @param timeSigDenominator - Clip time signature denominator
 * @param notationString - Original notation string
 * @param notes - Array of MIDI notes
 * @param length - Original length parameter
 * @param sampleFile - Audio file path (for audio clips)
 * @param transformedCount - Number of notes matched by transform selectors
 * @param takeLane - Take lane to create arrangement clips on, or null for main lane
 * @param audio - Audio clip properties; a null entry leaves that property alone
 * @param timeSignature - The raw timeSignature argument, or null for the song's
 * @param track - The destination track, resolved once for the whole call
 * @returns Clip result for this iteration
 */
export function processClipIteration(
  view: string,
  trackIndex: number,
  sceneIndex: number | null,
  arrangementStartBeats: number | null,
  arrangementStart: string | null,
  clipLength: number,
  liveSet: LiveAPI,
  startBeats: number | null,
  endBeats: number | null,
  firstStartBeats: number | null,
  looping: boolean | null,
  clipName: string | undefined,
  color: string | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  notationString: string | null,
  notes: MidiNote[],
  length: string | null,
  sampleFile: string | null,
  transformedCount: number | undefined,
  takeLane: LiveAPI | null = null,
  audio: CreateClipAudioParams = {},
  timeSignature: string | null = null,
  track: LiveAPI | null = null,
): object {
  let clip: LiveAPI;
  let currentSceneIndex: number | undefined;

  if (sampleFile) {
    // Audio clip creation
    if (view === "session") {
      // sceneIndex is guaranteed to be valid for session view (validated in calling code)
      const validSceneIndex = sceneIndex as number;
      const result = createAudioSessionClip(
        trackIndex,
        validSceneIndex,
        sampleFile,
        liveSet,
        MAX_AUTO_CREATED_SCENES,
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
    } else {
      // Arrangement view
      const result = createAudioArrangementClip(
        trackIndex,
        arrangementStartBeats,
        sampleFile,
        takeLane,
        track,
      );

      clip = result.clip;
    }

    applyCreatedAudioClipSettings(clip, audio, {
      clipName,
      color,
      timeSignature,
      timeSigNumerator,
      timeSigDenominator,
    });
  } else {
    // MIDI clip creation
    if (view === "session") {
      // sceneIndex is guaranteed to be valid for session view (validated in calling code)
      const validSceneIndex = sceneIndex as number;
      const result = createSessionClip(
        trackIndex,
        validSceneIndex,
        clipLength,
        liveSet,
        MAX_AUTO_CREATED_SCENES,
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
    } else {
      // Arrangement view
      const result = createArrangementClip(
        trackIndex,
        arrangementStartBeats,
        clipLength,
        takeLane,
        track,
      );

      clip = result.clip;
    }

    const propsToSet = buildClipProperties(
      startBeats,
      endBeats,
      firstStartBeats,
      looping,
      clipName,
      color,
      timeSigNumerator,
      timeSigDenominator,
      clipLength,
    );

    clip.setAll(propsToSet);

    // v0 notes already filtered by applyV0Deletions in interpretNotation
    if (notes.length > 0) {
      clip.call("add_new_notes", { notes });
    }
  }

  return buildClipResult(
    clip,
    trackIndex,
    view,
    currentSceneIndex,
    arrangementStart,
    notationString,
    length,
    timeSigNumerator,
    timeSigDenominator,
    sampleFile,
    transformedCount,
  );
}
