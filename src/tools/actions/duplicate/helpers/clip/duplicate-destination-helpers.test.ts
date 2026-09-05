// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type ClipDestinations,
  resolveClipDestinations,
  warnInapplicableClipParams,
  warnUnusedDestination,
} from "./duplicate-destination-helpers.ts";

/**
 * The resolved shape for a session destination.
 * @param slots - The clip slots the copies go to
 * @returns A ClipDestinations to compare against
 */
function sessionResult(slots: ClipDestinations["slots"]): ClipDestinations {
  return {
    destination: "session",
    slots,
    arrangementTargets: [],
    arrangementPositions: [],
  };
}

/**
 * The resolved shape for an arrangement destination.
 * @param arrangementTargets - The tracks and lanes the copies go to
 * @param arrangementPositions - The position each target's own path named
 * @returns A ClipDestinations to compare against
 */
function arrangementResult(
  arrangementTargets: ClipDestinations["arrangementTargets"],
  arrangementPositions: ClipDestinations["arrangementPositions"],
): ClipDestinations {
  return {
    destination: "arrangement",
    slots: [],
    arrangementTargets,
    arrangementPositions,
  };
}

describe("resolveClipDestinations", () => {
  describe("session destinations", () => {
    it("reads slots off toPath", () => {
      expect(
        resolveClipDestinations("t2/s1,t3/s0", undefined, false),
      ).toStrictEqual(
        sessionResult([
          { trackIndex: 2, sceneIndex: 1 },
          { trackIndex: 3, sceneIndex: 0 },
        ]),
      );
    });

    it("still reads the deprecated toSlot", () => {
      expect(
        resolveClipDestinations(undefined, "2/1, 3/0", false),
      ).toStrictEqual(
        sessionResult([
          { trackIndex: 2, sceneIndex: 1 },
          { trackIndex: 3, sceneIndex: 0 },
        ]),
      );
    });

    // A toSlot that names nothing reads as unset, so the caller is told what to
    // send — under the param they should be using, not the deprecated one.
    it("reads a toSlot that names no slot as omitted, and says so", () => {
      const warn = vi.spyOn(console, "warn");

      expect(() => resolveClipDestinations(undefined, ",", false)).toThrow(
        "clip requires toPath",
      );
      expect(warn).toHaveBeenCalledWith('toSlot "," names nothing');
    });

    // z.coerce.string() turns a JSON null into "null" before we see it, so a
    // caller unsetting toSlot must not read as naming a second destination.
    it("reads a coerced null alongside a real toPath as omitted", () => {
      expect(resolveClipDestinations("t2/s1", "null", false)).toStrictEqual(
        sessionResult([{ trackIndex: 2, sceneIndex: 1 }]),
      );
    });

    // The conflict check asks whether both params named a destination. A toSlot
    // of "," named none, so honoring toPath is not picking between two.
    it("honors toPath when toSlot names nothing", () => {
      expect(resolveClipDestinations("t2/s1", ",", false)).toStrictEqual(
        sessionResult([{ trackIndex: 2, sceneIndex: 1 }]),
      );
    });

    // A blank param names nothing, so it reads as omitted — which is what lets
    // toSlot: "" alongside a real toPath still honor the toPath.
    it("reads a blank destination param as omitted", () => {
      expect(() => resolveClipDestinations(undefined, "  ", false)).toThrow(
        "clip requires toPath",
      );

      expect(resolveClipDestinations("t2/s1", "  ", false)).toStrictEqual(
        sessionResult([{ trackIndex: 2, sceneIndex: 1 }]),
      );
    });
  });

  describe("arrangement destinations", () => {
    it("reads tracks off toPath", () => {
      expect(resolveClipDestinations("t2,t3", undefined, true)).toStrictEqual(
        arrangementResult(
          [
            { trackIndex: 2, takeLane: null },
            { trackIndex: 3, takeLane: null },
          ],
          [null, null],
        ),
      );
    });

    it("leaves the track list empty when toPath is omitted", () => {
      // Empty means the source clip's own track, resolved later against the clip.
      expect(resolveClipDestinations(undefined, undefined, true)).toStrictEqual(
        arrangementResult([], []),
      );
    });

    // toPath is where the copy goes; arrangementStart only says where on a
    // track. With no track named, the position has nothing to apply to.
    it("drops an arrangement position when toPath names only clip slots", () => {
      const warnSpy = vi.spyOn(console, "warn");

      expect(resolveClipDestinations("t2/s1", undefined, true)).toStrictEqual(
        sessionResult([{ trackIndex: 2, sceneIndex: 1 }]),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("arrangementStart ignored"),
      );
    });

    // The dropped slot stays in the list as a null. Name and color are counted
    // per requested destination, so removing it would hand the track the first
    // name — and a two-entry list collapsing to one stops splitting at all.
    it("drops the clip slots when toPath also names a track", () => {
      const warnSpy = vi.spyOn(console, "warn");

      expect(
        resolveClipDestinations("t2/s1,t3", undefined, true),
      ).toStrictEqual(
        arrangementResult(
          [null, { trackIndex: 3, takeLane: null }],
          [null, null],
        ),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('toPath "t2/s1" ignored'),
      );
    });

    // Same numbering as a list with no slots in it. Without it both "l+" key to
    // ordinal 0 and share one lane, against "each l+ appends its own lane".
    it("still numbers the new lanes when a dropped slot shares the list", () => {
      vi.spyOn(console, "warn");

      expect(
        resolveClipDestinations("t2/s1,t3/l+,t3/l+", undefined, true),
      ).toStrictEqual(
        arrangementResult(
          [
            null,
            { trackIndex: 3, takeLane: "new", newLaneOrdinal: 0 },
            { trackIndex: 3, takeLane: "new", newLaneOrdinal: 1 },
          ],
          [null, null, null],
        ),
      );
    });

    // Warn, don't throw: the same conflict on toPath drops the weaker of the
    // two, and toSlot shouldn't be the harsher spelling of the same mistake.
    it("drops the arrangement position when the deprecated toSlot names a slot", () => {
      const warnSpy = vi.spyOn(console, "warn");

      expect(resolveClipDestinations(undefined, "2/1", true)).toStrictEqual(
        sessionResult([{ trackIndex: 2, sceneIndex: 1 }]),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "arrangementStart ignored — toSlot names a clip slot",
        ),
      );
    });

    // The mirror case. Nothing names a clip slot, so arrangementStart is the
    // only destination left and it carries the call — where this used to refuse
    // the copy and ask for the deprecated param.
    it("honors the arrangement position when toSlot names nothing", () => {
      const warnSpy = vi.spyOn(console, "warn");

      expect(resolveClipDestinations(undefined, ",", true)).toStrictEqual(
        arrangementResult([], []),
      );
      expect(warnSpy).toHaveBeenCalledWith('toSlot "," names nothing');
    });
  });

  it("refuses when toPath and toSlot both name a destination", () => {
    // Honoring one and dropping the other is the silent-destination bug toPath
    // exists to end, so neither wins.
    expect(() => resolveClipDestinations("t2/s1", "3/0", false)).toThrow(
      "toPath and toSlot both name a destination; use toPath alone (toSlot is deprecated)",
    );
  });

  it("names both possibilities for a bare track with no position", () => {
    expect(() => resolveClipDestinations("t2", undefined, false)).toThrow(
      /"t2" names a track but not a spot on it.*a position for its arrangement, as "t2\[5\|1\]".*"t2\/s<scene>" for a clip slot/s,
    );
  });

  it("throws when nothing names a destination", () => {
    expect(() => resolveClipDestinations(undefined, undefined, false)).toThrow(
      'clip requires toPath — "t0/s1" for a clip slot, "t2[5|1]" for the arrangement',
    );
  });

  it("rejects a destination no clip can occupy", () => {
    expect(() => resolveClipDestinations("t1/d0", undefined, true)).toThrow(
      /clips go to a track \("t0"\), a take lane on it/,
    );
    expect(() => resolveClipDestinations("mt", undefined, true)).toThrow(
      /clips go to a track \("t0"\), a take lane on it/,
    );
  });
});

