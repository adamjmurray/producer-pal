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
  audioUnloopedWarpedHiddenCases,
  audioUnloopedWarpedNoHiddenCases,
  audioUnwarpedTestCases,
  midiLoopedTestCases,
  midiUnloopedTestCases,
} from "../helpers/arrangement-clip-test-cases.ts";
import { expectedLengtheningClips } from "../helpers/arrangement-lengthening-expected.ts";
import {
  ARRANGEMENT_CLIP_TESTS_PATH,
  assertLengthenedInPlace,
  assertLengthenedToFullLength,
  testLengthenClipTo4Bars,
} from "../helpers/arrangement-lengthening-test-helpers.ts";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({
  once: true,
  liveSetPath: ARRANGEMENT_CLIP_TESTS_PATH,
});

describe("MIDI Looped Clips Lengthening (t0-t8)", () => {
  it.each(midiLoopedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const result = await testLengthenClipTo4Bars(ctx.client!, track);

      expect(result.trackType).toBe("midi");
      assertLengthenedToFullLength(result, expectedLengtheningClips[track]!);
    },
  );
});

describe("MIDI Unlooped Clips Lengthening (t9-t14)", () => {
  it.each(midiUnloopedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const result = await testLengthenClipTo4Bars(ctx.client!, track);

      expect(result.trackType).toBe("midi");
      // Single clip extended in place via loop_end (same ID, no tiles)
      assertLengthenedInPlace(result, expectedLengtheningClips[track]!, false);
    },
  );
});

describe("Audio Looped Warped Clips Lengthening (t15-t23)", () => {
  it.each(audioLoopedWarpedTestCases)(
    "lengthens t$track: $name",
    async ({ track }) => {
      const result = await testLengthenClipTo4Bars(ctx.client!, track);

      expect(result.trackType).toBe("audio");
      assertLengthenedToFullLength(result, expectedLengtheningClips[track]!);
    },
  );
});

describe("Audio Unlooped Warped Clips - No Hidden Content (t24,t26,t28)", () => {
  it.each(audioUnloopedWarpedNoHiddenCases)(
    "skips lengthening t$track: $name (no additional content)",
    async ({ track }) => {
      const result = await testLengthenClipTo4Bars(ctx.client!, track);

      expect(result.trackType).toBe("audio");
      // Lengthening skipped — no additional file content to reveal;
      // original clip unchanged (same ID, no tiles)
      assertLengthenedInPlace(result, expectedLengtheningClips[track]!, true);
    },
  );
});

describe("Audio Unlooped Warped Clips - Hidden Content (t25,t27,t29)", () => {
  it.each(audioUnloopedWarpedHiddenCases)(
    "caps lengthening t$track: $name (extends to file boundary)",
    async ({ track }) => {
      const result = await testLengthenClipTo4Bars(ctx.client!, track);

      expect(result.trackType).toBe("audio");
      // Capped at file content boundary — can't reach 4-bar target;
      // single clip extended in place via loop_end (same ID, no tiles)
      assertLengthenedInPlace(result, expectedLengtheningClips[track]!, true);
    },
  );
});

describe("Audio Unwarped Clips Lengthening (t30-t35)", () => {
  it.each(audioUnwarpedTestCases)(
    "lengthens t$track: $name (capped at file boundary via loop_end)",
    async ({ track }) => {
      const result = await testLengthenClipTo4Bars(ctx.client!, track, {
        sleepMs: 200,
      });

      expect(result.trackType).toBe("audio");
      // All clips warn: no-hidden clips warn "no additional content",
      // hidden-content clips warn "capped at file boundary";
      // single clip extended in place via loop_end (same ID, no tiles)
      assertLengthenedInPlace(result, expectedLengtheningClips[track]!, true);
    },
  );
});
