// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { liveGainToDb } from "#src/tools/shared/gain-utils.ts";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import {
  processWarpMarkers,
  resolveClip,
  WARP_MODE_MAPPING,
} from "./helpers/read-clip-helpers.ts";

interface ReadClipArgs {
  trackIndex?: number | null;
  sceneIndex?: number | null;
  clipId?: string | null;
  include?: string[];
  /** @internal Suppress warning for empty clip slots (used by batch readers) */
  suppressEmptyWarning?: boolean;
}

interface WarpMarker {
  sampleTime: number;
  beatTime: number;
}

/** Result returned by readClip */
export interface ReadClipResult {
  // Core properties
  id: string | null;
  type: "midi" | "audio" | null;
  name?: string | null;
  view?: "arrangement" | "session";
  color?: string | null;
  timeSignature?: string | null;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  firstStart?: string;

  // Boolean state properties (only present when true)
  playing?: boolean;
  triggered?: boolean;
  recording?: boolean;
  overdubbing?: boolean;
  muted?: boolean;

  // Location properties
  trackIndex?: number | null;
  sceneIndex?: number | null;
  arrangementStart?: string;
  arrangementLength?: string;

  // MIDI clip properties
  notes?: string;

  // Audio clip properties
  gainDb?: number;
  sampleFile?: string;
  pitchShift?: number;
  sampleLength?: number;
  sampleRate?: number;
  warping?: boolean;
  warpMode?: string;
  warpMarkers?: WarpMarker[];
}

/**
 * Read a MIDI or audio clip from Ableton Live
 * @param args - Arguments for the function
 * @param args.trackIndex - Track index (0-based)
 * @param args.sceneIndex - Clip slot index (0-based)
 * @param args.clipId - Clip ID to directly access any clip
 * @param args.include - Array of data to include in response
 * @param _context - Context object (unused)
 * @returns Result object with clip information
 */
