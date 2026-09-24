// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setAudioClipProperties } from "#src/tools/clip/helpers/audio-clip-properties.ts";
import { applyAudioClipWarping } from "#src/tools/clip/helpers/audio-clip-warping.ts";
import {
  createInSessionSlot,
  requireCreatedArrangementClip,
  type MidiNote,
  type SlotWork,
} from "#src/tools/clip/helpers/clip-results.ts";
import {
  arrangementLaneOf,
  arrangementWriteEffects,
  type LaneSnapshot,
  snapshotLane,
} from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import { appendReason } from "#src/tools/shared/helpers/entry-reasons.ts";
import {
  createAudioArrangementClip,
  createAudioSessionClip,
} from "./audio-clip-creation.ts";
import {
  buildClipProperties,
  buildClipResult,
  type ClipResultObject,
} from "./created-clip-result.ts";

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

/**
 * Processes one clip creation at a specific position
 * @param view - View type (session or arrangement)
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index for session clips (explicit position)
 * @param arrangementStartBeats - Arrangement start in beats (explicit position)
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
): ClipResultObject {
  let clip: LiveAPI;
  let currentSceneIndex: number | undefined;
  let slotWork: SlotWork | null = null;
  const laneBefore = laneBeforeCreate(view, trackIndex, takeLane, track);

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
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
      slotWork = result;
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
      );

      clip = result.clip;
      currentSceneIndex = result.sceneIndex;
      slotWork = result;
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

  const clipResult = buildClipResult(
    clip,
    trackIndex,
    view,
    currentSceneIndex,
    notationString,
    length,
    timeSigNumerator,
    timeSigDenominator,
    sampleFile,
    transformedCount,
    color,
    audio.warping ?? null,
  );

  if (slotWork != null) {
    noteSlotWork(clipResult, slotWork);
  }

  return noteDisplaced(clipResult, laneBefore, clip.id);
}

// --- Private helpers ---

/**
 * Say on the new clip's entry what reaching its slot took.
 * @param clipResult - The new clip's entry
 * @param slotWork - The scenes made and the clip replaced, if any
 */
function noteSlotWork(clipResult: ClipResultObject, slotWork: SlotWork): void {
  if (slotWork.created != null) {
    clipResult.created = slotWork.created;
  }

  if (slotWork.overwrote != null) {
    appendReason(clipResult, slotWork.overwrote);
  }
}

/**
 * Photograph the arrangement lane a create is about to write into, so the new
 * clip's entry can say what it displaced. Null in the session, where a slot
 * holds one clip and there is nothing to displace.
 * @param view - View type (session or arrangement)
 * @param trackIndex - Track index
 * @param takeLane - Take lane the clip goes on, or null for the main lane
 * @param track - The destination track, resolved once for the whole call
 * @returns The lane as it was, or null for a session create
 */
function laneBeforeCreate(
  view: string,
  trackIndex: number,
  takeLane: LiveAPI | null,
  track: LiveAPI | null,
): LaneSnapshot | null {
  if (view === "session") {
    return null;
  }

  return snapshotLane(
    arrangementLaneOf({
      trackIndex,
      takeLane: takeLane?.takeLaneIndex ?? null,
    }),
    // The batch already resolved the lane; don't build it per clip.
    takeLane ?? track ?? undefined,
  );
}

/**
 * Say on the new clip's entry what the create did to the clips already on the
 * lane, which Live reports nowhere.
 * @param clipResult - The new clip's entry
 * @param laneBefore - The lane as it was, or null for a session create
 * @param clipId - The clip the create made, which describes itself
 * @returns The entry
 */
function noteDisplaced(
  clipResult: ClipResultObject,
  laneBefore: LaneSnapshot | null,
  clipId: string,
): ClipResultObject {
  const displaced =
    laneBefore == null
      ? undefined
      : arrangementWriteEffects(laneBefore, [clipId]);

  if (displaced != null) {
    appendReason(clipResult, displaced);
  }

  return clipResult;
}

interface SessionClipResult extends SlotWork {
  clip: LiveAPI;
  sceneIndex: number;
}

/**
 * Creates a session clip in a clip slot, creating the scenes up to it if needed
 * @param trackIndex - Track index (0-based)
 * @param sceneIndex - Target scene index (0-based)
 * @param clipLength - Clip length in beats
 * @param liveSet - LiveAPI live_set object
 * @returns Object with clip, sceneIndex, the scenes created, and what it replaced
 */
function createSessionClip(
  trackIndex: number,
  sceneIndex: number,
  clipLength: number,
  liveSet: LiveAPI,
): SessionClipResult {
  const { clip, created, overwrote } = createInSessionSlot(
    trackIndex,
    sceneIndex,
    liveSet,
    (clipSlot) => clipSlot.call("create_clip", clipLength),
  );

  return { clip, sceneIndex, created, overwrote };
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
  const clip = requireCreatedArrangementClip(
    newClipResult,
    trackIndex,
    takeLane?.takeLaneIndex ?? null,
    arrangementStartBeats,
  );

  return { clip, arrangementStartBeats };
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

  if (clipName) {
    propsToSet.name = clipName;
  }

  if (color != null) {
    propsToSet.color = color;
  }

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
