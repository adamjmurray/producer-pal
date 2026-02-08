// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement clip lengthening operations.
 * Uses: arrangement-clip-tests - comprehensive arrangement clip edge cases
 * See: e2e/live-sets/arrangement-clip-tests-spec.md
 */
import { beforeAll, describe, expect, it } from "vitest";
import { openLiveSet } from "#evals/eval/open-live-set.ts";
import { setupMcpTestContext } from "../mcp-test-helpers.ts";
import {
  ARRANGEMENT_CLIP_TESTS_PATH,
  calculateTotalLengthInBars,
  EPSILON,
  testLengthenClipTo4Bars,
} from "./arrangement-lengthening-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

// Override openLiveSet to use arrangement-clip-tests
beforeAll(async () => {
  await openLiveSet(ARRANGEMENT_CLIP_TESTS_PATH);
});

describe("MIDI Looped Clips Lengthening (t0-t8)", () => {
  const testCases = [
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

  it.each(testCases)("lengthens t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testLengthenClipTo4Bars(
      ctx.client!,
      track,
    );

    expect(resultClips.length).toBeGreaterThanOrEqual(1);
    expect(resultClips.every((c) => c.type === "midi")).toBe(true);
    expect(warnings).toHaveLength(0);

    const totalLength = calculateTotalLengthInBars(resultClips);

    expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
  });
});

describe("MIDI Unlooped Clips Lengthening (t9-t14)", () => {
  const testCases = [
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

  it.each(testCases)("lengthens t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testLengthenClipTo4Bars(
      ctx.client!,
      track,
    );

    expect(resultClips.length).toBeGreaterThanOrEqual(1);
    expect(resultClips.every((c) => c.type === "midi")).toBe(true);
    expect(warnings).toHaveLength(0);

    const totalLength = calculateTotalLengthInBars(resultClips);

    expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
  });
});

describe("Audio Looped Warped Clips Lengthening (t15-t23)", () => {
  const testCases = [
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

  it.each(testCases)("lengthens t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testLengthenClipTo4Bars(
      ctx.client!,
      track,
    );

    expect(resultClips.length).toBeGreaterThanOrEqual(1);
    expect(resultClips.every((c) => c.type === "audio")).toBe(true);
    expect(warnings).toHaveLength(0);

    const totalLength = calculateTotalLengthInBars(resultClips);

    expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
  });
});

describe("Audio Unlooped Warped Clips Lengthening (t24-t29)", () => {
  const testCases = [
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

  it.each(testCases)("lengthens t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testLengthenClipTo4Bars(
      ctx.client!,
      track,
    );

    expect(resultClips.length).toBeGreaterThanOrEqual(1);
    expect(resultClips.every((c) => c.type === "audio")).toBe(true);
    expect(warnings).toHaveLength(0);

    const totalLength = calculateTotalLengthInBars(resultClips);

    expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
  });
});

describe("Audio Unwarped Clips Lengthening (t30-t35)", () => {
  const testCases = [
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

  it.each(testCases)("lengthens t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testLengthenClipTo4Bars(
      ctx.client!,
      track,
      { sleepMs: 200 },
    );

    expect(resultClips.length).toBeGreaterThanOrEqual(1);
    expect(resultClips.every((c) => c.type === "audio")).toBe(true);

    // EXPECT WARNING for unwarped audio
    expect(warnings.length).toBeGreaterThan(0);
    expect(
      warnings.some((w) => w.includes("Extending unwarped audio clip")),
    ).toBe(true);

    const totalLength = calculateTotalLengthInBars(resultClips);

    expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
  });
});
