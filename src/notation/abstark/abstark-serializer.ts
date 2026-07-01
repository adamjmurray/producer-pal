// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Abstark serializer: converts NoteEvent[] into an Abstark string.
 * Round-trip (interpret → serialize → interpret) is a fixed point modulo the
 * documented lossy axes: velocity bucketing, 16th-grid drum timing, and
 * enharmonic re-spelling (C# input → Db output, per PITCH_CLASS_NAMES).
 *
 * Always emits explicit /N per token (no line-default factoring in 1.0).
 */

import {
  BASS_REGISTER_DEFAULT,
  CHORDS_REGISTER_DEFAULT,
  MELODY_REGISTER_DEFAULT,
  MIDI_TO_DRUM_NAME,
  SIXTEENTH_NOTE_BEATS,
  VELOCITY_ACCENT_THRESHOLD,
  VELOCITY_SOFT_THRESHOLD,
} from "#src/notation/abstark/abstark-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { midiToNoteName, PITCH_CLASS_NAMES } from "#src/shared/pitch.ts";

/** Options for {@link formatNotation}. */
export interface AbstarkFormatOptions {
  /**
   * True when the clip's track has a Drum Rack instrument (detected via the
   * same device-tree traversal that builds a track's drum map). It — not the
   * MIDI pitch — decides drum vs. pitched serialization, so a bass C2 (MIDI 36)
   * on a melodic track is NOT mistaken for a kick.
   */
  drumMode?: boolean;
}

/**
 * Serialize MIDI note events into an Abstark notation string.
 *
 * Drum vs. pitched is an all-or-nothing choice driven by the track, not by
 * individual MIDI numbers: a Drum-Rack track (`drumMode`) serializes every note
 * as a drum line; any other track serializes every note as bass/melody/chords.
 * This is deliberately asymmetric — it's the only way to keep low pitched notes
 * (which overlap the GM drum range) round-trippable.
 *
 * @param notes - Note events to serialize
 * @param options - Serialization options (notably `drumMode`)
 * @returns Abstark string, or "" when there are no serializable notes
 */
export function formatNotation(
  notes: NoteEvent[],
  options: AbstarkFormatOptions = {},
): string {
  if (notes.length === 0) return "";

  if (options.drumMode) {
    return serializeDrums(notes).join("\n");
  }

  return serializePitched(notes);
}

// ---- Drum serializer ----

// Serialize drum notes into one `<header>: <pattern>` line per pitch. The
// header prefers the readable drum name (kick/snare/…) when one maps to the
// pitch, and falls back to an absolute pitch name (e.g. "C3", Ableton C3=60)
// otherwise — so any Drum-Rack pad round-trips, no drops.
function serializeDrums(notes: NoteEvent[]): string[] {
  const byPitch = new Map<number, NoteEvent[]>();

  for (const note of notes) {
    const existing = byPitch.get(note.pitch);

    if (existing) {
      existing.push(note);
    } else {
      byPitch.set(note.pitch, [note]);
    }
  }

  const lines: string[] = [];

  for (const [midi, drumNotes] of byPitch) {
    // midiToNoteName only returns null for out-of-range MIDI; NoteEvent pitches
    // are always 0–127, so the fallback is safe to assert non-null.
    const header = MIDI_TO_DRUM_NAME[midi] ?? (midiToNoteName(midi) as string);

    lines.push(`${header}: ${drumPattern(drumNotes)}`);
  }

  return lines;
}

// Build a positional 16th-note pattern string for one drum instrument.
function drumPattern(notes: NoteEvent[]): string {
  const maxStart = Math.max(...notes.map((n) => n.start_time));
  const steps = Math.max(16, Math.ceil(maxStart / SIXTEENTH_NOTE_BEATS) + 1);
  // Round up to the next multiple of 16 (one bar of 4/4 at 16th grid)
  const patternLen = Math.ceil(steps / 16) * 16;

  const pattern = Array<string>(patternLen).fill(".");

  for (const note of notes) {
    const pos = Math.round(note.start_time / SIXTEENTH_NOTE_BEATS);

    if (pos < patternLen) {
      pattern[pos] = drumChar(note.velocity);
    }
  }

  // Group into beats of 4 with spaces (e.g. "X.X. x.x. ...." "....")
  const groups: string[] = [];

  for (let i = 0; i < patternLen; i += 4) {
    groups.push(pattern.slice(i, i + 4).join(""));
  }

  return groups.join(" ");
}

// Map velocity to drum character (^/X/x).
function drumChar(velocity: number): string {
  if (velocity >= VELOCITY_ACCENT_THRESHOLD) return "^";
  if (velocity >= VELOCITY_SOFT_THRESHOLD) return "X";

  return "x";
}

// ---- Pitched serializer ----

// Classify and serialize non-drum notes into a single section line.
function serializePitched(notes: NoteEvent[]): string {
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);

  // Detect simultaneous notes (same start_time within epsilon).
  const hasChords = sorted.some((note, i) => {
    const next = sorted[i + 1];

    return (
      next !== undefined &&
      Math.abs(note.start_time - next.start_time) < SAME_TIME_EPSILON
    );
  });

  if (hasChords) {
    return serializeChords(sorted);
  }

  // Monophonic — classify as bass or melody by median pitch.
  const pitches = sorted.map((n) => n.pitch).sort((a, b) => a - b);
  const medianPitch = pitches[Math.floor(pitches.length / 2)] ?? 60;
  const lineType = medianPitch < 48 ? "bass" : "melody";
  const registerDefault =
    lineType === "bass" ? BASS_REGISTER_DEFAULT : MELODY_REGISTER_DEFAULT;

  return serializeMono(lineType, registerDefault, sorted);
}

