// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { manageOffered } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { idOrPathRequired } from "#src/tools/shared/validation/id-validation.ts";
import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { formatNotation } from "#src/notation/notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type Notation } from "#src/shared/notation.ts";
import { readClipNotes } from "#src/tools/shared/clip/clip-notes.ts";
import { groupTrackHoldsNoClips } from "#src/tools/shared/clip/group-track-clips.ts";
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
  type ReadTargetParams,
} from "#src/tools/shared/validation/lists/read-fan-out.ts";
import {
  type CallScale,
  newCallScale,
} from "#src/tools/shared/schema/scale/call-scale.ts";
import { type ClipEnvelope, clipEnvelopes } from "./helpers/clip-envelopes.ts";
import { addClipScale } from "./helpers/clip-scale-fields.ts";
import {
  addTimingProperties,
  type ClipMeter,
} from "./helpers/clip-timing-fields.ts";
import { addBooleanStateProperties } from "./helpers/clip-state-flags.ts";
import {
  processWarpMarkers,
  WARP_MODE_MAPPING,
} from "./helpers/clip-region-and-warp.ts";
import {
  isDrumRackTrack,
  resolveClip,
  resolveClipLocation,
} from "./helpers/clip-resolution.ts";

/** The args of a read-clip call; the fan-out adds the names the targets came under. */
export interface ReadClipArgs extends ReadTargetParams {
  /** Clip slot, "t<track>/s<scene>" */
  path?: string | null;
  /** Deprecated clip slot, trackIndex/sceneIndex */
  slot?: string | null;
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
  /** @internal Told the track of a slot that is really empty; may throw to
   * say why that slot holds no clip */
  onEmptySlot?: (track: LiveAPI) => void;
  /** @internal The call's scale questions, shared across its clips. Only
   * read-clip passes it, and only it shows a MIDI clip's own scale. */
  callScale?: CallScale;
}

interface WarpMarker {
  sampleTime: number;
  beatTime: number;
}

/** Result returned by readClip */
export interface ReadClipResult {
  // Core properties
  id: string | null;
  /** "step-sequencer" is a Live 13 MIDI clip whose steps can't be read */
  type: "midi" | "step-sequencer" | "audio" | null;
  name?: string | null;
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
  /** Session clips only: the clip has automation. Follows Live's own flag, so
   * it also covers envelopes an `envelopes` read can't show. */
  envs?: boolean;

  // Location properties
  /** Where the clip is: "t0/s3" in the session, "t0[5|1]" or "t0/l0[5|1]" in
   * the arrangement. Pastes straight back into any path/toPath param. */
  path?: string;
  /** Arrangement clips only: how far the clip runs, in song meter. */
  arrangementLength?: string;

  // MIDI clip properties
  /** The clip's own scale ("C Major"), only when it differs from the Live Set's;
   * "" when the clip's scale is off and the Live Set's is on. */
  scale?: string;
  /** The notes of `scale`, like "C,D,E,F,G,A,B"; left out with `scale: ""`. */
  scalePitches?: string;
  notes?: string;
  /** How many muted notes are hidden from `notes`; edits leave them alone. */
  mutedNotes?: number;

  // Audio clip properties
  gainDb?: number;
  sampleFile?: string;
  pitchShift?: number;
  sampleLength?: number;
  sampleRate?: number;
  warping?: boolean;
  warpMode?: string;
  warpMarkers?: WarpMarker[];

  /** Each automated parameter (with a `detail` when its events couldn't be read or it won't play), or why there are none to report */
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
  // Asked once for the whole call, however many clips it reads.
  const callScale = newCallScale();
  const result = readFanOut(
    args,
    {
      object: "clip",
      idAlias: "clipId",
      oneTargetParams: ["trackIndex", "sceneIndex", "slot"],
      indexParams: ["trackIndex", "sceneIndex"],
      pathSpellings: ["slot"],
      deadline: context.deadline,
    },
    (one) => readNamedClip({ ...one, callScale }, context),
  );

