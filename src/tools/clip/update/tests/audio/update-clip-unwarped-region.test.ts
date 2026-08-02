// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  setupAudioClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// An unwarped audio clip's marker properties are SECONDS, not beats. Verified
// in Live: writing 0.25 → 0.75 into the markers of a clip at 120 BPM reads back
// as start "1|1.5", length "n/4" — the same conversion audioClipTiming reads
// with, so start/length round-trip.
describe("updateClip - unwarped audio clip region", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  /**
   * Register a Live Set at `tempo` so the seconds↔beats conversion has one.
   * @param tempo - Live Set tempo in BPM
   */
  function setTempo(tempo: number): void {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { tempo, signature_numerator: 4, signature_denominator: 4 },
    });
  }

  it("writes seconds, not beats, when the clip is unwarped", async () => {
    setTempo(120);
    setupAudioClipMock(mocks.clip123, {
      warping: 0,
      looping: 0,
      start_marker: 0,
      end_marker: 1.0909, // seconds — the whole sample
    });

    await updateClip({ ids: "123", start: "1|1", length: "n/4" });

    // n/4 is one beat, which is half a second at 120 BPM.
    expect(mocks.clip123.set).toHaveBeenCalledWith("end_marker", 0.5);
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 0);
  });

  it("scales by the Set tempo, since unwarped audio plays in real time", async () => {
    setTempo(60);
    setupAudioClipMock(mocks.clip123, {
      warping: 0,
      looping: 0,
      start_marker: 0,
      end_marker: 1.0909,
    });

    await updateClip({ ids: "123", start: "1|1", length: "n/4" });

    // Same one beat, but a beat is a whole second at 60 BPM.
    expect(mocks.clip123.set).toHaveBeenCalledWith("end_marker", 1);
  });

  it("reads the current end_marker as seconds when deriving start from length", async () => {
    setTempo(120);
    setupAudioClipMock(mocks.clip123, {
      warping: 0,
      looping: 0,
      start_marker: 0,
      end_marker: 2, // 2 seconds = 4 beats
    });

    // No start: the region is derived backwards from the content boundary.
    await updateClip({ ids: "123", length: "n/4" });

    // 4 beats − 1 beat = beat 3, which is 1.5 s in.
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 1.5);
    expect(mocks.clip123.set).toHaveBeenCalledWith("end_marker", 2);
  });

  it("still writes beats when the audio clip is warped", async () => {
    setTempo(120);
    setupAudioClipMock(mocks.clip123, {
      warping: 1,
      looping: 0,
      start_marker: 0,
      end_marker: 4,
    });

    await updateClip({ ids: "123", start: "1|1", length: "n/4" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("end_marker", 1);
  });

  it("unwarps before writing the region, so the two compose", async () => {
    setTempo(120);
    // Stateful, unlike the other cases: the whole point is that the region
    // write happens after `warping` has already flipped, so reads have to see
    // the write.
    const state: Record<string, unknown> = {
      is_arrangement_clip: 0,
      is_midi_clip: 0,
      is_audio_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      warping: 1,
      looping: 0,
      start_marker: 0,
      end_marker: 2.1819,
      sample_rate: 22050,
      sample_length: 24056, // 1.0909 s
    };

    mocks.clip123.get.mockImplementation((prop: string) => [state[prop] ?? 0]);
    mocks.clip123.set.mockImplementation((prop: string, value: unknown) => {
      state[prop] = value;
    });

    await updateClip({
      ids: "123",
      warping: false,
      start: "1|1",
      length: "n/4",
    });

    // Order is what this covers: switching warp off resets end_marker to the
    // whole sample, so a region written first would be thrown away. Running it
    // first also means the markers are already seconds when the region lands.
    const calls = mocks.clip123.set.mock.calls;
    const warpCall = calls.findIndex(([prop]) => prop === "warping");
    const endCall = calls.findLastIndex(([prop]) => prop === "end_marker");

    expect(warpCall).toBeGreaterThanOrEqual(0);
    expect(endCall).toBeGreaterThan(warpCall);
    expect(calls[endCall]![1]).toBe(0.5);
  });
});
