// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement clip lengthening operations.
 * Uses: arrangement-clip-tests - comprehensive arrangement clip edge cases
 * See: e2e/live-sets/arrangement-clip-tests-spec.md
 */
import { describe, expect, it } from "vitest";
import {
  audioLoopedWarpedTestCases,
  audioUnloopedWarpedTestCases,
  audioUnwarpedTestCases,
  midiLoopedTestCases,
  midiUnloopedTestCases,
} from "./arrangement-clip-test-cases.ts";
import {
  ARRANGEMENT_CLIP_TESTS_PATH,
  calculateTotalLengthInBars,
  EPSILON,
  testLengthenClipTo4Bars,
} from "./arrangement-lengthening-test-helpers.ts";
import { setupMcpTestContext } from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({
  once: true,
  liveSetPath: ARRANGEMENT_CLIP_TESTS_PATH,
});

describe("MIDI Looped Clips Lengthening (t0-t8)", () => {
  it.each(midiLoopedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const { resultClips, warnings } = await testLengthenClipTo4Bars(
        ctx.client!,
        track,
      );

      expect(resultClips.length).toBeGreaterThanOrEqual(1);
      expect(resultClips.every((c) => c.type === "midi")).toBe(true);
      expect(warnings).toHaveLength(0);

      const totalLength = calculateTotalLengthInBars(resultClips);

      expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
    },
  );
});

describe("MIDI Unlooped Clips Lengthening (t9-t14)", () => {
  it.each(midiUnloopedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const { resultClips, warnings } = await testLengthenClipTo4Bars(
        ctx.client!,
        track,
      );

      expect(resultClips.length).toBeGreaterThanOrEqual(1);
      expect(resultClips.every((c) => c.type === "midi")).toBe(true);
      expect(warnings).toHaveLength(0);

      const totalLength = calculateTotalLengthInBars(resultClips);

      expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
    },
  );
});

describe("Audio Looped Warped Clips Lengthening (t15-t23)", () => {
  it.each(audioLoopedWarpedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const { resultClips, warnings } = await testLengthenClipTo4Bars(
        ctx.client!,
        track,
      );

      expect(resultClips.length).toBeGreaterThanOrEqual(1);
      expect(resultClips.every((c) => c.type === "audio")).toBe(true);
      expect(warnings).toHaveLength(0);

      const totalLength = calculateTotalLengthInBars(resultClips);

      expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
    },
  );
});

describe("Audio Unlooped Warped Clips Lengthening (t24-t29)", () => {
  it.each(audioUnloopedWarpedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const { resultClips, warnings } = await testLengthenClipTo4Bars(
        ctx.client!,
        track,
      );

      expect(resultClips.length).toBeGreaterThanOrEqual(1);
      expect(resultClips.every((c) => c.type === "audio")).toBe(true);
      expect(warnings).toHaveLength(0);

      const totalLength = calculateTotalLengthInBars(resultClips);

      expect(totalLength).toBeGreaterThanOrEqual(4 - EPSILON);
    },
  );
});

describe("Audio Unwarped Clips Lengthening (t30-t35)", () => {
  it.each(audioUnwarpedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
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
    },
  );
});
