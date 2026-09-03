// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  objectPathForApi,
  pathField,
  pathPrefix,
  pathTargetLabel,
  resultLabel,
  targetLabel,
} from "../object-path-for-api.ts";

// start_time is 16 Ableton beats, which the song's 4/4 makes bar 5 beat 1.
function api(path: unknown, note?: number, id = "7"): LiveAPI {
  return {
    id,
    path,
    getProperty: (prop: string) => (prop === "start_time" ? 16 : note),
  } as unknown as LiveAPI;
}

describe("objectPathForApi", () => {
  // A read-track on a busy track names one clip after another, and they all
  // resolve against the same meter.
  it("reads the song meter once however many clips it names", () => {
    const liveSet = registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });

    beginLiveApiScope();

    try {
      for (let i = 0; i < 3; i++) {
        expect(
          objectPathForApi(api(livePath.track(2).arrangementClip(i))),
        ).toBe("t2[5|1]");
      }
    } finally {
      endLiveApiScope();
    }

    const meterReads = liveSet.get.mock.calls.filter(
      ([prop]: unknown[]) => prop === "signature_numerator",
    );

    expect(meterReads).toHaveLength(1);
  });

  it.each([
    ["a regular track", livePath.track(3), "t3"],
    ["a return track", livePath.returnTrack(1), "rt1"],
    ["the master track", livePath.masterTrack(), "mt"],
    ["a scene", livePath.scene(2), "s2"],
    ["a clip slot", livePath.track(1).clipSlot(4), "t1/s4"],
    ["a session clip", livePath.track(1).clipSlot(4).clip(), "t1/s4"],
    ["a take lane", livePath.track(2).takeLane(1), "t2/l1"],
    ["an arrangement clip", livePath.track(2).arrangementClip(7), "t2[5|1]"],
    [
      "a take-lane clip",
      livePath.track(2).takeLane(1).arrangementClip(0),
      "t2/l1[5|1]",
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

// A path that named an ancestor would be paired with this object's id, so the
// label would read as naming something it doesn't.
describe("objectPathForApi refuses an ancestor's path", () => {
  it.each([
    ["a device parameter", "live_set tracks 0 devices 0 parameters 5"],
    ["a mixer device", "live_set tracks 0 mixer_device"],
    ["a send", "live_set tracks 0 mixer_device sends 1"],
    [
      "a chain's send",
      "live_set tracks 0 devices 0 chains 1 mixer_device sends 0",
    ],
  ])("spells no path for %s", (_what, liveApiPath) => {
    expect(objectPathForApi(api(liveApiPath))).toBeUndefined();
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

// The one rule every warning label follows: say both spellings, because the
// model addressed the object by one of them and can't map the other back.
describe("targetLabel", () => {
  it("names an object by its path and its id", () => {
    expect(targetLabel(api(String(livePath.track(0).device(2))))).toBe(
      "t0/d2 (id 7)",
    );
  });

  it("names an arrangement clip by where it starts and its id", () => {
    expect(targetLabel(api(livePath.track(2).arrangementClip(7)))).toBe(
      "t2[5|1] (id 7)",
    );
  });

  it("falls back to the id alone when the grammar spells no path", () => {
    expect(targetLabel(api(livePath.liveSet))).toBe("id 7");
  });
});

describe("resultLabel", () => {
  it("names a result by both spellings it already carries", () => {
    expect(resultLabel({ id: "7", path: "t0/d2" })).toBe("t0/d2 (id 7)");
  });

  it("names a result with no path by its id", () => {
    expect(resultLabel({ id: "7" })).toBe("id 7");
  });
});

describe("pathTargetLabel", () => {
  it("names a resolved target by both spellings", () => {
    expect(
      pathTargetLabel(api(String(livePath.track(0).device(2))), "t0/d2"),
    ).toBe("t0/d2 (id 7)");
  });

  it("keeps the caller's path for a target the grammar can't spell", () => {
    expect(pathTargetLabel(api(livePath.liveSet), "t0/d0/pC1")).toBe(
      "t0/d0/pC1 (id 7)",
    );
  });

  it("quotes the caller's path when it resolved to nothing", () => {
    expect(pathTargetLabel(null, "t0/d9")).toBe('"t0/d9"');
  });
});

describe("pathPrefix", () => {
  it("leaves the id off, so another segment can be appended", () => {
    expect(pathPrefix(api(String(livePath.track(0).device(2))))).toBe("t0/d2");
  });

  it("falls back to the id when the grammar spells no path", () => {
    expect(pathPrefix(api(livePath.liveSet))).toBe("id 7");
  });
});
