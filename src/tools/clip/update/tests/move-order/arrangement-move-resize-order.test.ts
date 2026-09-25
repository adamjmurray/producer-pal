// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import * as arrangementOperations from "#src/tools/clip/arrangement/arrangement-operations.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { handleArrangementOperations } from "../../helpers/arrangement/arrangement-move.ts";
import * as placeMovedClipModule from "../../helpers/arrangement/place-moved-clip.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "../../helpers/entries/clip-reasons.ts";
import { joinedClipReason } from "../../helpers/update-clip-test-helpers.ts";

const SOURCE = "789";
const MOVED = "999";

let reasons: ClipReasons = newClipReasons();
let updatedClips: ClipResult[] = [];

/**
 * Register a 4-bar (beats 0-16) arrangement MIDI clip, on the main lane or a
 * take lane.
 * @param id - The clip id
 * @param takeLane - Take lane index, or null for the main lane
 * @param start - Start in beats
 * @returns The clip as the update loop sees it
 */
function registerClip(
  id: string,
  takeLane: number | null = null,
  start = 0,
): LiveAPI {
  const track = livePath.track(0);

  registerMockObject(id, {
    path:
      takeLane == null
        ? track.arrangementClip(0)
        : track.takeLane(takeLane).arrangementClip(0),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: start,
      end_time: start + 16,
    },
  });

  return LiveAPI.from(id);
}

/**
 * Spy on the resize and the move's placement, returning the moved clip.
 * @returns Both spies
 */
function spyOnSteps() {
  const resize = vi
    .spyOn(arrangementOperations, "handleArrangementLengthOperation")
    .mockReturnValue([]);
  const place = vi
    .spyOn(placeMovedClipModule, "placeMovedClip")
    .mockImplementation(() => LiveAPI.from(MOVED));

  return { resize, place };
}

/**
 * Move the source clip to beat 32 and resize it.
 * @param lengthBeats - Target length in beats
 * @param destination - Destination lane, or null for its own
 * @param clip - The clip to operate on
 * @param isAudioClip - Whether the clip is audio
 */
function moveAndResize(
  lengthBeats: number,
  destination: ArrangementTrack | null = null,
  clip: LiveAPI = LiveAPI.from(SOURCE),
  isAudioClip = false,
): void {
  handleArrangementOperations({
    clip,
    isAudioClip,
    arrangementStartBeats: 32,
    arrangementLengthBeats: lengthBeats,
    destination,
    movedClipGroups: new Map(),
    context: { silenceWavPath: "/tmp/silence.wav" },
    updatedClips,
    noteResult: null,
    reasons,
  });
}

/**
 * Whether the resize ran before the move placed its copy.
 * @param steps - The spies from {@link spyOnSteps}
 * @returns True when the resize came first
 */
function resizedFirst(steps: ReturnType<typeof spyOnSteps>): boolean {
  const resizeOrder = steps.resize.mock.invocationCallOrder[0] as number;
  const placeOrder = steps.place.mock.invocationCallOrder[0] as number;

  return resizeOrder < placeOrder;
}

describe("handleArrangementOperations - move and resize order", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    reasons = newClipReasons();
    updatedClips = [];
    registerMockObject(livePath.track(0), { type: "Track" });
    registerMockObject(MOVED, {
      path: livePath.track(0).arrangementClip(1),
      type: "Clip",
      properties: { is_arrangement_clip: 1, start_time: 32, end_time: 40 },
    });
  });

  it("shortens a main-lane clip where it sits, then moves it", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    moveAndResize(8);

    expect(resizedFirst(steps)).toBe(true);
    expect(steps.resize.mock.calls[0]?.[0].clip.id).toBe(SOURCE);
    expect(updatedClips.map(({ id }) => id)).toStrictEqual([MOVED]);
  });

  it("shortens an audio clip on its own track before moving it", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    moveAndResize(8, null, LiveAPI.from(SOURCE), true);

    expect(resizedFirst(steps)).toBe(true);
    expect(steps.resize.mock.calls[0]?.[0]).toStrictEqual(
      expect.objectContaining({ isAudioClip: true, arrangementLengthBeats: 8 }),
    );
  });

  it("moves first when the call lengthens", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    moveAndResize(32);

    expect(resizedFirst(steps)).toBe(false);
    expect(steps.resize.mock.calls[0]?.[0].clip.id).toBe(MOVED);
  });

  it("moves first when the destination is a take lane", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    moveAndResize(8, { trackIndex: 0, takeLane: 0 });

    expect(resizedFirst(steps)).toBe(false);
  });

  it("moves first when the source is on a take lane", () => {
    const clip = registerClip(SOURCE, 0);
    const steps = spyOnSteps();

    moveAndResize(8, null, clip);

    expect(resizedFirst(steps)).toBe(false);
  });

  it("keeps a shortened clip's entry at its old spot when the move throws", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    steps.place.mockImplementation(() => {
      throw new Error("boom");
    });

    moveAndResize(8);

    expect(updatedClips.map(({ id }) => id)).toStrictEqual([SOURCE]);
    expect(joinedClipReason(reasons, SOURCE)).toBe(
      "shortened, but the move didn't finish: boom",
    );
  });

  it("keeps a shortened clip's entry when the move is refused", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    steps.place.mockReturnValue(null);

    moveAndResize(8);

    expect(updatedClips.map(({ id }) => id)).toStrictEqual([SOURCE]);
    expect(reasons.landed.has(SOURCE)).toBe(true);
  });

  it("keeps a moved clip's entry when the resize after it throws", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    steps.resize.mockImplementation(() => {
      throw new Error("boom");
    });

    moveAndResize(32);

    expect(updatedClips.map(({ id }) => id)).toStrictEqual([MOVED]);
    expect(joinedClipReason(reasons, SOURCE)).toBe(
      "moved, but arrangementLength didn't finish: boom",
    );
  });

  it("lets a resize failure through when nothing moved", () => {
    registerClip(SOURCE);
    const steps = spyOnSteps();

    steps.place.mockReturnValue(null);
    steps.resize.mockImplementation(() => {
      throw new Error("boom");
    });

    // Lengthening moves first, so the refused move leaves the clip in place.
    expect(() => moveAndResize(32)).toThrow("boom");
    expect(updatedClips).toStrictEqual([]);
  });
});
