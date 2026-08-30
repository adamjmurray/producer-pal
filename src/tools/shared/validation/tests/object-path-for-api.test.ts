// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { objectPathForApi, pathField } from "../object-path-for-api.ts";

function api(path: unknown, note?: number): LiveAPI {
  return {
    path,
    getProperty: () => note,
  } as unknown as LiveAPI;
}

describe("objectPathForApi", () => {
  it.each([
    ["a regular track", livePath.track(3), "t3"],
    ["a return track", livePath.returnTrack(1), "rt1"],
    ["the master track", livePath.masterTrack(), "mt"],
    ["a scene", livePath.scene(2), "s2"],
    ["a clip slot", livePath.track(1).clipSlot(4), "t1/s4"],
    ["a session clip", livePath.track(1).clipSlot(4).clip(), "t1/s4"],
    ["an arrangement clip", livePath.track(2).arrangementClip(7), "t2"],
    [
      "a take-lane clip",
      livePath.track(2).takeLane(1).arrangementClip(0),
      "t2/l1",
    ],
    ["a device", livePath.track(0).device(2), "t0/d2"],
    [
      "a chain device",
      livePath.track(0).device(0).chain(1).device(0),
      "t0/d0/c1/d0",
    ],
    ["a return chain", livePath.track(0).device(0).returnChain(0), "t0/d0/rc0"],
  ])("names %s", (_what, liveApiPath, expected) => {
    expect(objectPathForApi(api(String(liveApiPath)))).toBe(expected);
  });

  it("names a drum pad by the note it answers with, not its index", () => {
    const pad = api(`${livePath.track(0).device(0)} drum_pads 36`, 38);

    expect(objectPathForApi(pad)).toBe("t0/d0/pD1");
  });

  it("says nothing for a pad whose note is out of MIDI range", () => {
    // Unguarded this spelled "t0/d0/pnull", which a model can paste back into a
    // `path` param and get a confusing parse failure instead of an omission.
    const pad = api(`${livePath.track(0).device(0)} drum_pads 36`, 200);

    expect(objectPathForApi(pad)).toBeUndefined();
  });

  it("says nothing for a pad segment above the object", () => {
    const chain = api(
      `${livePath.track(0).device(0)} drum_pads 36 chains 0 devices 0`,
    );

    expect(objectPathForApi(chain)).toBeUndefined();
  });

  it("says nothing for a pad on something the grammar can't root", () => {
    expect(objectPathForApi(api("live_set drum_pads 36", 36))).toBeUndefined();
  });

  it("says nothing for an object that resolved to nothing", () => {
    expect(objectPathForApi(api(undefined))).toBeUndefined();
    expect(objectPathForApi(api(""))).toBeUndefined();
  });

  it("says nothing for a path with no track root", () => {
    expect(objectPathForApi(api(livePath.liveSet))).toBeUndefined();
  });
});

describe("pathField", () => {
  it("spreads the path when there is one", () => {
    expect(pathField(api(String(livePath.track(3))))).toStrictEqual({
      path: "t3",
    });
  });

  it("spreads nothing when there isn't", () => {
    expect(pathField(api(livePath.liveSet))).toStrictEqual({});
  });
});
