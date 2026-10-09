// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** A note copied as-is: everything add_new_notes takes, minus note_id. */
export interface CopiedNote extends NoteEvent {
  mute: number;
  release_velocity: number;
}

export interface ClipNotes {
  visible: Record<string, unknown>[];
  /** Hidden from the model; every edit leaves them in place */
  muted: Record<string, unknown>[];
}

/**
 * Count a clip's visible notes over read-clip's window, so the two agree.
 * @param clip - LiveAPI clip object
 * @returns Number of visible notes in the read window
 */
export function getClipNoteCount(clip: LiveAPI): number {
  return readClipNotes(clip).visible.length;
}

/**
 * Read a clip's raw notes split by mute. The model sees and edits `visible`; a
 * write that removes all notes and re-adds them must put `muted` back.
 * @param clip - LiveAPI clip object
 * @returns The scan window's notes, split by mute
 */
export function readClipNotes(clip: LiveAPI): ClipNotes {
  return splitByMute(readAllClipNotes(clip));
}

/**
 * Read the visible (unmuted) notes starting in a span. Any count of notes the
 * model can see wants this, not {@link readClipNotesInSpan}: muted notes don't
 * count.
 * @param clip - LiveAPI clip object
 * @param fromTime - Span start in beats
 * @param timeSpan - Span length in beats
 * @returns Raw visible note objects, or [] when the span holds none
 */
export function readVisibleClipNotesInSpan(
  clip: LiveAPI,
  fromTime: number,
  timeSpan: number,
): Record<string, unknown>[] {
  return splitByMute(readClipNotesInSpan(clip, fromTime, timeSpan)).visible;
}

/**
 * Read every note in a clip's scan window, muted ones included, for copying a
 * clip; what the model sees or edits wants {@link readClipNotes}. Strip
 * note_id ({@link rawNotesToCopiedNotes}) before re-adding.
 * @param clip - LiveAPI clip object
 * @returns Raw note objects, or [] when the window holds no notes
 */
export function readAllClipNotes(clip: LiveAPI): Record<string, unknown>[] {
  const [fromTime, timeSpan] = clipNoteScanWindow(clip);

  return readClipNotesInSpan(clip, fromTime, timeSpan);
}

/**
 * Read every note starting in a span, as raw Live API note objects.
 * @param clip - LiveAPI clip object
 * @param fromTime - Span start in beats
 * @param timeSpan - Span length in beats
 * @returns Raw note objects, or [] when the span holds no notes
 */
export function readClipNotesInSpan(
  clip: LiveAPI,
  fromTime: number,
  timeSpan: number,
): Record<string, unknown>[] {
  const result = JSON.parse(
    clip.call("get_notes_extended", 0, 128, fromTime, timeSpan) as string,
  );

  return (result?.notes ?? []) as Record<string, unknown>[];
}

/**
 * Remove every note in a clip's scan window — the same window
 * {@link readAllClipNotes} reads, and it must stay that way.
 * @param clip - LiveAPI clip object
 */
export function removeAllClipNotes(clip: LiveAPI): void {
  const [fromTime, timeSpan] = clipNoteScanWindow(clip);

  clip.call("remove_notes_extended", 0, 128, fromTime, timeSpan);
}

/**
 * Normalize raw notes from get_notes_extended into NoteEvents for add_new_notes.
 * Drops note_id, mute and release_velocity: code-exec rebuilds every visible
 * note from user code, which has nowhere to carry the last two. Anything that
 * writes back notes the call didn't touch wants {@link rawNotesToCopiedNotes}.
 * @param rawNotes - Note objects from get_notes_extended
 * @returns NoteEvents safe to pass to add_new_notes
 */
export function rawNotesToNoteEvents(
  rawNotes: Record<string, unknown>[],
): NoteEvent[] {
  return rawNotes.map(toNoteEvent);
}

/**
 * Normalize raw notes for re-adding them unchanged: everything add_new_notes
 * takes, per-note mute and release velocity included. Only note_id goes, or a
 * stale id gets re-fed on a later write (e.g. one source copied to several
 * positions).
 * @param rawNotes - Note objects from get_notes_extended
 * @returns Notes safe to pass to add_new_notes, per-note state intact
 */
export function rawNotesToCopiedNotes(
  rawNotes: Record<string, unknown>[],
): CopiedNote[] {
  return rawNotes.map((rawNote) => ({
    ...toNoteEvent(rawNote),
    mute: rawNote.mute as number,
    release_velocity: rawNote.release_velocity as number,
  }));
}

// --- Private helpers ---

/**
 * Split raw notes by their mute flag.
 * @param notes - Raw note objects from get_notes_extended
 * @returns The notes split into visible and muted
 */