describe("warnInapplicableClipParams", () => {
  const session = resolveClipDestinations("t2/s1", undefined, false);
  const arrangement = resolveClipDestinations("t2", undefined, true);

  it("warns that a clip copy ignores count", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnInapplicableClipParams(arrangement, 3, undefined);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("count ignored for clips"),
    );
  });

  it("warns that a session copy ignores arrangementLength", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnInapplicableClipParams(session, 1, "4bar");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("arrangementLength ignored"),
    );
  });

  it("says nothing for params the copy actually uses", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnInapplicableClipParams(arrangement, 1, "4bar");
    warnInapplicableClipParams(session, 1, undefined);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("warnUnusedDestination", () => {
  it("says nothing for clips, which use both params", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnUnusedDestination("clip", "t2/s1", undefined);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when a track or scene is given a destination", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnUnusedDestination("scene", "t2", "2/1");

    expect(warnSpy).toHaveBeenCalledWith(
      'toPath ignored: only supported for clips, devices, drum pads and chains (type "scene")',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'toSlot ignored: only supported for clips (type "scene")',
    );
  });

  // toSlot is deprecated, so a caller dropping it may send the key as null.
  it("says nothing about a toSlot sent as null", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnUnusedDestination("scene", undefined, "null");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("leaves toPath alone for devices but still flags toSlot", () => {
    const warnSpy = vi.spyOn(console, "warn");

    warnUnusedDestination("device", "t1/d0", "2/1");

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("toPath ignored"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'toSlot ignored: only supported for clips (type "device")',
    );
  });
});
