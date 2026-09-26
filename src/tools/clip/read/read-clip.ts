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
import { errorMessage } from "#src/shared/error-message.ts";
import { type Notation } from "#src/shared/notation.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { liveGainToDb } from "#src/tools/shared/helpers/gain-conversion.ts";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { songMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  readFanOut,
  type ReadResult,
} from "#src/tools/shared/validation/lists/read-fan-out.ts";
import { type ClipEnvelope, clipEnvelopes } from "./helpers/clip-envelopes.ts";
import {
  clipRegionBeats,
  processWarpMarkers,
  WARP_MODE_MAPPING,
} from "./helpers/clip-region-and-warp.ts";
import {
  isDrumRackTrack,
  resolveClip,
  resolveClipLocation,
} from "./helpers/clip-resolution.ts";

export interface ReadClipArgs {
  /** Clip slot, "t<track>/s<scene>" */
  path?: string | null;
  /** Hidden alias for path */
  paths?: string | null;
  /** Deprecated clip slot, trackIndex/sceneIndex */
  slot?: string | null;
  id?: string | null;
  /** Hidden alias for id */
  ids?: string | null;
  /** Hidden alias for id */
  clipId?: string | null;
  include?: string[];
  /** Hidden alias for path; also used by batch readers with parsed indices */
  trackIndex?: number | null;
  /** Hidden alias for path; also used by batch readers with parsed indices */
  sceneIndex?: number | null;
  /** @internal Precomputed drum mode from a batch reader, so N clips of one
   * track don't each re-walk the track's device tree */
  drumMode?: boolean;
  /** @internal The caller walked this track's or scene's own slots, so the
   * address is real by construction and an empty slot needn't prove it */
  slotValidated?: boolean;
}

interface WarpMarker {
  sampleTime: number;
  beatTime: number;
}

/** A clip's own meter, which spells both its positions and its notes. */
interface ClipMeter {
  numerator: number;
  denominator: number;
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
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  /** Arrangement clips only: how far the clip runs, in song meter. */
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

  /** Each automated parameter, or why there are none to report */
  envelopes?: ClipEnvelope[] | string;

  /** What the read couldn't produce for this clip */
  detail?: string;
}

/**
 * Read the MIDI or audio clip(s) a call names
 * @param args - Arguments for the function
 * @param args.path - Comma-separated clip locations (e.g., "t0/s3")
 * @param args.paths - Hidden alias for path
 * @param args.id - Comma-separated clip IDs
 * @param args.ids - Hidden alias for id
 * @param args.include - Array of data to include in response
 * @param context - Context object (supplies the global notation setting)
 * @returns One clip, or one entry per clip named
 */
export async function readClip(
  args: ReadClipArgs = {},
  context: Partial<ToolContext> = {},
): Promise<ReadResult<ReadClipResult>> {
  const result = readFanOut(
    args,
    {
      object: "clip",
      idAlias: "clipId",
      oneTargetParams: ["trackIndex", "sceneIndex", "slot"],
    },
    (one) => readNamedClip(one, context),
  );

  // Envelopes are read after the fan-out, not inside it: they are the one part
  // of a clip read that waits on the remote script, and only this tool offers
  // them — read-track and read-scene share the per-clip read and stay sync.
  if (parseIncludeArray(args.include, READ_CLIP_DEFAULTS).includeEnvelopes) {
    for (const entry of Array.isArray(result) ? result : [result]) {
      await addClipEnvelopes(entry);
    }
  }

  return result;
}

/**
 * Put one clip's automation on its own entry. Nothing here throws: a clip read
 * that can't reach the remote script still answers with everything else.
 * @param entry - One clip the read produced, or a target it skipped
 */
async function addClipEnvelopes(
  entry: ReadClipResult | TargetSkip,
): Promise<void> {
  if ("ok" in entry || entry.id == null) {
    return;
  }

  const clip = LiveAPI.from(entry.id);

  try {
    entry.envelopes = await clipEnvelopes(
      clip,
      entry.view === "arrangement",
      clipMeterReader(clip),
    );
  } catch (error) {
    entry.envelopes = errorMessage(error);
  }
}

/**
 * Read one clip a call named. An empty slot is a miss: a lone target throws, a
 * listed one gets the entry saying so. Only the batch readers take it.
 * @param args - Arguments for one clip
 * @param context - Context object
 * @returns Result object with clip information
 * @throws Error when the slot holds no clip
 */
function readNamedClip(
  args: ReadClipArgs,
  context: Partial<ToolContext>,
): ReadClipResult {
  const clip = readOneClip(args, context);

  if (clip.id == null) {
    throw new Error(`no clip at ${clip.path}`);
  }

  return clip;
}

/**
 * Read a MIDI or audio clip from Ableton Live
 * @param args - Arguments for the function
 * @param args.path - Session clip slot (e.g., "t0/s3")
 * @param args.id - Clip ID to directly access any clip
 * @param args.include - Array of data to include in response
 * @param context - Context object (supplies the global notation setting)
 * @returns Result object with clip information
 */
