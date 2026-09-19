// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Fixtures the MCP e2e suites share: the Live Sets they open, the default Set's
// track indexes, and the sample files tests load. Import these instead of
// writing the value again; each Set's layout is in e2e/live-sets/*-spec.md.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Opened before each test unless a suite names another Set. */
export const LIVE_SET_PATH =
  "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/** Nested racks, macro-mapped params, rack return chains. */
export const RACKS_TEST_PATH =
  "e2e/live-sets/racks-test Project/racks-test.als";

/** t8 "9-MIDI": no clips, no devices, No Output. The scratch track. */
export const EMPTY_MIDI_TRACK = 8;

/** t5 "Audio 2": one unwarped session clip in s0, s1-s7 and the arrangement free. */
export const AUDIO_TRACK = 5;

/** t7 "Racks": nested instrument racks for deep device paths. No clips. */
export const RACKS_TRACK = 7;

/** t10 "Child": a MIDI track inside the t9 "Parent" group. No clips. */
export const CHILD_TRACK = 10;

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SAMPLE_FILE = resolve(
  __dirname,
  "../live-sets/samples/sample.aiff",
);

export const KICK_FILE = resolve(
  __dirname,
  "../live-sets/samples/drums/kick.aiff",
);

/** One bar of 4/4 at 108 BPM, the test Set's tempo. SAMPLE_FILE is shorter. */
export const DRUM_LOOP_FILE = resolve(
  __dirname,
  "../live-sets/samples/drum-loop-1bar.wav",
);

/** Eight bars of 4/4 at 96 BPM, for multi-bar regions in arrangement-sections. */
export const DRUM_LOOP_8BAR_FILE = resolve(
  __dirname,
  "../live-sets/samples/drum-loop-8bar.wav",
);
