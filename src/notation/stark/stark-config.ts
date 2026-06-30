// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Configuration constants for Stark notation: an ultra-minimal music notation
 * for small/weak LLMs (small-model mode). See parser/stark-grammar.peggy and
 * stark-interpreter.ts.
 */

// Velocity ranges for different dynamic levels
export const VELOCITY_LOUD_MIN = 100;
export const VELOCITY_LOUD_MAX = 110;
export const VELOCITY_SOFT_MIN = 60;
export const VELOCITY_SOFT_MAX = 80;
export const VELOCITY_ACCENT_MIN = 115;
export const VELOCITY_ACCENT_MAX = 127;

// Timing (in musical beats)
export const QUARTER_NOTE_BEATS = 1.0;
export const SIXTEENTH_NOTE_BEATS = 0.25;

// Octave ranges for different modes.
// Code uses the formula MIDI = octave * 12 + pitchClass (octave is -1 relative
// to the standard pitch-name octave, so octave 3 = standard C2 = MIDI 36).
export const BASS_DEFAULT_OCTAVE = 3; // MIDI 36 (standard C2)
export const BASS_MIN_OCTAVE = 2; // MIDI 24 (standard C1)
export const BASS_MAX_OCTAVE = 4; // MIDI 48 (standard C3)

export const MELODY_DEFAULT_OCTAVE = 5; // MIDI 60 (standard C4 / middle C)
export const MELODY_MIN_OCTAVE = 4; // MIDI 48 (standard C3)
export const MELODY_MAX_OCTAVE = 6; // MIDI 72 (standard C5)

export const CHORD_OCTAVE = 4; // MIDI 48 (standard C3)

// Default scale (C Major)
export const DEFAULT_SCALE_ROOT = 0; // C
export const DEFAULT_SCALE_TYPE = "major";
