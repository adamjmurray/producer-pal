// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupAudioClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { LIVE_API_WARP_MODE_TEXTURE } from "#src/tools/constants.ts";
import { dbToLiveGain } from "#src/tools/shared/helpers/gain-conversion.ts";

/** What Live holds after taking every audio write as asked. */
const KEPT = {
  gain: dbToLiveGain(-6),
  pitch_coarse: 5,
  pitch_fine: 25,
  warp_mode: LIVE_API_WARP_MODE_TEXTURE,
};

const ASKED = {
  id: "123",
  gainDb: -6,
  pitchShift: 5.25,
  warpMode: "texture",
};

describe("updateClip - audio properties Live didn't keep", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
  });

  /** Live took none of the writes, so the clip answers with `held`. */
  function liveHolds(held: Record<string, unknown>): void {
    setupAudioClipMock(mocks.clip123, held);
    mocks.clip123.set.mockImplementation(() => undefined);
  }

  it("says nothing when Live kept every value", async () => {
    setupAudioClipMock(mocks.clip123, KEPT);

    expect(await updateClip(ASKED)).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("reports the values Live kept in place of the ones asked for", async () => {
    liveHolds({
      gain: dbToLiveGain(0),
      pitch_coarse: 0,
      pitch_fine: 0,
      warp_mode: 0,
    });

    expect(await updateClip(ASKED)).toStrictEqual({
      id: "123",
      path: "t0/s0",
      gainDb: expect.any(Number),
      pitchShift: 0,
      warpMode: "beats",
      detail: "gainDb, pitchShift, warpMode read back as shown, not as sent",
    });
  });

  // Live stores whole cents, so half a cent can't land and is no rounding noise.
  it("reports the whole cents Live kept for a pitch shift between two cents", async () => {
    setupAudioClipMock(mocks.clip123);

    expect(await updateClip({ id: "123", pitchShift: 3.255 })).toStrictEqual({
      id: "123",
      path: "t0/s0",
      pitchShift: 3.25,
      detail: "pitchShift read back as shown, not as sent",
    });
  });

  it("names only the fields that differ", async () => {
    liveHolds({ ...KEPT, pitch_coarse: 7 });

    expect(await updateClip(ASKED)).toStrictEqual({
      id: "123",
      path: "t0/s0",
      pitchShift: 7.25,
      detail: "pitchShift read back as shown, not as sent",
    });
  });

  it("keeps the read-back on the entry of a clip that is also renamed", async () => {
    liveHolds({ ...KEPT, warp_mode: 0 });

    expect(await updateClip({ ...ASKED, name: "Kick" })).toStrictEqual({
      id: "123",
      path: "t0/s0",
      warpMode: "beats",
      detail: "warpMode read back as shown, not as sent",
    });
  });

  it("reads a value Max sent as a numeric string", async () => {
    liveHolds({ ...KEPT, pitch_coarse: "5" });

    expect(await updateClip(ASKED)).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("names a warp mode it has no name for as unknown", async () => {
    liveHolds({ ...KEPT, warp_mode: 42 });

    expect(await updateClip({ id: "123", warpMode: "texture" })).toStrictEqual({
      id: "123",
      path: "t0/s0",
      warpMode: "unknown",
      detail: "warpMode read back as shown, not as sent",
    });
  });

  it("claims nothing about a value Live didn't answer", async () => {
    liveHolds({
      gain: "n/a",
      pitch_coarse: null,
      warp_mode: "n/a",
    });

    expect(await updateClip(ASKED)).toStrictEqual({ id: "123", path: "t0/s0" });
  });

  it("names a region and an audio value in one detail", async () => {
    liveHolds({
      ...KEPT,
      gain: dbToLiveGain(0),
      looping: 1,
      loop_start: 16,
      loop_end: 20,
      start_marker: 16,
      end_marker: 32,
    });

    expect(
      await updateClip({
        id: "123",
        gainDb: -6,
        start: "1|1",
        length: "2bar",
      }),
    ).toStrictEqual({
      id: "123",
      path: "t0/s0",
      start: "5|1",
      length: "1bar",
      gainDb: expect.any(Number),
      detail: "start, length, gainDb read back as shown, not as sent",
    });
  });
});
