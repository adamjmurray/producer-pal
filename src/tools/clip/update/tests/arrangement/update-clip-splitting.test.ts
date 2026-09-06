// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Smoke tests for update-clip splitting integration.
 * Comprehensive splitting tests are in arrangement-splitting.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import {
  type RegisteredMockObject,
  clearMockRegistry,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  createSplittingCallMock,
  setupClipSplittingMocks,
  setupSplittingClipBaseMocks,
  setupSplittingClipGetMock,
  type SplittingCallState,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-splitting-test-helpers.ts";
import { stubSplitRescan } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { planClipUpdate } from "#src/tools/clip/update/helpers/update-clip-prep-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { setupCuePointMocksRegistry } from "#src/test/helpers/cue-point-test-helpers.ts";

/**
 * Register a splittable clip that sits on a take lane instead of the track's
 * main arrangement lane.
 * @param clipId - Id to register the clip under
 */
function setupTakeLaneClipMocks(clipId: string): void {
  clearMockRegistry();
  setupSplittingClipBaseMocks(clipId, {
    path: livePath.track(0).takeLane(0).arrangementClip(0),
  });
  setupSplittingClipGetMock(clipId);
  createSplittingCallMock();
}

function expectDuplicateCalled(trackMock: RegisteredMockObject): void {
  expect(trackMock.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.any(String),
    expect.any(Number),
  );
}

describe("updateClip - splitting smoke tests", () => {
  it("still splits for the deprecated split param", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip({ id: clipId, split: "2|1" }, {});

    expectDuplicateCalled(callState.trackMock);
  });

  it("splits nothing when both split params are given", async () => {
    const clipId = "clip_1";
    const consoleSpy = vi.spyOn(console, "warn");

    const { callState } = setupClipSplittingMocks(clipId);

    // They read positions on different timelines, so there is no safe guess.
    await updateClip({ id: clipId, arrangementSplit: "2|1", split: "3|1" }, {});

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit and split both name split"),
    );
  });

  it("splits for arrangementSplit when split is sent blank", async () => {
    const clipId = "clip_1";
    const consoleSpy = vi.spyOn(console, "warn");

    const { callState } = setupClipSplittingMocks(clipId);

    // A client that fills every optional string with "" is not sending two
    // split requests, so the ambiguity warning would cost it the one it asked
    // for.
    await updateClip({ id: clipId, arrangementSplit: "2|1", split: "" }, {});

    expectDuplicateCalled(callState.trackMock);
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit and split both name split"),
    );
  });

  it("splits nothing, and says nothing, for a blank arrangementSplit", async () => {
    const clipId = "clip_1";
    const consoleSpy = vi.spyOn(console, "warn");

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip({ id: clipId, arrangementSplit: "" }, {});

    expect(callState.trackMock.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
    // Complaining about the format of a param that named nothing sends the
    // model looking for a problem with a value it never meant to send.
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit"),
    );
  });

  it("should call splitting helpers when split parameter is provided", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip(
      {
        id: clipId,
        arrangementSplit: "2|1, 3|1", // Split at bar 2 and bar 3
      },
      {},
    );

    // Should call duplicate_clip_to_arrangement (splitting is active)
    expectDuplicateCalled(callState.trackMock);
  });

  it("should apply other updates after splitting", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    await updateClip(
      {
        id: clipId,
        arrangementSplit: "2|1",
        name: "Split Clip",
      },
      {},
    );

    // Should call duplicate_clip_to_arrangement (splitting is active)
    expectDuplicateCalled(callState.trackMock);
  });

  it("should filter out non-existent clips after splitting", async () => {
    const clipId = "clip_1";

    const { callState } = setupClipSplittingMocks(clipId);

    stubSplitRescan("fresh_clip");

    const result = await updateClip(
      {
        id: clipId,
        arrangementSplit: "2|1",
      },
      {},
    );

    // Should complete successfully, filtering out the non-existent clip (id "0")
    expectDuplicateCalled(callState.trackMock);
    const results = Array.isArray(result) ? result : [result];
    const resultIds = results.map((r) => r.id);

    expect(resultIds).not.toContain("0");
  });

  it("should warn and skip splitting for a take-lane clip", async () => {
    const clipId = "take_lane_clip";
    const consoleSpy = vi.spyOn(console, "warn");

    // A take-lane arrangement clip cannot be split via
    // duplicate_clip_to_arrangement, so it is warned-and-skipped.
    setupTakeLaneClipMocks(clipId);

    const result = await updateClip(
      {
        id: clipId,
        arrangementSplit: "2|1",
      },
      {},
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("arrangementSplit ignored for take-lane clip"),
    );
    const results = Array.isArray(result) ? result : [result];

    expect(results.map((r) => r.id)).toContain(clipId);
  });

  it("should not warn about split on a take-lane clip when split is not given", async () => {
    const clipId = "take_lane_clip";
    const consoleSpy = vi.spyOn(console, "warn");

    setupTakeLaneClipMocks(clipId);

    await updateClip({ id: clipId, name: "renamed" }, {});

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("ignored for take-lane clip"),
    );
  });
});

