// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared test case definitions for arrangement clip e2e tests.
 * Used by both lengthening and splitting test files.
 * See: e2e/live-sets/arrangement-clip-tests-spec.md
 */

export interface ArrangementClipTestCase {
  track: number;
  name: string;
}

export const midiLoopedTestCases: ArrangementClipTestCase[] = [
  { track: 0, name: "1. MIDI - Looped (1:0 clip, 1:0 arr)" },
  { track: 1, name: "2. MIDI - Looped (0:3 clip, 1:0 arr)" },
  { track: 2, name: "3. MIDI - Looped (1:0 clip, 0:3 arr)" },
  { track: 3, name: "4. MIDI - Looped (1:0 clip, 1:0 arr, offset)" },
  { track: 4, name: "5. MIDI - Looped (0:3 clip, 1:0 arr, offset)" },
  { track: 5, name: "6. MIDI - Looped (1:0 clip, 0:3 arr, offset)" },
  {
    track: 6,
    name: "7. MIDI - Looped (0:3 clip, 1:0 arr, start > firstStart)",
  },
  {
    track: 7,
    name: "8. MIDI - Looped (0:2 clip, 1:0 arr, start > firstStart)",
  },
  {
    track: 8,
    name: "9. MIDI - Looped (0:3 clip, 0:3 arr, start > firstStart)",
  },
];

export const midiUnloopedTestCases: ArrangementClipTestCase[] = [
  { track: 9, name: "1. MIDI - Unlooped (1:0 clip, 1:0 arr)" },
  {
    track: 10,
    name: "2. MIDI - Unlooped (0:3 clip, 0:3 arr, hidden content)",
  },
  {
    track: 11,
    name: "3. MIDI - Unlooped (0:3 clip, 0:3 arr, content before start)",
  },
  {
    track: 12,
    name: "4. MIDI - Unlooped (0:2 clip, 0:2 arr, hidden + offset)",
  },
  {
    track: 13,
    name: "5. MIDI - Unlooped (1:0 clip, 1:0 arr, start > firstStart)",
  },
  {
    track: 14,
    name: "6. MIDI - Unlooped (0:3 clip, 0:3 arr, hidden + start > firstStart)",
  },
];

export const audioLoopedWarpedTestCases: ArrangementClipTestCase[] = [
  { track: 15, name: "1. Audio - Looped (2:0 clip, 2:0 arr)" },
  { track: 16, name: "2. Audio - Looped (2:0 clip, 2:1 arr)" },
  { track: 17, name: "3. Audio - Looped (2:0 clip, 1:1 arr)" },
  { track: 18, name: "4. Audio - Looped (2:0 clip, 2:0 arr, offset)" },
  { track: 19, name: "5. Audio - Looped (2:0 clip, 2:1 arr, offset)" },
  { track: 20, name: "6. Audio - Looped (2:0 clip, 1:1 arr, offset)" },
  {
    track: 21,
    name: "7. Audio - Looped (1:3 clip, 2:0 arr, start > firstStart)",
  },
  {
    track: 22,
    name: "8. Audio - Looped (1:3 clip, 2:1 arr, start > firstStart)",
  },
  {
    track: 23,
    name: "9. Audio - Looped (1:3 clip, 1:1 arr, start > firstStart)",
  },
];

export const audioUnloopedWarpedTestCases: ArrangementClipTestCase[] = [
  { track: 24, name: "1. Audio - Unlooped (2:0 clip, 2:0 arr)" },
  {
    track: 25,
    name: "2. Audio - Unlooped (1:1 clip, 1:1 arr, hidden content)",
  },
  {
    track: 26,
    name: "4. Audio - Unlooped (2:0 clip, 2:0 arr, content before start)",
  },
  {
    track: 27,
    name: "5. Audio - Unlooped (1:1 clip, 1:1 arr, hidden + offset)",
  },
  {
    track: 28,
    name: "7. Audio - Unlooped (1:3 clip, 1:3 arr, start > firstStart)",
  },
  {
    track: 29,
    name: "8. Audio - Unlooped (1:0 clip, 1:0 arr, hidden + start > firstStart)",
  },
];

/** Unlooped warped audio clips with no hidden content (all file content visible) */
export const audioUnloopedWarpedNoHiddenCases: ArrangementClipTestCase[] = [
  { track: 24, name: "1. Audio - Unlooped (2:0 clip, 2:0 arr)" },
  {
    track: 26,
    name: "4. Audio - Unlooped (2:0 clip, 2:0 arr, content before start)",
  },
  {
    track: 28,
    name: "7. Audio - Unlooped (1:3 clip, 1:3 arr, start > firstStart)",
  },
];

/** Unlooped warped audio clips with hidden content (file has more than shown) */
export const audioUnloopedWarpedHiddenCases: ArrangementClipTestCase[] = [
  {
    track: 25,
    name: "2. Audio - Unlooped (1:1 clip, 1:1 arr, hidden content)",
  },
  {
    track: 27,
    name: "5. Audio - Unlooped (1:1 clip, 1:1 arr, hidden + offset)",
  },
  {
    track: 29,
    name: "8. Audio - Unlooped (1:0 clip, 1:0 arr, hidden + start > firstStart)",
  },
];

export const audioUnwarpedTestCases: ArrangementClipTestCase[] = [
  { track: 30, name: "1. Audio - Unwarped (2:0 clip, 2:1.6 arr)" },
  {
    track: 31,
    name: "2. Audio - Unwarped (1:1 clip, 1:1 arr, hidden content)",
  },
  {
    track: 32,
    name: "4. Audio - Unwarped (2:0 clip, 2:1.6 arr, content before start)",
  },
  {
    track: 33,
    name: "5. Audio - Unwarped (1:1 clip, 1:1 arr, hidden + offset)",
  },
  {
    track: 34,
    name: "7. Audio - Unwarped (1:3.4 clip, 2:0.4 arr, start > firstStart)",
  },
  {
    track: 35,
    name: "8. Audio - Unwarped (1:0.4 clip, 1:0 arr, hidden + start > firstStart)",
  },
];
