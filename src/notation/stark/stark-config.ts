// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Configuration constants for Stark notation: a literal, round-trippable music
 * notation. Stark reuses abstark's pitched (bass/melody/chords) model and all of
 * its constants (velocity buckets, register defaults, {@link durationBeats},
 * drum-name map) via direct import — see stark-interpreter.ts / stark-serializer.ts.
 * The only stark-specific constant is the drum line default duration below; stark
 * drums are event-based (like a melody line of drum hits), unlike abstark's
 * positional 16th-note drum grid.
 */

/**
 * Default drum-line note value when neither a token nor the line header supplies
 * a /N: /4 (a quarter note), matching bass/melody. A bare `kick: X X X X` is four
 * quarter-note hits = one 4/4 bar.
 */
export const DRUM_DEFAULT_N = 4;