// Serialize a monophonic (bass or melody) note sequence.
function serializeMono(
  lineType: string,
  registerDefault: number,
  notes: NoteEvent[],
): string {
  const tokens: string[] = [];
  let time = 0;

  for (const note of notes) {
    if (note.start_time > time + SAME_TIME_EPSILON) {
      tokens.push(...restTokens(note.start_time - time));
    }

    tokens.push(
      noteToken(note.pitch, registerDefault, note.duration, note.velocity),
    );
    time = note.start_time + note.duration;
  }

  return `${lineType}: ${tokens.join(" ")}`;
}

// Serialize a chords section (groups of simultaneous notes).
function serializeChords(notes: NoteEvent[]): string {
  const tokens: string[] = [];
  let time = 0;
  let i = 0;

  while (i < notes.length) {
    // i < notes.length above guarantees this access is valid
    const groupStart = (notes[i] as NoteEvent).start_time;

    // Collect all notes that start at this time position.
    const group: NoteEvent[] = [];

    while (
      i < notes.length &&
      // i < notes.length above guarantees this access is valid
      Math.abs((notes[i] as NoteEvent).start_time - groupStart) <
        SAME_TIME_EPSILON
    ) {
      group.push(notes[i] as NoteEvent); // i < notes.length guarantees valid index
      i++;
    }

    if (groupStart > time + SAME_TIME_EPSILON) {
      tokens.push(...restTokens(groupStart - time));
    }

    // Use duration and velocity of the first note in the group.
    // group is non-empty: the inner while ran at least once (groupStart matched)
    const rep = group[0] as NoteEvent;
    const dur = durationN(rep.duration);
    const dyn = dynamicSuffix(rep.velocity);
    const innerNotes = group
      .map((n) => chordNoteToken(n.pitch, CHORDS_REGISTER_DEFAULT))
      .join(" ");

    tokens.push(`[${innerNotes}]/${dur}${dyn}`);
    time = groupStart + rep.duration;
  }

  return `chords: ${tokens.join(" ")}`;
}

// ---- Token formatters ----

// Format a single pitched note token: letter + accidental + octave marks + /N + dynamic.
function noteToken(
  midi: number,
  registerDefault: number,
  durationBeats: number,
  velocity: number,
): string {
  const { letter, accidental, octaveShift } = pitchParts(midi, registerDefault);
  const marks = octaveMarks(octaveShift);
  const dur = durationN(durationBeats);
  const dyn = dynamicSuffix(velocity);

  return `${letter}${accidental}${marks}/${dur}${dyn}`;
}

// Format a note inside a bracket chord (no duration/dynamic — those go on the bracket).
function chordNoteToken(midi: number, registerDefault: number): string {
  const { letter, accidental, octaveShift } = pitchParts(midi, registerDefault);

  return `${letter}${accidental}${octaveMarks(octaveShift)}`;
}

// Decompose a MIDI pitch into Abstark letter + accidental + octave shift
// relative to a register default (the MIDI value that C maps to in that line).
function pitchParts(
  midi: number,
  registerDefault: number,
): { letter: string; accidental: string; octaveShift: number } {
  const pitchClass = ((midi % 12) + 12) % 12;
  // PITCH_CLASS_NAMES uses flats: C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B
  const name = PITCH_CLASS_NAMES[pitchClass] ?? "C";
  const letter = name[0] ?? "C";
  const accidental = name.length > 1 ? "b" : "";
  // The "natural" MIDI position for this pitch class in the register
  const naturalMidi = registerDefault + pitchClass;
  const octaveShift = Math.round((midi - naturalMidi) / 12);

  return { letter, accidental, octaveShift };
}

// Convert duration in beats to a /N denominator string.
// Supported values: 4 beats → "1", 2 → "2", 1 → "4", 0.5 → "8", 0.25 → "16".
function durationN(beats: number): string {
  const n = Math.round(4 / beats);

  // Clamp to supported values
  if (n <= 1) return "1";
  if (n <= 2) return "2";
  if (n <= 4) return "4";
  if (n <= 8) return "8";

  return "16";
}

// Build octave mark string from shift count.
function octaveMarks(shift: number): string {
  if (shift > 0) return "'".repeat(shift);
  if (shift < 0) return ",".repeat(-shift);

  return "";
}

// Map velocity to dynamic suffix ("!" / "" / "?").
function dynamicSuffix(velocity: number): string {
  if (velocity >= VELOCITY_ACCENT_THRESHOLD) return "!";
  if (velocity >= VELOCITY_SOFT_THRESHOLD) return "";

  return "?";
}

// Build rest tokens to fill a gap of the given beat count.
// Greedy: largest available duration first (whole → half → quarter → 8th → 16th).
function restTokens(gapBeats: number): string[] {
  const tokens: string[] = [];
  const denominators = [1, 2, 4, 8, 16] as const;

  let remaining = gapBeats;

  for (const n of denominators) {
    const beats = 4 / n;

    while (remaining >= beats - SAME_TIME_EPSILON) {
      tokens.push(`z/${n}`);
      remaining -= beats;
    }
  }

  return tokens;
}
