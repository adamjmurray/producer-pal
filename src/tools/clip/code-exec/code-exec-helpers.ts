// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * V8-side helpers for code execution feature.
 * Handles note extraction, context building, and note application.
 */

import { DEFAULT_VELOCITY } from "#src/notation/barbeat/barbeat-config.ts";
import type { NoteEvent } from "#src/notation/types.ts";
import { PITCH_CLASS_NAMES } from "#src/shared/pitch.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import type {
  CodeClipContext,
  CodeExecutionContext,
  CodeExecutionResult,
  CodeLiveSetContext,
  CodeLocationContext,
  CodeNote,
  CodeTrackContext,
} from "./code-exec-types.ts";

/**
 * Extract notes from a clip.
 *
 * @param clip - LiveAPI clip object
 * @returns Array of notes in code-facing format
 */
export function extractNotesFromClip(clip: LiveAPI): CodeNote[] {
  const notesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS) as string,
  );
  const notes: NoteEvent[] = notesResult?.notes ?? [];

  return notes.map(noteEventToCodeNote);
}

/**
 * Apply notes to a clip, replacing all existing notes.
 *
 * @param clip - LiveAPI clip object
 * @param notes - Array of notes in code-facing format
 */
export function applyNotesToClip(clip: LiveAPI, notes: CodeNote[]): void {
  // Remove all existing notes
  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);

  if (notes.length === 0) {
    return;
  }

  // Convert to NoteEvent format and add
  const noteEvents = notes.map(codeNoteToNoteEvent);

  clip.call("add_new_notes", { notes: noteEvents });
}

/**
 * Build the full code execution context from Live API.
 *
 * @param clip - LiveAPI clip object
 * @param view - Session or arrangement view
 * @param sceneIndex - Scene index (session only)
 * @param arrangementStartBeats - Arrangement start position (arrangement only)
 * @returns Context object for code execution
 */
export function buildCodeExecutionContext(
  clip: LiveAPI,
  view: "session" | "arrangement",
  sceneIndex?: number,
  arrangementStartBeats?: number,
): CodeExecutionContext {
  const track = buildTrackContext(clip);
  const clipContext = buildClipContext(clip);
  const location = buildLocationContext(
    view,
    sceneIndex,
    arrangementStartBeats,
  );
  const liveSet = buildLiveSetContext();
  const beatsPerBar = getBeatsPerBar(clip);

  return { track, clip: clipContext, location, liveSet, beatsPerBar };
}

/**
 * Convert internal NoteEvent to code-facing CodeNote format.
 *
 * @param event - Internal NoteEvent with snake_case properties
 * @returns CodeNote with camelCase properties
 */
export function noteEventToCodeNote(event: NoteEvent): CodeNote {
  return {
    pitch: event.pitch,
    start: event.start_time,
    duration: event.duration,
    velocity: event.velocity,
    velocityDeviation: event.velocity_deviation ?? 0,
    probability: event.probability ?? 1,
  };
}

/**
 * Convert code-facing CodeNote to internal NoteEvent format.
 *
 * @param note - CodeNote with camelCase properties
 * @returns Internal NoteEvent with snake_case properties
 */
export function codeNoteToNoteEvent(note: CodeNote): NoteEvent {
  return {
    pitch: note.pitch,
    start_time: note.start,
    duration: note.duration,
    velocity: note.velocity,
    velocity_deviation: note.velocityDeviation,
    probability: note.probability,
  };
}

/**
 * Get the note count within the playable region of a clip.
 *
 * @param clip - LiveAPI clip object
 * @returns Number of notes in the playable region
 */
export function getClipNoteCount(clip: LiveAPI): number {
  const lengthBeats = clip.getProperty("length") as number;
  const notesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats) as string,
  );

  return notesResult?.notes?.length ?? 0;
}

/**
 * Validate a raw sandbox result as a notes array.
 * Filters out invalid notes and clamps values to valid ranges.
 *
 * @param result - Raw result from sandbox execution
 * @returns Validated CodeExecutionResult
 */
export function validateCodeNotes(result: unknown): CodeExecutionResult {
  if (!Array.isArray(result)) {
    return {
      success: false,
      error: `Code must return an array of notes, got ${typeof result}`,
    };
  }

  const validatedNotes: CodeNote[] = [];

  for (const note of result) {
    const validated = validateAndSanitizeNote(note);

    if (validated.valid) {
      validatedNotes.push(validated.note);
    }
    // Invalid notes are silently filtered out
  }

  return { success: true, notes: validatedNotes };
}

/**
 * Validate and sanitize a note from user code.
 * Returns a valid note with clamped values, or invalid if note is malformed.
 *
 * @param note - The note object to validate
 * @returns Valid note with sanitized values, or invalid marker
 */
export function validateAndSanitizeNote(
  note: unknown,
): { valid: true; note: CodeNote } | { valid: false } {
  if (typeof note !== "object" || note === null) {
    return { valid: false };
  }

  const n = note as Record<string, unknown>;

  // Check required properties exist and are numbers
  if (typeof n.pitch !== "number" || typeof n.start !== "number") {
    return { valid: false };
  }

  // Default duration and velocity if not provided
  const duration = typeof n.duration === "number" ? n.duration : 1;
  const velocity =
    typeof n.velocity === "number" ? n.velocity : DEFAULT_VELOCITY;

  // Validate ranges (start can be negative for notes before clip start)
  if (duration <= 0) {
    return { valid: false };
  }

  // Sanitize by clamping values
  const sanitized: CodeNote = {
    pitch: Math.max(0, Math.min(127, Math.round(n.pitch))),
    start: n.start,
    duration: Math.max(0.001, duration),
    velocity: Math.max(1, Math.min(127, Math.round(velocity))),
    velocityDeviation: Math.max(
      0,
      Math.min(127, Math.round(Number(n.velocityDeviation) || 0)),
    ),
    probability: Math.max(
      0,
      Math.min(1, n.probability == null ? 1 : Number(n.probability)),
    ),
  };

  return { valid: true, note: sanitized };
}

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

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

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

function buildClipContext(clip: LiveAPI): CodeClipContext {
  const id = clip.id;
  const name = clip.getProperty("name") as string | null;
  const length = clip.getProperty("length") as number;
  const sigNum = clip.getProperty("signature_numerator") as number;
  const sigDenom = clip.getProperty("signature_denominator") as number;
  const looping = (clip.getProperty("looping") as number) > 0;

  return {
    id,
    name,
    length,
    timeSignature: `${sigNum}/${sigDenom}`,
    looping,
  };
}

function buildLocationContext(
  view: "session" | "arrangement",
  sceneIndex?: number,
  arrangementStartBeats?: number,
): CodeLocationContext {
  const location: CodeLocationContext = { view };

  if (view === "session" && sceneIndex != null) {
    location.sceneIndex = sceneIndex;
  }

  if (view === "arrangement" && arrangementStartBeats != null) {
    location.arrangementStart = arrangementStartBeats;
  }

  return location;
}

function buildLiveSetContext(): CodeLiveSetContext {
  const liveSet = LiveAPI.from("live_set");

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

function getBeatsPerBar(clip: LiveAPI): number {
  return clip.getProperty("signature_numerator") as number;
}
