// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  automatedParam,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";

const OVERRIDDEN =
  "arrangement automation overridden — Live ignores it until Re-Enable Automation";

describe("updateLiveSet - tempo automation", () => {
  let liveSet: RegisteredMockObject;
  let songTempo: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: livePath.liveSet });
    registerMockObject("master", { path: livePath.masterTrack() });
    songTempo = registerMockObject("song_tempo", {
      path: `${livePath.masterTrack().mixerDevice()} song_tempo`,
    });
    liveSet.get.mockImplementation((property: string) =>
      property === "tempo" ? [liveSet.properties.tempo ?? 120] : [0],
    );
    liveSet.set.mockImplementation((property: string, value: unknown) => {
      liveSet.properties[property] = value;
    });
  });

  it("says so when the tempo write overrides the lane", async () => {
    automatedParam(songTempo);

    expect(await updateLiveSet({ tempo: 130 })).toStrictEqual({
      id: "live_set_id",
      detail: `tempo: ${OVERRIDDEN}`,
    });
  });

  it("follows the read-back detail when Live kept another tempo", async () => {
    liveSet.set.mockImplementation(() => {
      liveSet.properties.tempo = 140.5;
    });
    automatedParam(songTempo);

    expect(await updateLiveSet({ tempo: 140 })).toStrictEqual({
      id: "live_set_id",
      tempo: 140.5,
      detail: `tempo read back as shown, not as sent; tempo: ${OVERRIDDEN}`,
    });
  });

  it.each([
    ["already overridden", 2, 130],
    ["no lane, or unknown while playing from Session", 0, 130],
    ["a lane when the tempo it holds is written again", 1, 120],
  ])("says nothing for %s", async (_, state, tempo) => {
    automatedParam(songTempo, state);

    expect(await updateLiveSet({ tempo })).toStrictEqual({
      id: "live_set_id",
    });
  });

  it("does not look at the tempo lane when tempo isn't written", async () => {
    automatedParam(songTempo);

    await updateLiveSet({ scale: "C Major" });

    expect(songTempo.get).not.toHaveBeenCalledWith("automation_state");
  });
});
