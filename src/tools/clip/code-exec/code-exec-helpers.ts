/**
 * V8-side helpers for code execution feature.
 * Handles note extraction, context building, and note application.
 */

import type { NoteEvent } from "#src/notation/types.ts";
import { PITCH_CLASS_NAMES } from "#src/shared/pitch.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import type {
  CodeClipContext,
  CodeExecutionContext,
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
