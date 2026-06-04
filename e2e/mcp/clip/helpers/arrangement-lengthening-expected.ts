// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Expected clip data for arrangement lengthening e2e tests (tracks 0-23).
 * Snapshot from manually verified results after lengthening all clips to 4bar.
 *
 * `arrangementLength` uses the unified duration grammar (`Nbar`, `n<fraction>`,
 * `Nbar+n<fraction>`). `arrangementStart`/`start`/`end` stay bar|beat positions.
 */

export interface ExpectedClip {
  arrangementStart: string;
  arrangementLength: string;
  start: string;
  end: string;
}

/** Convert compact [arrangementStart, arrangementLength, start, end] tuples */
function c(tuples: [string, string, string, string][]): ExpectedClip[] {
  return tuples.map(([arrangementStart, arrangementLength, start, end]) => ({
    arrangementStart,
    arrangementLength,
    start,
    end,
  }));
}

// prettier-ignore
const midiLooped: Record<number, ExpectedClip[]> = {
  0: c([["1|1","1bar","1|1","2|1"],["2|1","1bar","1|1","2|1"],["3|1","1bar","1|1","2|1"],["4|1","1bar","1|1","2|1"]]),
  1: c([["1|1","n3/4","1|1","1|4"],["1|4","n3/4","1|1","1|4"],["2|3","n3/4","1|1","1|4"],["3|2","n3/4","1|1","1|4"],["4|1","n3/4","1|1","1|4"],["4|4","n/4","1|1","1|4"]]),
  2: c([["1|1","n3/4","1|1","2|1"],["1|4","n3/4","1|1","2|1"],["2|3","n3/4","1|1","2|1"],["3|2","n3/4","1|1","2|1"],["4|1","n3/4","1|1","2|1"],["4|4","n/4","1|1","2|1"]]),
  3: c([["1|1","n3/4","1|1","2|1"],["1|4","n3/4","1|1","2|1"],["2|3","n3/4","1|1","2|1"],["3|2","n3/4","1|1","2|1"],["4|1","n3/4","1|1","2|1"],["4|4","n/4","1|1","2|1"]]),
  4: c([["1|1","n/2","1|1","1|4"],["1|3","n/2","1|1","1|4"],["2|1","n/2","1|1","1|4"],["2|3","n/2","1|1","1|4"],["3|1","n/2","1|1","1|4"],["3|3","n/2","1|1","1|4"],["4|1","n/2","1|1","1|4"],["4|3","n/2","1|1","1|4"]]),
  5: c([["1|1","n3/4","1|1","2|1"],["1|4","n3/4","1|1","2|1"],["2|3","n3/4","1|1","2|1"],["3|2","n3/4","1|1","2|1"],["4|1","n3/4","1|1","2|1"],["4|4","n/4","1|1","2|1"]]),
  6: c([["1|1","1bar","1|2","2|1"],["2|1","1bar","1|2","2|1"],["3|1","1bar","1|2","2|1"],["4|1","1bar","1|2","2|1"]]),
  7: c([["1|1","n3/4","1|2","1|4"],["1|4","n3/4","1|2","1|4"],["2|3","n3/4","1|2","1|4"],["3|2","n3/4","1|2","1|4"],["4|1","n3/4","1|2","1|4"],["4|4","n/4","1|2","1|4"]]),
  8: c([["1|1","n3/4","1|2","2|1"],["1|4","n3/4","1|2","2|1"],["2|3","n3/4","1|2","2|1"],["3|2","n3/4","1|2","2|1"],["4|1","n3/4","1|2","2|1"],["4|4","n/4","1|2","2|1"]]),
};

// Tracks 9-14 (unlooped MIDI) use loop_end to extend in place. Single clip, no
// tiles. end_marker is extended so notes are visible in the full 4-bar region.
// prettier-ignore
const midiUnlooped: Record<number, ExpectedClip[]> = {
  9:  c([["1|1","4bar","1|1","5|1"]]),
  10: c([["1|1","4bar","1|1","5|1"]]),
  11: c([["1|1","4bar","1|2","5|2"]]),
  12: c([["1|1","4bar","1|2","5|2"]]),
  13: c([["1|1","4bar","1|1","5|1"]]),
  14: c([["1|1","4bar","1|1","5|1"]]),
};

