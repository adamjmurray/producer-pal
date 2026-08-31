// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Which timeline split positions are read on: `arrangementSplit` measures them
 * on the song timeline, the deprecated `split` from each clip's own start.
 * Every other splitting test uses a clip at song position 0, where the two
 * coordinate systems coincide and can't tell each other apart.
 */
import { describe, expect, it } from "vitest";
import {
  ARRANGEMENT_SPLIT_MODE,
  LEGACY_SPLIT_MODE,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  setupSplittingClipGetMock,
  setupSplitTest,
} from "../helpers/arrangement-splitting-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const HOLDING_AREA = {} as const;

/**
 * A 16-beat clip starting at song beat 16 — song bars 5 through 9, so a
 * position reads 4 bars apart in the two coordinate systems.
 */
const CLIP_AT_BAR_5 = {
  looping: true,
  startTime: 16.0,
  endTime: 32.0,
  loopEnd: 4.0,
} as const;

/** Song beat 24 = bar 7, which is 8 beats into a clip that starts at bar 5. */
const SONG_BEAT_24 = 24;

/** 8 beats: bar 3 read on the song timeline, bar 3 of the clip read from it. */
const BEAT_8 = 8;

/**
 * The right-trim that vacates everything after the first segment. Its position
 * is where the cut landed on the song timeline, and its length is what followed.
 */
function expectCutAtSongBeat(
  trackMock: { call: { mock: { calls: unknown[][] } } },
  position: number,
  remainingLength: number,
): void {
  const trims = trackMock.call.mock.calls.filter(
    ([method]) => method === "create_midi_clip",
  );

  expect(trims).toContainEqual(["create_midi_clip", position, remainingLength]);
}

describe("split position coordinates", () => {
  it("reads arrangementSplit positions on the song timeline", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    performSplitting(
      [mockClip],
      [SONG_BEAT_24],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    // 8 beats into the clip, leaving 8 beats after the cut.
    expectCutAtSongBeat(callState.trackMock, SONG_BEAT_24, 8);
  });

  it("reads deprecated split positions from the clip's own start", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // The same physical cut as the test above, from a different number: 8 beats
    // in from the clip's start rather than song beat 24.
    performSplitting(
      [mockClip],
      [BEAT_8],
      clips,
      HOLDING_AREA,
      LEGACY_SPLIT_MODE,
    );

    expectCutAtSongBeat(callState.trackMock, SONG_BEAT_24, 8);
  });

  it("skips a song position that falls outside the clip, naming its span", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // Song beat 8 is bar 3 — before this clip starts. Under the old reading it
    // would have cut 2 bars in, which is the confusion the rename fixes.
    performSplitting(
      [mockClip],
      [BEAT_8],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("arrangementSplit cut nothing"),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("clip_1 (5|1 to 9|1)"),
    );
  });

  it("skips a clip-relative position past the clip's end", () => {
    const { callState, mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // 24 beats in overruns a 16-beat clip. Same number as the song-timeline
    // test, opposite outcome.
    performSplitting(
      [mockClip],
      [SONG_BEAT_24],
      clips,
      HOLDING_AREA,
      LEGACY_SPLIT_MODE,
    );

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("split cut nothing"),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("clip_1 (1|1 to 5|1)"),
    );
  });

  // One call cutting several clips at one song position is what the param is
  // for, so the clips that position misses are the expected case. Warning per
  // miss spends the model's context saying the tool worked.
  it("stays quiet about clips the position misses when another one was cut", () => {
    const { mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // A second clip on the same track, nowhere near the cut at song beat 24.
    registerMockObject("clip_2", {
      path: livePath.track(0).arrangementClip(1),
      type: "Clip",
      properties: { track_index: 0 },
    });
    setupSplittingClipGetMock("clip_2", { startTime: 100, endTime: 116 });

    const missedClip = LiveAPI.from("id clip_2");

    performSplitting(
      [mockClip, missedClip],
      [SONG_BEAT_24],
      [...clips, missedClip],
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("cut nothing"),
    );
  });

  // But a position that cut nothing ANYWHERE is a different story: the cut the
  // other position made returns a result that reads like the call worked.
  it("names a position that landed in no clip, even when another one cut", () => {
    const { mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // Song beat 24 falls inside the clip; beat 200 is far past its end.
    performSplitting(
      [mockClip],
      [SONG_BEAT_24, 200],
      clips,
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("arrangementSplit cut nothing at 51|1"),
    );
  });

  // Clip-relative positions get their own explanation, and several of them are
  // "them", not "it".
  it("names every clip-relative position that landed in no clip", () => {
    const { mockClip, clips } = setupSplitTest(CLIP_AT_BAR_5);

    // 8 beats into a 16-beat clip cuts; 100 and 200 are far past its end.
    performSplitting(
      [mockClip],
      [8, 100, 200],
      clips,
      HOLDING_AREA,
      LEGACY_SPLIT_MODE,
    );

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "positions are relative to each clip's start, and no clip is long enough for them",
      ),
    );
  });
});
