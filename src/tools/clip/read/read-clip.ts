// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  abletonBeatsToDuration,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { formatNotation } from "#src/notation/notation.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { type Notation } from "#src/shared/notation.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { liveGainToDb } from "#src/tools/shared/gain-utils.ts";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  arrangementPath,
  namedPath,
  namedHiddenPath,
  requireSessionSlot,
  slotPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import { parseSlot } from "#src/tools/shared/validation/position-parsing.ts";
import {
  clipRegionBeats,
  isDrumRackTrack,
  processWarpMarkers,
  resolveClip,
  WARP_MODE_MAPPING,
} from "./helpers/read-clip-helpers.ts";

interface ReadClipArgs {
  /** Session position, "t<track>/s<scene>" */
  path?: string | null;
  /** Deprecated session slot, trackIndex/sceneIndex */
  slot?: string | null;
  clipId?: string | null;
  include?: string[];
  /** @internal Suppress warning for empty clip slots (used by batch readers) */
  suppressEmptyWarning?: boolean;
  /** Hidden alias for path; also used by batch readers with parsed indices */
  trackIndex?: number | null;
  /** Hidden alias for path; also used by batch readers with parsed indices */
  sceneIndex?: number | null;
  /** @internal Precomputed drum mode from a batch reader, so N clips of one
   * track don't each re-walk the track's device tree */
  drumMode?: boolean;
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
  /** Where the clip is: "t0/s3" in the session, "t0" or "t0/l1" in the
   * arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
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
 * @param args.slot - Session clip slot (e.g., "0/3")
 * @param args.clipId - Clip ID to directly access any clip
 * @param args.include - Array of data to include in response
 * @param context - Context object (supplies the global notation setting)
 * @returns Result object with clip information
 */
export function readClip(
  args: ReadClipArgs = {},
  context: Partial<ToolContext> = {},
): ReadClipResult {
  const { clipId, trackIndex, sceneIndex } = resolveClipLocation(args);

  const {
    includeSample,
    includeClipNotes,
    includeColor,
    includeTiming,
    includeWarp,
  } = parseIncludeArray(args.include, READ_CLIP_DEFAULTS);

  if (clipId == null && (trackIndex == null || sceneIndex == null)) {
    throw new Error("Either clipId or slot must be provided");
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
    addTimingProperties(result, clip, result.type === "audio");
  }

  // Process MIDI clip properties
  if (result.type === "midi") {
    processMidiClip(
      result,
      clip,
      includeClipNotes,
      context.notation ?? "barbeat",
      args.drumMode,
    );
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
 * @param isAudioClip - Whether the clip is an audio clip, whose marker
 *   properties are in seconds rather than beats when it is not warped
 */
function addTimingProperties(
  result: ReadClipResult,
  clip: LiveAPI,
  isAudioClip: boolean,
): void {
  const timeSigNumerator = clip.getProperty("signature_numerator") as number;
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  const isLooping = (clip.getProperty("looping") as number) > 0;

  const { startBeats, endBeats, startMarkerBeats } = clipRegionBeats(
    clip,
    isAudioClip,
    isLooping,
  );

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
  result.length = abletonBeatsToDuration(
    endBeats - startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  if (Math.abs(startMarkerBeats - startBeats) > SAME_TIME_EPSILON) {
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
 * @param notation - Notation for the returned notes (default barbeat)
 * @param precomputedDrumMode - Drum mode supplied by a batch reader; falls back
 *   to a per-clip device-tree walk when omitted (standalone reads)
 */
function processMidiClip(
  result: ReadClipResult,
  clip: LiveAPI,
  includeClipNotes: boolean,
  notation: Notation,
  precomputedDrumMode?: boolean,
): void {
  if (!includeClipNotes) return;

  const timeSigNumerator = clip.getProperty("signature_numerator") as number;
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  const lengthBeats = clip.getProperty("length") as number;

  // Read one clip-length of margin on each side of the playable region
  // [0, lengthBeats], i.e. the window [-lengthBeats, 2*lengthBeats], so that
  // authored notes outside the playable bounds round-trip on read instead of
  // being silently dropped:
  //   - before the start (negative start_time — e.g. a pickup `1|1-n/12`)
  //   - after the end (overhang past lengthBeats)
  // Live accepts negative note start times. The window is bounded (rather than
  // unbounded) to keep the scan finite; notes more than a clip-length outside
  // the region are still missed, which is the same finite-scan tradeoff made on
  // the low end.
  const notesDictionary = clip.call(
    "get_notes_extended",
    0,
    128,
    -lengthBeats,
    lengthBeats * 3,
  ) as string;
  const notes = JSON.parse(notesDictionary).notes;

  const drumMode =
    precomputedDrumMode ??
    (clip.trackIndex != null && isDrumRackTrack(clip.trackIndex));

  const formatted = formatNotation(notes, {
    notation,
    timeSigNumerator,
    timeSigDenominator,
    drumMode,
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
    const gainDb = liveGainToDb(clip.getProperty("gain") as number);

    if (gainDb !== 0) {
      result.gainDb = gainDb;
    }

    const filePath = clip.getProperty("file_path") as string | null;

    if (filePath) {
      result.sampleFile = filePath;
    }

    const pitchCoarse = clip.getProperty("pitch_coarse") as number;
    const pitchFine = clip.getProperty("pitch_fine") as number;
    const pitchShift = pitchCoarse + pitchFine / 100;

    if (pitchShift !== 0) {
      result.pitchShift = pitchShift;
    }
  }

  // Warp properties (gated behind includeWarp)
  if (includeWarp) {
    result.sampleLength = clip.getProperty("sample_length") as number;
    result.sampleRate = clip.getProperty("sample_rate") as number;
    result.warping = (clip.getProperty("warping") as number) > 0;

    const warpModeValue = clip.getProperty("warp_mode") as number;

    result.warpMode = WARP_MODE_MAPPING[warpModeValue] ?? "unknown";

    // Warp markers are work-in-progress: debug builds only (build:debug)
    if (process.env.ENABLE_WARP_MARKERS === "true") {
      const warpMarkers = processWarpMarkers(clip);

      if (warpMarkers !== undefined) {
        result.warpMarkers = warpMarkers;
      }
    }
  }
}

/**
 * Add clip location properties (path, plus arrangement timing)
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
    result.path = arrangementPath(
      clip.trackIndex as number,
      clip.takeLaneIndex,
    );

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

      result.arrangementLength = abletonBeatsToDuration(
        endTimeBeats - startTimeBeats,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    }
  } else {
    result.path = slotPath(
      clip.trackIndex as number,
      clip.sceneIndex as number,
    );
  }
}

/**
 * Resolve clip location from args. `path` wins, then the deprecated `slot`,
 * then the trackIndex/sceneIndex pair — which doubles as the hidden alias and
 * as how batch readers pass indices they already parsed.
 * @param args - ReadClipArgs
 * @returns Resolved clipId, trackIndex, and sceneIndex
 */
function resolveClipLocation(args: ReadClipArgs): {
  clipId: string | null;
  trackIndex: number | null;
  sceneIndex: number | null;
} {
  const clipId = args.clipId ?? null;
  const path = namedPath(args.path ?? undefined);

  if (path != null) {
    const parsed = requireSessionSlot(parseObjectPath(path, "path"));

    return { clipId, ...parsed };
  }

  const slot = namedHiddenPath(args.slot ?? undefined);

  if (slot != null) {
    return { clipId, ...parseSlot(slot) };
  }

  return {
    clipId,
    trackIndex: args.trackIndex ?? null,
    sceneIndex: args.sceneIndex ?? null,
  };
}