// prettier-ignore
const audioLoopedWarped: Record<number, ExpectedClip[]> = {
  15: c([["1|1","2bar","1|1","3|1"],["3|1","2bar","1|1","3|1"]]),
  16: c([["1|1","2bar","1|1","3|1"],["3|1","2bar","1|1","3|1"]]),
  17: c([["1|1","1bar+n/4","1|1","3|1"],["2|2","1bar+n/4","1|1","3|1"],["3|3","1bar+n/4","1|1","3|1"],["4|4","n/4","1|1","3|1"]]),
  18: c([["1|1","1bar+n3/4","1|1","3|1"],["2|4","1bar+n3/4","1|1","3|1"],["4|3","n/2","1|1","3|1"]]),
  19: c([["1|1","1bar+n3/4","1|1","3|1"],["2|4","1bar+n3/4","1|1","3|1"],["4|3","n/2","1|1","3|1"]]),
  20: c([["1|1","1bar+n/4","1|1","3|1"],["2|2","1bar+n/4","1|1","3|1"],["3|3","1bar+n/4","1|1","3|1"],["4|4","n/4","1|1","3|1"]]),
  21: c([["1|1","2bar","1|2","3|1"],["3|1","2bar","1|2","3|1"]]),
  22: c([["1|1","2bar","1|2","3|1"],["3|1","2bar","1|2","3|1"]]),
  23: c([["1|1","1bar+n/4","1|2","3|1"],["2|2","1bar+n/4","1|2","3|1"],["3|3","1bar+n/4","1|2","3|1"],["4|4","n/4","1|2","3|1"]]),
};

// Tracks 24-29 (unlooped warped audio) have insufficient file content for the
// 4-bar target. No-hidden tracks (24,26,28) skip entirely; hidden-content
// tracks (25,27,29) cap to file boundary via loop_end (single clip, no tiles).
// prettier-ignore
const audioUnloopedWarped: Record<number, ExpectedClip[]> = {
  24: c([["1|1","2bar","1|1","3|1"]]),
  25: c([["1|1","2bar","1|1","3|1"]]),
  26: c([["1|1","2bar","1|1","3|1"]]),
  27: c([["1|1","2bar","1|1","3|1"]]),
  28: c([["1|1","1bar+n3/4","1|2","3|1"]]),
  29: c([["1|1","1bar+n3/4","1|2","3|1"]]),
};

// Tracks 30-35 (unwarped audio) use loop_end to extend. Ableton auto-clamps at
// file boundary. No-hidden tracks stay unchanged; hidden-content tracks extend
// to the file's natural sample length. All produce a single clip (no tiles).
// Live 12.4 changed end_marker to clamp at file content boundary (2|1.8 for
// the 4.8s sample); previous Live versions allowed end_marker beyond content.
// These sample-derived lengths land exactly on the note-value grid: 1.6 beats =
// 2/5 of a whole note (n2/5), 0.4 beats = 1/10 (n/10). Verified against Live 12.4
// on 2026-05-29 (npm run e2e:mcp -- ppal-update-clip-arrangement-lengthening,
// 36/36). If a future sample is off-grid the serializer would emit bare beats
// (e.g. "9.6") and the failure message prints the exact string to paste in.
// prettier-ignore
const audioUnwarped: Record<number, ExpectedClip[]> = {
  30: c([["1|1","2bar+n2/5","1|1","2|1.8"]]),
  31: c([["1|1","2bar+n2/5","1|1","2|1.8"]]),
  32: c([["1|1","2bar+n2/5","1|1","2|1.8"]]),
  33: c([["1|1","2bar+n2/5","1|1","2|1.8"]]),
  34: c([["1|1","2bar+n/10","1|1.6","2|1.8"]]),
  35: c([["1|1","2bar+n/10","1|1.6","2|1.8"]]),
};

/** Expected clips after lengthening to 4bar, indexed by track number */
export const expectedLengtheningClips: Record<number, ExpectedClip[]> = {
  ...midiLooped,
  ...midiUnlooped,
  ...audioLoopedWarped,
  ...audioUnloopedWarped,
  ...audioUnwarped,
};