  // Envelopes are read after the fan-out, not inside it: they are the one part
  // of a clip read that waits on the remote script, and only this tool offers
  // them — read-track and read-scene share the per-clip read and stay sync.
  if (parseIncludeArray(args.include, READ_CLIP_DEFAULTS).includeEnvelopes) {
    for (const entry of Array.isArray(result) ? result : [result]) {
      await addClipEnvelopes(entry, context.deadline, manageOffered(context));
    }
  }

  return result;
}

/**
 * Put one clip's automation on its own entry. Nothing here throws: a clip read
 * that can't reach the remote script still answers with everything else.
 * @param entry - One clip the read produced, or a target it skipped
 * @param deadline - The request deadline from ToolContext, if any
 * @param manage - Whether the caller can use ppal-manage
 */
async function addClipEnvelopes(
  entry: ReadClipResult | TargetSkip,
  deadline: number | null | undefined,
  manage: boolean,
): Promise<void> {
  if ("ok" in entry || entry.id == null) {
    return;
  }

  const clip = LiveAPI.from(entry.id);

  try {
    entry.envelopes = await clipEnvelopes(
      clip,
      (clip.getProperty("is_arrangement_clip") as number) > 0,
      clipMeterReader(clip),
      deadline,
      manage,
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
  const clip = readOneClip({ ...args, onEmptySlot: refuseGroupTrack }, context);

  if (clip.id == null) {
    throw new Error(`no clip at ${clip.path}`);
  }

  return clip;
}

// A group track holds no clips, so a path into one says that, not "no clip".
function refuseGroupTrack(track: LiveAPI): void {
  if (isGroupTrack(track)) {
    throw new Error(groupTrackHoldsNoClips(track));
  }
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
    throw new Error(idOrPathRequired("clip"));
  }

  const resolved = resolveClip(
    clipId,
    trackIndex,
    sceneIndex,
    args.slotValidated,
    args.onEmptySlot,
    args.targetNames?.idParam,
  );

  if (!resolved.found) {
    return resolved.emptySlotResponse;
  }

  const clip = resolved.clip;

  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;
  const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;
  const isStepSequencer = isMidiClip && clip.midiClipIsStepSequencer;
  const clipName = clip.getName();

  const result: ReadClipResult = {
    id: clip.id,
    type: clipType(isMidiClip, isStepSequencer),
    ...(clipName && { name: clipName }),
    ...(includeColor && { color: clip.getColor() }),
  };

  addBooleanStateProperties(result, clip, isArrangementClip);

  addClipLocationProperties(result, clip, isArrangementClip);

  const clipMeter = clipMeterReader(clip);

  if (includeTiming) {
    addTimingProperties(result, clip, result.type === "audio", clipMeter);
  }

  if (result.type !== "audio" && args.callScale != null) {
    addClipScale(result, clip, args.callScale);
  }

  if (isStepSequencer) {
    appendDetail(result, STEPS_UNREADABLE);
  } else if (result.type === "midi") {
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

/** What a step sequencer clip's entry says in place of its notes. */
const STEPS_UNREADABLE = "steps can't be read";

/**
 * @param isMidiClip - Whether Live calls it a MIDI clip
 * @param isStepSequencer - Whether it is a step sequencer clip
 * @returns The type the read reports
 */
function clipType(
  isMidiClip: boolean,
  isStepSequencer: boolean,
): "midi" | "step-sequencer" | "audio" {
  if (isStepSequencer) {
    return "step-sequencer";
  }

  return isMidiClip ? "midi" : "audio";
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
  // The same window update-clip reads and rewrites, so a note shown here is
  // one an edit keeps. Notes more than a clip-length outside the region are
  // missed.
  const { visible, muted } = readClipNotes(clip);
  const notes = visible as unknown as NoteEvent[];

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

  if (muted.length > 0) {
    result.mutedNotes = muted.length;
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
