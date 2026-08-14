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

  it("clamps a stale end_marker to the sample, like read-clip does", async () => {
    setTempo(120);
    setupAudioClipMock(mocks.clip123, {
      warping: 0,
      looping: 0,
      start_marker: 0,
      // Live leaves end_marker alone on unwarp, so it can point past the file:
      // 4 was 4 beats while warped and now reads as 4 seconds on a 2 s sample.
      end_marker: 4,
      sample_rate: 44100,
      sample_length: 88200, // 2 s
    });

    // read-clip reports this clip as 1 bar (2 s clamped, ×2 beats/s). Handing
    // that length straight back has to reproduce the same region, not derive
    // from the unclamped 4 s and land past the end of the sample.
    await updateClip({ ids: "123", length: "1bar" });

    expect(mocks.clip123.set).toHaveBeenCalledWith("end_marker", 2);
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 0);
  });

  it("clamps the stale end_marker the write-order heuristic reads too", async () => {
    setTempo(120);
    setupAudioClipMock(mocks.clip123, {
      warping: 0,
      looping: 0,
      start_marker: 0,
      // Stale on both ends: 10 was beats while warped, now reads as 10 s on a
      // 2 s sample.
      end_marker: 10,
      loop_end: 10,
      sample_rate: 44100,
      sample_length: 88200, // 2 s = 4 beats
    });

    // Beat 6 is past the clamped boundary (4 beats) but well inside the stale
    // one (20 beats), so the two readings disagree about whether this write
    // expands the region.
    await updateClip({ ids: "123", start: "2|3", length: "n/4" });

    const props = mocks.clip123.set.mock.calls.map(([prop]) => prop);

    // Live silently ignores a start_marker past end_marker, so an expanding
    // write has to move the end first. Reading the markers unclamped here made
    // this look like a shrink and wrote the start into a region that couldn't
    // hold it — no error, just a partly applied region.
    expect(props.indexOf("end_marker")).toBeGreaterThanOrEqual(0);
    expect(props.indexOf("start_marker")).toBeGreaterThan(
      props.indexOf("end_marker"),
    );
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

  /**
   * Wire a clip mock so reads see earlier writes. Needed wherever the region
   * write lands after `warping` has already flipped.
   * @param overrides - Starting property values
   */
  function statefulAudioClip(overrides: Record<string, unknown>): void {
    const state: Record<string, unknown> = {
      is_arrangement_clip: 0,
      is_midi_clip: 0,
      is_audio_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
      sample_rate: 22050,
      sample_length: 24056, // 1.0909 s
      ...overrides,
    };

    mocks.clip123.get.mockImplementation((prop: string) => [state[prop] ?? 0]);
    mocks.clip123.set.mockImplementation((prop: string, value: unknown) => {
      state[prop] = value;
    });
  }

  it("unwarps before writing the region, so the two compose", async () => {
    setTempo(120);
    statefulAudioClip({
      warping: 1,
      looping: 0,
      start_marker: 0,
      end_marker: 2.1819,
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

  // `looping: true` forces warp back on, so the region has to be written in
  // beats even though the clip was unwarped when the call arrived.
  it("re-warps before writing the region when looping is switched on", async () => {
    setTempo(120);
    statefulAudioClip({
      warping: 0,
      looping: 0,
      start_marker: 0,
      end_marker: 1.0909, // seconds — the whole sample
    });

    await updateClip({
      ids: "123",
      looping: true,
      start: "1|1",
      length: "1bar",
    });

    expect(mocks.clip123.set).toHaveBeenCalledWith("warping", 1);
    // One bar is 4 beats. Written as seconds it would be 2, and Live would read
    // that back as half a bar.
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_end", 4);
    expect(mocks.clip123.set).toHaveBeenCalledWith("loop_start", 0);
  });

  it("warns that looping: true wins over warping: false", async () => {
    setTempo(120);
    statefulAudioClip({
      warping: 0,
      looping: 0,
      start_marker: 0,
      end_marker: 1.0909,
    });

    await updateClip({ ids: "123", warping: false, looping: true });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "warping: false ignored - looping: true forces warping on",
    );
    expect(mocks.clip123.set).toHaveBeenCalledWith("warping", 1);
  });

  it("keeps the region when looping: true vetoes warping: false", async () => {
    setTempo(120);
    statefulAudioClip({
      warping: 1,
      looping: 0,
      start_marker: 0,
      end_marker: 4, // beats — the clip's content boundary
    });

    await updateClip({ ids: "123", warping: false, looping: true });

    // The veto has to happen BEFORE the unwarp, not after: unwarping resets
    // end_marker to the whole sample (1.09 s), and re-warping reads that back
    // as 1.09 beats — the region collapses even though `warping` ends up
    // exactly where it started.
    expect(outlet).toHaveBeenCalledWith(
      1,
      "warping: false ignored - looping: true forces warping on",
    );
    expect(mocks.clip123.set).not.toHaveBeenCalledWith("warping", 0);
    expect(mocks.clip123.set).not.toHaveBeenCalledWith(
      "end_marker",
      expect.anything(),
    );
  });

  it("leaves a warped clip alone when looping is switched on", async () => {
    setTempo(120);
    statefulAudioClip({
      warping: 1,
      looping: 0,
      start_marker: 0,
      end_marker: 4,
    });

    await updateClip({ ids: "123", looping: true, length: "1bar" });

    expect(mocks.clip123.set).not.toHaveBeenCalledWith("warping", 1);
  });
});