const CLIP_ID = "clip_1";

const CUE_POINTS = [
  { id: "cue1", time: 4, name: "Verse" },
  { id: "cue2", time: 16, name: "Chorus" },
];

/**
 * A splittable arrangement clip on a Set that also has locators.
 * @param clipProps - Clip properties passed through to the splitting mocks
 * @returns The call-tracking state for the track
 */
function setupWithLocators(
  clipProps: Record<string, unknown> = {},
): SplittingCallState {
  const { callState } = setupClipSplittingMocks(CLIP_ID, clipProps);

  // Re-registers live_set with the same meter, plus the cue points.
  setupCuePointMocksRegistry({
    cuePoints: CUE_POINTS,
    liveSetProps: { signature_numerator: 4, signature_denominator: 4 },
  });

  return callState;
}

describe("updateClip - loc: song positions", () => {
  it("splits at a locator named on arrangementSplit", async () => {
    const callState = setupWithLocators();

    await updateClip({ id: CLIP_ID, arrangementSplit: "loc:Verse" }, {});

    expect(callState.trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("throws, naming arrangementSplit, when the locator is not found", async () => {
    setupWithLocators();

    await expect(
      updateClip({ id: CLIP_ID, arrangementSplit: "loc:Bridge" }, {}),
    ).rejects.toThrow(
      'no locator found with name "Bridge" for arrangementSplit',
    );
  });

  it("throws, naming arrangementStart, when the locator is not found", async () => {
    setupWithLocators();

    await expect(
      updateClip({ id: CLIP_ID, arrangementStart: "loc:Bridge" }, {}),
    ).rejects.toThrow(
      'no locator found with name "Bridge" for arrangementStart',
    );
  });

  it("does not read loc: on split, which is clip-relative", async () => {
    setupWithLocators();

    await expect(
      updateClip({ id: CLIP_ID, split: "loc:Chorus" }, {}),
    ).resolves.toBeDefined();
  });
});

type UpdateClipArgs = NonNullable<Parameters<typeof updateClip>[0]>;

describe("updateClip - arrangementSplit next to a move", () => {
  it.each<{ sent: string; param: string; args: UpdateClipArgs }>([
    {
      sent: "toPath",
      param: "toPath",
      args: { id: "clip_1", toPath: "t1[17|1]" },
    },
    { sent: "toSlot", param: "toSlot", args: { id: "clip_1", toSlot: "1/2" } },
    {
      sent: "an arrangementStart list",
      param: "arrangementStart",
      args: { id: "clip_1, clip_2", arrangementStart: "3|1,5|1" },
    },
    {
      sent: "an arrangementLength list",
      param: "arrangementLength",
      args: { id: "clip_1, clip_2", arrangementLength: "1bar,2bar" },
    },
    {
      sent: "one arrangementLength",
      param: "arrangementLength",
      args: { id: "clip_1", arrangementLength: "4bar" },
    },
  ])("refuses arrangementSplit sent with $sent", async ({ param, args }) => {
    const { callState } = setupClipSplittingMocks("clip_1");

    await expect(
      updateClip({ ...args, arrangementSplit: "2|1" }, {}),
    ).rejects.toThrow(`arrangementSplit cannot be combined with ${param}`);

    // Refused before anything was cut.
    expect(callState.trackMock.call).not.toHaveBeenCalled();
  });

  it("refuses one arrangementStart, which every piece would land on", async () => {
    const { callState } = setupClipSplittingMocks("clip_1");
    const clip = lookupMockObject("clip_1");

    // A single value covers every clip, the pieces included, so all three
    // would pile onto bar 17 and the overlap plan would delete two of them.
    await expect(
      updateClip(
        {
          id: "clip_1",
          arrangementSplit: "3|1, 5|1",
          arrangementStart: "17|1",
        },
        {},
      ),
    ).rejects.toThrow(
      "arrangementSplit cannot be combined with arrangementStart",
    );

    expect(callState.trackMock.call).not.toHaveBeenCalled();
    expect(clip?.set).not.toHaveBeenCalled();
  });

  it("refuses one arrangementLength, which tiles a piece over the next", async () => {
    const { callState } = setupClipSplittingMocks("clip_1");

    // Lengthening tiles copies in from the clip's own end, and after a split
    // that is exactly where the next piece starts, so the pieces bury each
    // other. Which lengths are safe needs each piece's length, and that needs
    // a Live read this has to answer before.
    await expect(
      updateClip(
        { id: "clip_1", arrangementSplit: "3|1", arrangementLength: "4bar" },
        {},
      ),
    ).rejects.toThrow(
      "arrangementSplit cannot be combined with arrangementLength",
    );

    expect(callState.trackMock.call).not.toHaveBeenCalled();
  });

  it("names every refused param, joined so the sentence still reads", async () => {
    setupClipSplittingMocks("clip_1");

    await expect(
      updateClip(
        {
          id: "clip_1, clip_2",
          arrangementSplit: "2|1",
          toPath: "t1[17|1],t1[21|1]",
          arrangementLength: "1bar,2bar",
        },
        {},
      ),
    ).rejects.toThrow(
      /toPath or arrangementLength[\S\s]*on the ids the split returns\./,
    );
  });

  it("refuses the deprecated split spelling too, and names it", async () => {
    setupClipSplittingMocks("clip_1");

    await expect(
      updateClip({ id: "clip_1", split: "2|1", toPath: "t1[17|1]" }, {}),
    ).rejects.toThrow("split cannot be combined with toPath");
  });

  it("still splits when nothing else names a place or a length", async () => {
    const { callState } = setupClipSplittingMocks("clip_1");

    // An all-empty toSlot names nothing, so it is not a conflict: refusing it
    // would refuse a call that had none.
    await updateClip(
      { id: "clip_1", arrangementSplit: "2|1", toSlot: "," },
      {},
    );

    expectDuplicateCalled(callState.trackMock);
  });
});

describe("planClipUpdate - the pieces a split makes", () => {
  it("gives the piece on a new id nothing a list could have paired with", () => {
    setupClipSplittingMocks("clip_1");

    const plan = planClipUpdate({
      requestedIds: ["clip_1"],
      arrangementSplit: "2|1",
      context: {},
    });

    // Why every position and length is refused above: the second piece is on
    // an id the call never named, so a list has no entry to pair with it and
    // a single value would reach it whether or not that made sense.
    expect(
      plan.clips.map((clip) => [clip.id, plan.lengthBeatsFor(clip)]),
    ).toStrictEqual([
      ["clip_1", null],
      ["dup_2", null],
    ]);
  });
});
