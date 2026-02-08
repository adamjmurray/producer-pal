// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement clip splitting operations.
 * Uses: arrangement-clip-tests - comprehensive arrangement clip edge cases
 * See: e2e/live-sets/arrangement-clip-tests-spec.md
 */
import { beforeAll, describe, expect, it } from "vitest";
import { openLiveSet } from "#evals/eval/open-live-set.ts";
import {
  audioLoopedWarpedTestCases,
  audioUnloopedWarpedTestCases,
  audioUnwarpedTestCases,
  midiLoopedTestCases,
  midiUnloopedTestCases,
} from "./arrangement-clip-test-cases.ts";
import { ARRANGEMENT_CLIP_TESTS_PATH } from "./arrangement-lengthening-test-helpers.ts";
import {
  assertContiguousClips,
  testSplitClip,
} from "./arrangement-splitting-test-helpers.ts";
import { setupMcpTestContext } from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

// Override openLiveSet to use arrangement-clip-tests
beforeAll(async () => {
  await openLiveSet(ARRANGEMENT_CLIP_TESTS_PATH);
});

describe("MIDI Looped Clips Splitting (t0-t8)", () => {
  it.each(midiLoopedTestCases)("splits t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testSplitClip(ctx.client!, track);

    expect(resultClips.length).toBe(2);
    expect(resultClips.every((c) => c.type === "midi")).toBe(true);
    expect(warnings).toHaveLength(0);

    assertContiguousClips(resultClips);
  });
});

describe("MIDI Unlooped Clips Splitting (t9-t14)", () => {
  it.each(midiUnloopedTestCases)("splits t$track: $name", async ({ track }) => {
    const { resultClips, warnings } = await testSplitClip(ctx.client!, track);

    expect(resultClips.length).toBe(2);
    expect(resultClips.every((c) => c.type === "midi")).toBe(true);
    expect(warnings).toHaveLength(0);

    assertContiguousClips(resultClips);
  });
});

describe("Audio Looped Warped Clips Splitting (t15-t23)", () => {
  it.each(audioLoopedWarpedTestCases)(
    "splits t$track: $name",
    async ({ track }) => {
      const { resultClips, warnings } = await testSplitClip(ctx.client!, track);

      expect(resultClips.length).toBe(2);
      expect(resultClips.every((c) => c.type === "audio")).toBe(true);
      expect(warnings).toHaveLength(0);

      assertContiguousClips(resultClips);
    },
  );
});

describe("Audio Unlooped Warped Clips Splitting (t24-t29)", () => {
  it.each(audioUnloopedWarpedTestCases)(
    "splits t$track: $name",
    async ({ track }) => {
      const { resultClips, warnings } = await testSplitClip(ctx.client!, track);

      expect(resultClips.length).toBe(2);
      expect(resultClips.every((c) => c.type === "audio")).toBe(true);
      expect(warnings).toHaveLength(0);

      assertContiguousClips(resultClips);
    },
  );
});

describe("Audio Unwarped Clips Splitting (t30-t35)", () => {
  it.each(audioUnwarpedTestCases)(
    "splits t$track: $name",
    async ({ track }) => {
      const { resultClips } = await testSplitClip(ctx.client!, track, {
        sleepMs: 200,
      });

      expect(resultClips.length).toBe(2);
      expect(resultClips.every((c) => c.type === "audio")).toBe(true);

      assertContiguousClips(resultClips);
    },
  );
});
