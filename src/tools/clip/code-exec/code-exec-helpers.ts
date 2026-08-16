// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * V8-side helpers for code execution feature.
 * Handles note extraction, context building, and note application.
 */

import {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
} from "#src/notation/midi-json/midi-json-note.ts";
import { dedupeAndSortNotes } from "#src/notation/note-sort.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { PITCH_CLASS_NAMES } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  readAllClipNotes,
  rawNotesToNoteEvents,
  removeAllClipNotes,
} from "#src/tools/shared/clip-notes.ts";
import {
  arrangementPath,
  slotPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  type CodeClipContext,
  type CodeExecutionContext,
  type CodeLiveSetContext,
  type CodeLocationContext,
  type CodeNote,
  type CodeTrackContext,
} from "./code-exec-types.ts";

/**
 * Extract notes from a clip.
 *
 * @param clip - LiveAPI clip object
 * @returns Array of notes in code-facing format
 */
export function extractNotesFromClip(clip: LiveAPI): CodeNote[] {
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  // Read the same [-length, 2*length] window as read-clip so a pickup before
  // the clip start (negative start_time) is visible to user code, not silently
  // dropped because it sits outside the playable region [0, length].
  const notes = rawNotesToNoteEvents(readAllClipNotes(clip));

  return notes.map((note) => noteEventToCodeNote(note, timeSigDenominator));
}

/**
 * Apply notes to a clip, replacing all existing notes.
 *
 * @param clip - LiveAPI clip object
 * @param notes - Array of notes in code-facing format
 */
export function applyNotesToClip(clip: LiveAPI, notes: CodeNote[]): void {
  // Remove all existing notes (same window readAllClipNotes/read-clip use, so a
  // pickup before the clip start is cleared too — never orphaned outside it).
  removeAllClipNotes(clip);

  if (notes.length === 0) {
    return;
  }

  // Convert musical beats back to Ableton beats, then dedupe same-pitch+start
  // collisions (keep-last) and sort ascending by start_time before adding. User
  // code returns notes in arbitrary order and may emit two notes at the same
  // pitch+onset; add_new_notes deletes an earlier same-pitch note when a
  // later-written note overlaps its onset, so an unsorted or duplicated write
  // silently drops notes. Every other write path does this (see note-sort.ts).
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  const { notes: noteEvents, collisions } = dedupeAndSortNotes(
    notes.map((note) => codeNoteToNoteEvent(note, timeSigDenominator)),
  );

  if (collisions > 0) {
    console.warn(
      `Dropped ${collisions} duplicate note${collisions === 1 ? "" : "s"} at the same pitch and start`,
    );
  }

  clip.call("add_new_notes", { notes: noteEvents });
}

/**
 * Build the full code execution context from Live API.
 *
 * @param clip - LiveAPI clip object
 * @param view - Session or arrangement view
 * @param clipIndex - 0-based position in the current batch (matches transforms' clip.index)
 * @param clipCount - Total clips in the current batch (matches transforms' clip.count)
 * @param sceneIndex - Scene index (session only)
 * @param arrangementStartBeats - Arrangement start position (arrangement only)
 * @returns Context object for code execution
 */
export function buildCodeExecutionContext(
  clip: LiveAPI,
  view: "session" | "arrangement",
  clipIndex: number,
  clipCount: number,
  sceneIndex?: number,
  arrangementStartBeats?: number,
): CodeExecutionContext {
  const track = buildTrackContext(clip);
  const clipContext = buildClipContext(clip, clipIndex, clipCount);
  const location = buildLocationContext(
    view,
    clip.trackIndex,
    sceneIndex,
    arrangementStartBeats,
    clip.takeLaneIndex,
  );
  const liveSet = buildLiveSetContext();
  const beatsPerBar = getBeatsPerBar(clip);

  return { track, clip: clipContext, location, liveSet, beatsPerBar };
}

/** @see getClipNoteCount - re-exported for code-exec API compatibility */
export { getClipNoteCount } from "#src/tools/shared/clip-notes.ts";

// The note model, converters, and validators now live in the notation layer
// (shared with the MIDI JSON notation). Re-exported here so code-exec callers
// and tests keep importing them from this module.
export {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
  validateAndSanitizeNote,
  validateCodeNotes,
} from "#src/notation/midi-json/midi-json-note.ts";

/**
 * Determine the view and location info for a clip.
 *
 * @param clip - LiveAPI clip object
 * @returns View, scene index, and arrangement start info
 */
export function getClipLocationInfo(clip: LiveAPI): {
  view: "session" | "arrangement";
  sceneIndex?: number;
  arrangementStartBeats?: number;
} {
  const isArrangement = (clip.getProperty("is_arrangement_clip") as number) > 0;

  if (isArrangement) {
    const startBeats = clip.getProperty("start_time") as number;

    return { view: "arrangement", arrangementStartBeats: startBeats };
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
  view: "session" | "arrangement",
  trackIndex: number | null,
  sceneIndex?: number,
  arrangementStartBeats?: number,
  takeLaneIndex?: number | null,
): CodeLocationContext {
  const location: CodeLocationContext = { view };

  // Omitted rather than guessed when the clip's own coordinates don't say where
  // it is — a wrong path here is one user code would act on.
  if (trackIndex != null) {
    if (view === "arrangement") {
      location.path = arrangementPath(trackIndex, takeLaneIndex);
    } else if (sceneIndex != null) {
      location.path = slotPath(trackIndex, sceneIndex);
    }
  }

  if (view === "arrangement" && arrangementStartBeats != null) {
    // Arrangement positions resolve against the song meter; expose musical beats
    // (song denominator) so this matches the musical-beat clip fields.
    const songDenom = LiveAPI.from(livePath.liveSet).getProperty(
      "signature_denominator",
    ) as number;

    location.arrangementStart = arrangementStartBeats * (songDenom / 4);
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
