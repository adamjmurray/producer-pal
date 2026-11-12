// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  CLIP_IS_ENVELOPE,
  CLIP_IS_STEP_SEQUENCER,
} from "#src/shared/max/ignored-wording.ts";
import { isReturnTrackClip } from "./return-track-clips.ts";

/**
 * What a clip holds. A step sequencer clip is a Live 13 MIDI clip whose notes
 * the API hides; an envelope clip is a Live 13 clip with automation only.
 */
export type ClipKind = "midi" | "step-sequencer" | "audio" | "envelope";

/**
 * Classify a clip. The one place that decides "not MIDI" means audio: an
 * envelope clip is not MIDI either, and reads must not treat it as audio.
 * @param clip - The clip
 * @param isMidi - Whether `is_midi_clip` read as set, which the caller has read
 * @returns The clip's kind
 */
export function clipKind(clip: LiveAPI, isMidi: boolean): ClipKind {
  if (isMidi) {
    return clip.midiClipIsStepSequencer ? "step-sequencer" : "midi";
  }

  return clip.nonMidiClipIsEnvelope ? "envelope" : "audio";
}

/**
 * Why a clip's notes can't be reached, or null when they can. Live's notes API
 * reads a hidden list on a step sequencer clip and has none on an envelope
 * clip, so note work on either does nothing or throws. Asked of a clip before
 * any note read or write; the envelope check reads nothing from Live.
 * @param clip - The clip
 * @returns The reason, as it completes "notes ignored: ...", or null
 */
export function noNotesReason(clip: LiveAPI): string | null {
  if (isReturnTrackClip(clip)) {
    return CLIP_IS_ENVELOPE;
  }

  return clip.isStepSequencerClip ? CLIP_IS_STEP_SEQUENCER : null;
}
