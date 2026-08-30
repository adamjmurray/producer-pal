// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Track indexes in the shared e2e-test-set Live Set. Import these instead of
 * writing the number again — the Set's layout is described once, in
 * e2e/live-sets/e2e-test-set-spec.md.
 */

/** t8 "9-MIDI": no clips, no devices, No Output. The scratch track. */
export const EMPTY_MIDI_TRACK = 8;

/** t5 "Audio 2": one unwarped session clip in s0, s1-s7 and the arrangement free. */
export const AUDIO_TRACK = 5;

/** t7 "Racks": nested instrument racks for deep device paths. No clips. */
export const RACKS_TRACK = 7;

/** t10 "Child": a MIDI track inside the t9 "Parent" group. No clips. */
export const CHILD_TRACK = 10;