function splitByMute(notes: Record<string, unknown>[]): ClipNotes {
  const visible: Record<string, unknown>[] = [];
  const muted: Record<string, unknown>[] = [];

  for (const note of notes) {
    ((note.mute as number) > 0 ? muted : visible).push(note);
  }

  return { visible, muted };
}

/**
 * The NoteEvent fields of one raw note.
 * @param rawNote - A note object from get_notes_extended
 * @returns The note without note_id or per-note playback state
 */
function toNoteEvent(rawNote: Record<string, unknown>): NoteEvent {
  return {
    pitch: rawNote.pitch as number,
    start_time: rawNote.start_time as number,
    duration: rawNote.duration as number,
    velocity: rawNote.velocity as number,
    probability: rawNote.probability as number,
    velocity_deviation: rawNote.velocity_deviation as number,
  };
}

/**
 * The (from_time, time_span) pair for the note-scan window: the clip's region
 * (markers and loop, whichever reach further) plus one clip-length on each
 * side, so a pickup before the start and overhang past the end come along.
 * Note times are absolute, not relative to the region, so a clip created at
 * 5|1 keeps its notes at beat 16. Read AND remove share it so the windows
 * can't drift — a wider remove would destroy notes that were never read back.
 * @param clip - LiveAPI clip object
 * @returns [fromTime, timeSpan] for get_notes_extended / remove_notes_extended
 */
export function clipNoteScanWindow(clip: LiveAPI): [number, number] {
  const lengthBeats = clip.getProperty("length") as number;
  const regionStart = Math.min(
    clip.getProperty("start_marker") as number,
    clip.getProperty("loop_start") as number,
  );
  const regionEnd = Math.max(
    clip.getProperty("end_marker") as number,
    clip.getProperty("loop_end") as number,
  );
  const fromTime = regionStart - lengthBeats;

  return [fromTime, regionEnd + lengthBeats - fromTime];
}

/** The notes a clip plays start in [from, to), in note time. */
export interface ClipPlayRegion {
  from: number;
  to: number;
}

/**
 * Where a MIDI clip's notes play. A looping clip plays from start_marker once,
 * then loops loop_start..loop_end.
 * @param clip - The MIDI clip
 * @returns The region a note must start in to play
 */
export function clipPlayRegion(clip: LiveAPI): ClipPlayRegion {
  const looping = (clip.getProperty("looping") as number) > 0;
  const startMarker = clip.getProperty("start_marker") as number;

  return {
    from: looping
      ? Math.min(startMarker, clip.getProperty("loop_start") as number)
      : startMarker,
    to: clip.getProperty(looping ? "loop_end" : "end_marker") as number,
  };
}

/**
 * Whether a note starts outside the region, so it never plays.
 * @param note - Anything with a start_time
 * @param region - The clip's play region
 * @returns True when the note starts before the region or at or after its end
 */
export function startsOutside(
  note: { start_time: number },
  region: ClipPlayRegion,
): boolean {
  return note.start_time < region.from || note.start_time >= region.to;
}

/**
 * A note's identity for telling the notes a call wrote from the ones already
 * there: its pitch and start, to the tolerance a round trip through Live keeps.
 * @param note - Anything with a pitch and start_time
 * @returns A key equal for notes in the same slot
 */
export function noteSlotKey(note: {
  pitch: number;
  start_time: number;
}): string {
  return `${note.pitch}@${Math.round(note.start_time / SAME_TIME_EPSILON)}`;
}

/**
 * How many of the notes just written to a clip start outside its region.
 * @param clip - The MIDI clip, with its region already set
 * @param written - The notes written to it
 * @returns The number that start outside the region and so never play
 */
export function countStartingOutside(
  clip: LiveAPI,
  written: { start_time: number }[],
): number {
  const region = clipPlayRegion(clip);

  return written.filter((note) => startsOutside(note, region)).length;
}

/**
 * How many of the notes an edit wrote start outside the region, leaving out the
 * ones that were already there and are written back as they were.
 * @param written - The visible notes the edit wrote
 * @param region - The clip's play region
 * @param before - The clip's visible notes as the edit read them
 * @returns The number the edit put outside the region
 */
export function countPutOutside(
  written: { pitch: number; start_time: number }[],
  region: ClipPlayRegion,
  before: Record<string, unknown>[],
): number {
  const alreadyOutside = new Set(
    (before as unknown as { pitch: number; start_time: number }[])
      .filter((note) => startsOutside(note, region))
      .map(noteSlotKey),
  );

  return written.filter(
    (note) =>
      startsOutside(note, region) && !alreadyOutside.has(noteSlotKey(note)),
  ).length;
}