export function readOneClip(
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
    throw new Error("id or path is required");
  }

  const resolved = resolveClip(
    clipId,
    trackIndex,
    sceneIndex,
    args.slotValidated,
  );

  if (!resolved.found) {
    return resolved.emptySlotResponse;
  }

  const clip = resolved.clip;

  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;
  const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;
  const clipName = clip.getName();

  const result: ReadClipResult = {
    id: clip.id,
    type: isMidiClip ? "midi" : "audio",
    ...(clipName && { name: clipName }),
    view: isArrangementClip ? "arrangement" : "session",
    ...(includeColor && { color: clip.getColor() }),
  };

  addBooleanStateProperties(result, clip);

  addClipLocationProperties(result, clip, isArrangementClip);

  const clipMeter = clipMeterReader(clip);

  if (includeTiming) {
    addTimingProperties(result, clip, result.type === "audio", clipMeter);
  }

  if (result.type === "midi") {
    processMidiClip(
      result,
      clip,
      includeClipNotes,
      context.notation ?? "barbeat",
      clipMeter,
      args.drumMode,
    );
  }

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
 * Read the clip's meter once, and only if something asks: the timing block and
 * the note formatting both spell positions in it, and a read with neither must
 * not pay for it.
 * @param clip - LiveAPI clip object
 * @returns A getter for the clip's meter
 */
function clipMeterReader(clip: LiveAPI): () => ClipMeter {
  let meter: ClipMeter | null = null;

  return () =>
    (meter ??= {
      numerator: clip.getProperty("signature_numerator") as number,
      denominator: clip.getProperty("signature_denominator") as number,
    });
}

/**
 * Add timing properties (timeSignature, looping, start, end, length, firstStart)
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param isAudioClip - Whether the clip is an audio clip, whose marker
 *   properties are in seconds rather than beats when it is not warped
 * @param clipMeter - Getter for the clip's meter
 */
function addTimingProperties(
  result: ReadClipResult,
  clip: LiveAPI,
  isAudioClip: boolean,
  clipMeter: () => ClipMeter,
): void {
  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    clipMeter();
  const isLooping = (clip.getProperty("looping") as number) > 0;

  const { startBeats, endBeats, startMarkerBeats } = clipRegionBeats(
    clip,
    isAudioClip,
    isLooping,
  );

  result.timeSignature = `${String(timeSigNumerator)}/${String(timeSigDenominator)}`;
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
 * @param clipMeter - Getter for the clip's meter
 * @param precomputedDrumMode - Drum mode supplied by a batch reader; falls back
 *   to a device-tree walk when omitted (standalone reads)
 */
function processMidiClip(
  result: ReadClipResult,
  clip: LiveAPI,
  includeClipNotes: boolean,
  notation: Notation,
  clipMeter: () => ClipMeter,
  precomputedDrumMode?: boolean,
): void {
  if (!includeClipNotes) {
    return;
  }

  const { numerator: timeSigNumerator, denominator: timeSigDenominator } =
    clipMeter();
  const lengthBeats = clip.getProperty("length") as number;

  // Read the window [-lengthBeats, 2*lengthBeats] so a pickup before the start
  // (Live allows negative start_time) and overhang past the end round-trip.
  // Notes more than a clip-length outside the region are still missed.
  const notesDictionary = clip.call(
    "get_notes_extended",
    0,
    128,
    -lengthBeats,
    lengthBeats * 3,
  ) as string;
  // `?? []` because nothing to spell is not an error, the way formatNotation is.
  const notes = JSON.parse(notesDictionary).notes ?? [];

  // Nothing to spell means the answer is never used, so an empty clip must not
  // pay for the device-tree walk that produces it.
  const drumMode =
    precomputedDrumMode ??
    (notes.length > 0 &&
      clip.trackIndex != null &&
      isDrumRackTrack(clip.trackIndex));

  const formatted = formatNotation(notes, {
    notation,
    timeSigNumerator,
    timeSigDenominator,
    drumMode,
  });

  if (formatted) {
    result.notes = formatted;
  }
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
      const { markers, detail } = processWarpMarkers(clip);

      if (markers !== undefined) {
        result.warpMarkers = markers;
      }

      if (detail != null) {
        appendDetail(result, detail);
      }
    }
  }
}

/**
 * Add clip location properties (path, plus the arrangement span)
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param isArrangementClip - Whether clip is in arrangement view
 */
function addClipLocationProperties(
  result: ReadClipResult,
  clip: LiveAPI,
  isArrangementClip: boolean,
): void {
  if (isArrangementClip) {
    // Path and arrangementLength are both unconditional: without the length a
    // reader guesses each clip's extent from the next clip's start.
    result.path = objectPathForApi(clip);

    const startTimeBeats = clip.getProperty("start_time") as number;
    const endTimeBeats = clip.getProperty("end_time") as number;
    const { numerator, denominator } = songMeter();

    result.arrangementLength = abletonBeatsToDuration(
      endTimeBeats - startTimeBeats,
      numerator,
      denominator,
    );
  } else {
    result.path = slotPath(
      clip.trackIndex as number,
      clip.sceneIndex as number,
    );
  }
}
