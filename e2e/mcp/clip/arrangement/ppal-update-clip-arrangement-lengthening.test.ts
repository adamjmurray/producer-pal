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
import {
  type ExpectedClip,
  expectedLengtheningClips,
} from "../helpers/arrangement-lengthening-expected.ts";
import {
  ARRANGEMENT_CLIP_TESTS_PATH,
  assertLengthenedInPlace,
  assertLengthenedToFullLength,
  type LengthenResult,
  testLengthenClipTo4Bars,
} from "../helpers/arrangement-lengthening-test-helpers.ts";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({
  once: true,
  liveSetPath: ARRANGEMENT_CLIP_TESTS_PATH,
});

/**
 * Lengthen one track's clip to 4 bars and assert its family's outcome. Every
 * family runs this same workflow and differs only in the track type it must
 * report and which outcome is correct for it — that is what `assert` selects.
 * @param track - Track index holding the clip under test
 * @param trackType - Track type the case must report
 * @param assert - The family's outcome assertion
 * @param sleepMs - Settle time after the lengthen (default 100)
 */
async function expectLengthenedTo4Bars(
  track: number,
  trackType: "midi" | "audio",
  assert: (result: LengthenResult, expected: ExpectedClip[]) => void,
  sleepMs?: number,
): Promise<void> {
  const result = await testLengthenClipTo4Bars(ctx.client!, track, { sleepMs });

  expect(result.trackType).toBe(trackType);
  assert(result, expectedLengtheningClips[track]!);
}

/** Assert a single clip extended in place (same ID, no tiles), with warnings. */
const assertInPlaceWarned = (
  result: LengthenResult,
  expected: ExpectedClip[],
): void => assertLengthenedInPlace(result, expected, true);

describe("MIDI Looped Clips Lengthening (t0-t8)", () => {
  it.each(midiLoopedTestCases)("lengthens t$track: $name", ({ track }) =>
    expectLengthenedTo4Bars(track, "midi", assertLengthenedToFullLength),
  );
});

describe("MIDI Unlooped Clips Lengthening (t9-t14)", () => {
  // Extends cleanly via loop_end — the one family that must NOT warn.
  it.each(midiUnloopedTestCases)("lengthens t$track: $name", ({ track }) =>
    expectLengthenedTo4Bars(track, "midi", (result, expected) =>
      assertLengthenedInPlace(result, expected, false),
    ),
  );
});

describe("Audio Looped Warped Clips Lengthening (t15-t23)", () => {
  it.each(audioLoopedWarpedTestCases)("lengthens t$track: $name", ({ track }) =>
    expectLengthenedTo4Bars(track, "audio", assertLengthenedToFullLength),
  );
});

describe("Audio Unlooped Warped Clips - No Hidden Content (t24,t26,t28)", () => {
  // Lengthening skipped — no additional file content to reveal.
  it.each(audioUnloopedWarpedNoHiddenCases)(
    "skips lengthening t$track: $name (no additional content)",
    ({ track }) => expectLengthenedTo4Bars(track, "audio", assertInPlaceWarned),
  );
});

describe("Audio Unlooped Warped Clips - Hidden Content (t25,t27,t29)", () => {
  // Capped at the file content boundary — can't reach the 4-bar target.
  it.each(audioUnloopedWarpedHiddenCases)(
    "caps lengthening t$track: $name (extends to file boundary)",
    ({ track }) => expectLengthenedTo4Bars(track, "audio", assertInPlaceWarned),
  );
});

describe("Audio Unwarped Clips Lengthening (t30-t35)", () => {
  // Every clip warns: no-hidden clips "no additional content",
  // hidden-content clips "capped at file boundary".
  it.each(audioUnwarpedTestCases)(
    "lengthens t$track: $name (capped at file boundary via loop_end)",
    ({ track }) =>
      expectLengthenedTo4Bars(track, "audio", assertInPlaceWarned, 200),
  );
});
