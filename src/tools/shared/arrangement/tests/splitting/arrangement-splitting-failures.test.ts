// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  addArrangementClip,
  overrideWithDuplicateCounter,
  setupClipSplittingMocks,
  setupSplittingClipGetMock,
  throwOnNthDuplicate,
  type SplittingClipProps,
} from "../helpers/arrangement-splitting-test-helpers.ts";

const HOLDING_AREA = {} as const;

/** 12 beats from beat 100, so segment positions are unambiguous. */
const TWELVE_BEAT_AT_100 = {
  looping: true,
  startTime: 100,
  endTime: 112,
  loopEnd: 4,
} as const;

/** 8 beats from beat 100: one split point, no middle segments. */
const EIGHT_BEAT_AT_100 = {
  looping: true,
  startTime: 100,
  endTime: 108,
  loopEnd: 4,
} as const;

/**
 * The arrangement positions every duplicate targeted, in call order.
 * @param trackMock - The track the split ran on
 * @returns Target positions in beats
 */
function dupPositions(trackMock: RegisteredMockObject): number[] {
  return trackMock.call.mock.calls
    .filter((call: unknown[]) => call[0] === "duplicate_clip_to_arrangement")
    .map((call: unknown[]) => call[2] as number);
}

/**
 * Register a second 8-beat clip on the same track.
 * @param clipId - Id for the new clip
 * @param props - Where the clip sits (defaults to the same span as the first)
 * @returns The clip
 */
function registerSecondClip(
  clipId: string,
  props: SplittingClipProps = EIGHT_BEAT_AT_100,
): LiveAPI {
  registerMockObject(clipId, {
    path: livePath.track(0).arrangementClip(1),
    type: "Clip",
    properties: { track_index: 0 },
  });
  setupSplittingClipGetMock(clipId, props);

  return LiveAPI.from(`id ${clipId}`);
}

/**
 * Split the 12-beat clip at both its inner boundaries, with one duplicate
 * failing the way `opts` says.
 * @param opts - Which duplicate call fails, and how
 * @returns The track the split ran on
 */
function splitWithFailure(opts: {
  failOnDuplicate?: number;
  throwOnDuplicate?: number;
}): RegisteredMockObject {
  const { callState } = setupClipSplittingMocks("clip_1", TWELVE_BEAT_AT_100);
  const clip = LiveAPI.from("id clip_1");

  overrideWithDuplicateCounter(callState.trackMock, opts);

  performSplitting(
    [clip],
    [104, 108],
    [clip],
    HOLDING_AREA,
    ARRANGEMENT_SPLIT_MODE,
  );

  return callState.trackMock;
}

// Splitting trims the original before it places anything, so a step that fails
// partway through cannot be undone. What it can do is stop the way the deadline
// does: hand the uncut rest back as one clip and say so.
describe("performSplitting when Live refuses a step", () => {
  it("puts the uncut rest of the clip back whole", () => {
    // The 3rd duplicate moves the middle segment to its final position. Live
    // answering ["id", 0] there is what used to throw out of the whole call.
    const trackMock = splitWithFailure({ failOnDuplicate: 3 });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to cut segment 1 of clip clip_1"),
    );
    // 104 is the failed segment's own start: everything from there on goes back
    // as one clip, rather than that span being left empty.
    expect(dupPositions(trackMock).at(-1)).toBe(104);
  });

  it("deletes the half-built copy left in the holding area", () => {
    const trackMock = splitWithFailure({ failOnDuplicate: 3 });

    // The clip put back whole already covers this copy's content.
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id dup_2");
  });

  it("recovers the same way when the duplicate throws outright", () => {
    // 2nd duplicate: the middle segment's working copy, so there is no
    // half-built copy to clean up.
    const trackMock = splitWithFailure({ throwOnDuplicate: 2 });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to cut segment 1 of clip clip_1"),
    );
    expect(dupPositions(trackMock).at(-1)).toBe(104);
  });

  it("stages the next clip past the copy the failure left behind", () => {
    // Regression: the holding area was one position for the whole request, so
    // the copy clip_1's failure stranded there was still in the way when clip_2
    // staged onto the same spot — an arrangement source duplicated onto an
    // occupied span, which is the crash this module exists to prevent.
    const { callState } = setupClipSplittingMocks("clip_1", EIGHT_BEAT_AT_100);
    const first = LiveAPI.from("id clip_1");
    const second = registerSecondClip("clip_2", {
      looping: true,
      startTime: 200,
      endTime: 208,
      loopEnd: 4,
    });

    addArrangementClip(callState.trackMock, "clip_2");

    // The 2nd duplicate moves clip_1's tail out of holding. Live refusing it
    // leaves the holding copy where it is.
    throwOnNthDuplicate(callState.trackMock, 2);

    performSplitting(
      [first, second],
      [104, 204],
      [first, second],
      HOLDING_AREA,
      ARRANGEMENT_SPLIT_MODE,
    );

    const [stranded, , next] = dupPositions(callState.trackMock);

    // The stranded copy is 8 beats long, so clip_2 has to start past its end.
    expect(next).toBeGreaterThanOrEqual((stranded as number) + 8);
  });

  it("keeps splitting the rest of the batch", () => {
    const { callState } = setupClipSplittingMocks("clip_1", EIGHT_BEAT_AT_100);
    const first = LiveAPI.from("id clip_1");
    const second = registerSecondClip("clip_2");

    // The 2nd duplicate places the first clip's tail; the 3rd and 4th are the
    // second clip's, and only run if the failure didn't abort the call.
    const dups = overrideWithDuplicateCounter(callState.trackMock, {
      failOnDuplicate: 2,
    });

    expect(() =>
      performSplitting(
        [first, second],
        [104],
        [first, second],
        HOLDING_AREA,
        ARRANGEMENT_SPLIT_MODE,
      ),
    ).not.toThrow();

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("arrangementSplit failed for clip clip_1"),
    );
    expect(dups.count).toBe(4);
  });
});
