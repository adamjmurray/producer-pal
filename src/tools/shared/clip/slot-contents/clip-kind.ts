// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