export function readClip(
  args: ReadClipArgs = {},
  _context: Partial<ToolContext> = {},
): ReadClipResult {
  const { trackIndex = null, sceneIndex = null, clipId = null } = args;

  const {
    includeSample,
    includeClipNotes,
    includeColor,
    includeTiming,
    includeWarp,
  } = parseIncludeArray(args.include, READ_CLIP_DEFAULTS);

  if (clipId === null && (trackIndex === null || sceneIndex === null)) {
    throw new Error(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
  }

  // Resolve clip from ID or location
  const resolved = resolveClip(clipId, trackIndex, sceneIndex);

  if (!resolved.found) {
    if (!args.suppressEmptyWarning) {
      console.warn(
        `no clip at trackIndex ${trackIndex}, sceneIndex ${sceneIndex}`,
      );
    }

    return resolved.emptySlotResponse;
  }

  const clip = resolved.clip;

  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;
  const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;
  const clipName = clip.getProperty("name") as string;

  const result: ReadClipResult = {
    id: clip.id,
    type: isMidiClip ? "midi" : "audio",
    ...(clipName && { name: clipName }),
    view: isArrangementClip ? "arrangement" : "session",
    ...(includeColor && { color: clip.getColor() }),
  };

  // Add boolean state properties
  addBooleanStateProperties(result, clip);

  // Add location properties (arrangementLength gated behind timing)
  addClipLocationProperties(result, clip, isArrangementClip, includeTiming);

  // Add timing properties when requested
  if (includeTiming) {
    addTimingProperties(result, clip);
  }

  // Process MIDI clip properties
  if (result.type === "midi") {
    processMidiClip(result, clip, includeClipNotes);
  }

  // Process audio clip properties
  if (result.type === "audio" && (includeSample || includeWarp)) {
    processAudioClip(result, clip, includeSample, includeWarp);
  }

  return result;
}

/**
 * Add boolean state properties (playing, triggered, recording, overdubbing, muted)
 * Only includes properties that are true
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 */
function addBooleanStateProperties(
  result: ReadClipResult,
  clip: LiveAPI,
): void {
  if ((clip.getProperty("is_playing") as number) > 0) {
    result.playing = true;
  }

  if ((clip.getProperty("is_triggered") as number) > 0) {
    result.triggered = true;
  }

  if ((clip.getProperty("is_recording") as number) > 0) {
    result.recording = true;
  }

  if ((clip.getProperty("is_overdubbing") as number) > 0) {
    result.overdubbing = true;
  }

  if ((clip.getProperty("muted") as number) > 0) {
    result.muted = true;
  }
}

/**
 * Add timing properties (timeSignature, looping, start, end, length, firstStart)
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 */
function addTimingProperties(result: ReadClipResult, clip: LiveAPI): void {
  const timeSigNumerator = clip.getProperty("signature_numerator") as number;
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  const isLooping = (clip.getProperty("looping") as number) > 0;

  const startMarkerBeats = clip.getProperty("start_marker") as number;
  const loopStartBeats = clip.getProperty("loop_start") as number;
  const loopEndBeats = clip.getProperty("loop_end") as number;
  const endMarkerBeats = clip.getProperty("end_marker") as number;

  const startBeats = isLooping ? loopStartBeats : startMarkerBeats;
  const endBeats = isLooping ? loopEndBeats : endMarkerBeats;

  result.timeSignature = clip.timeSignature;
  result.looping = isLooping;
  result.start = abletonBeatsToBarBeat(
    startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  result.end = abletonBeatsToBarBeat(
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  result.length = abletonBeatsToBarBeatDuration(
    endBeats - startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  if (Math.abs(startMarkerBeats - startBeats) > 0.001) {
    result.firstStart = abletonBeatsToBarBeat(
      startMarkerBeats,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
}

/**
 * Process MIDI clip specific properties
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param includeClipNotes - Whether to include formatted notes
 */
function processMidiClip(
  result: ReadClipResult,
  clip: LiveAPI,
  includeClipNotes: boolean,
): void {
  if (!includeClipNotes) return;

  const timeSigNumerator = clip.getProperty("signature_numerator") as number;
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  const lengthBeats = clip.getProperty("length") as number;

  const notesDictionary = clip.call(
    "get_notes_extended",
    0,
    128,
    0,
    lengthBeats,
  ) as string;
  const notes = JSON.parse(notesDictionary).notes;

  const formatted = formatNotation(notes, {
    timeSigNumerator,
    timeSigDenominator,
  });

  if (formatted) result.notes = formatted;
}

/**
 * Process audio clip specific properties
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param includeSample - Whether to include base audio properties
 * @param includeWarp - Whether to include warp properties
 */
function processAudioClip(
  result: ReadClipResult,
  clip: LiveAPI,
  includeSample: boolean,
  includeWarp: boolean,
): void {
  // Base audio properties (gated behind includeSample)
  if (includeSample) {
    result.gainDb = liveGainToDb(clip.getProperty("gain") as number);

    const filePath = clip.getProperty("file_path") as string | null;

    if (filePath) {
      result.sampleFile = filePath;
    }

    const pitchCoarse = clip.getProperty("pitch_coarse") as number;
    const pitchFine = clip.getProperty("pitch_fine") as number;

    result.pitchShift = pitchCoarse + pitchFine / 100;
  }

  // Warp properties (gated behind includeWarp)
  if (includeWarp) {
    result.sampleLength = clip.getProperty("sample_length") as number;
    result.sampleRate = clip.getProperty("sample_rate") as number;
    result.warping = (clip.getProperty("warping") as number) > 0;

    const warpModeValue = clip.getProperty("warp_mode") as number;

    result.warpMode = WARP_MODE_MAPPING[warpModeValue] ?? "unknown";

    const warpMarkers = processWarpMarkers(clip);

    if (warpMarkers !== undefined) {
      result.warpMarkers = warpMarkers;
    }
  }
}

/**
 * Add clip location properties (trackIndex, sceneIndex, or arrangement properties)
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param isArrangementClip - Whether clip is in arrangement view
 * @param includeTiming - Whether to include arrangementLength
 */
function addClipLocationProperties(
  result: ReadClipResult,
  clip: LiveAPI,
  isArrangementClip: boolean,
  includeTiming: boolean,
): void {
  if (isArrangementClip) {
    result.trackIndex = clip.trackIndex;
    const startTimeBeats = clip.getProperty("start_time") as number;

    const liveSet = LiveAPI.from("live_set");
    const songTimeSigNumerator = liveSet.getProperty(
      "signature_numerator",
    ) as number;
    const songTimeSigDenominator = liveSet.getProperty(
      "signature_denominator",
    ) as number;

    result.arrangementStart = abletonBeatsToBarBeat(
      startTimeBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    if (includeTiming) {
      const endTimeBeats = clip.getProperty("end_time") as number;

      result.arrangementLength = abletonBeatsToBarBeatDuration(
        endTimeBeats - startTimeBeats,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    }
  } else {
    result.trackIndex = clip.trackIndex;
    result.sceneIndex = clip.sceneIndex;
  }
}
