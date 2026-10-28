// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// Lengthening a looped arrangement clip tiles it into new clips, and envelopes
// would reach only the first. That target is refused before anything is written.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { setUpLane } from "../move-order/lane-with-clips-test-helpers.ts";

vi.mock(import("#src/tools/clip/envelopes/apply-clip-envelopes.ts"), () => ({
  applyClipEnvelopes: vi.fn(),
}));

const REFUSED = /tiles this looped clip.*envelopes in a separate call/;

describe("updateClip - envelopes beside an arrangementLength that tiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a lone looped clip it would tile, changing nothing", async () => {
    const track = setUpLane([
      { id: "100", start: 0, length: 4, looping: true },
    ]);

    await expect(
      updateClip({
        id: "100",
        arrangementLength: "2bar",
        envelopes: "pan: 1|1 0.5",
      }),
    ).rejects.toThrow(REFUSED);
    expect(track.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );
    expect(lookupMockObject("100")?.set).not.toHaveBeenCalled();
    expect(applyClipEnvelopes).not.toHaveBeenCalled();
  });

  it("refuses a looped clip it would tile at the position it is sent to", async () => {
    setUpLane([{ id: "100", start: 0, length: 4, looping: true }]);

    await expect(
      updateClip({
        id: "100",
        toPath: "t0[9|1]",
        arrangementLength: "2bar",
        envelopes: "pan: 1|1 0.5",
      }),
    ).rejects.toThrow(REFUSED);
    expect(applyClipEnvelopes).not.toHaveBeenCalled();
  });

  it("skips only the clip that tiles in a list", async () => {
    setUpLane([
      { id: "100", start: 0, length: 4, looping: true },
      { id: "101", start: 32, length: 4 },
    ]);

    const result = (await updateClip({
      id: "100,101",
      arrangementLength: "2bar",
      envelopes: "pan: 1|1 0.5",
    })) as ClipResult[];

    expect(result[0]?.detail).toMatch(REFUSED);
    expect(applyClipEnvelopes).toHaveBeenCalledTimes(1);
  });

  it("refuses a clip the same call turns looping on", async () => {
    setUpLane([{ id: "100", start: 0, length: 4 }]);

    await expect(
      updateClip({
        id: "100",
        looping: true,
        arrangementLength: "2bar",
        envelopes: "pan: 1|1 0.5",
      }),
    ).rejects.toThrow(REFUSED);
  });

  it("lets through a looped audio clip the same call unwarps", async () => {
    // Unwarping turns looping off, so the clip grows in place.
    setUpLoopedAudioClip();

    await updateClip({
      id: "100",
      warping: false,
      arrangementLength: "2bar",
      envelopes: "pan: 1|1 0.5",
    });

    expect(applyClipEnvelopes).toHaveBeenCalledTimes(1);
  });

  it("refuses an unwarp the same call loops again", async () => {
    // looping: true vetoes warping: false, so the clip still tiles.
    setUpLoopedAudioClip();

    await expect(
      updateClip({
        id: "100",
        warping: false,
        looping: true,
        arrangementLength: "2bar",
        envelopes: "pan: 1|1 0.5",
      }),
    ).rejects.toThrow(REFUSED);
  });

  it("refuses a looped MIDI clip sent warping: false, which it ignores", async () => {
    setUpLane([{ id: "100", start: 0, length: 4, looping: true }]);

    await expect(
      updateClip({
        id: "100",
        warping: false,
        arrangementLength: "2bar",
        envelopes: "pan: 1|1 0.5",
      }),
    ).rejects.toThrow(REFUSED);
  });

  it.each([
    ["an unlooped lengthen, which grows in place", false, "2bar", undefined],
    ["a shorten", true, "n/2", undefined],
    ["a length the clip already has", true, "1bar", undefined],
    ["a looped clip the same call unloops", true, "2bar", false],
  ])("lets %s through", async (_, looping, arrangementLength, setLooping) => {
    setUpLane([{ id: "100", start: 0, length: 4, looping }]);

    await updateClip({
      id: "100",
      arrangementLength,
      envelopes: "pan: 1|1 0.5",
      ...(setLooping != null && { looping: setLooping }),
    });

    expect(applyClipEnvelopes).toHaveBeenCalledTimes(1);
  });
});

/**
 * A looped, warped audio clip at 1|1 that stops looping when unwarped, as in
 * Live.
 */
function setUpLoopedAudioClip(): void {
  setUpLane([{ id: "100", start: 0, length: 4, looping: true }]);
  const clip = lookupMockObject("100");

  if (clip == null) {
    throw new Error("clip 100 not registered");
  }

  Object.assign(clip.properties, {
    is_audio_clip: 1,
    is_midi_clip: 0,
    warping: 1,
  });
  clip.set.mockImplementation((property: string, value: unknown) => {
    if (property === "warping" && value === 0) {
      Object.assign(clip.properties, { warping: 0, looping: 0 });
    }
  });
}
