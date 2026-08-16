// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  resolveClipDestinations,
  warnInapplicableClipParams,
  warnUnusedDestination,
} from "./duplicate-destination-helpers.ts";

describe("resolveClipDestinations", () => {
  describe("session destinations", () => {
    it("reads slots off toPath", () => {
      expect(
        resolveClipDestinations("t2/s1,t3/s0", undefined, false),
      ).toStrictEqual({
        destination: "session",
        slots: [
          { trackIndex: 2, sceneIndex: 1 },
          { trackIndex: 3, sceneIndex: 0 },
        ],
        trackIndices: [],
      });
    });

    it("still reads the deprecated toSlot", () => {
      expect(
        resolveClipDestinations(undefined, "2/1, 3/0", false),
      ).toStrictEqual({
        destination: "session",
        slots: [
          { trackIndex: 2, sceneIndex: 1 },
          { trackIndex: 3, sceneIndex: 0 },
        ],
        trackIndices: [],
      });
    });

    it("throws when toSlot names no slot", () => {
      expect(() => resolveClipDestinations(undefined, ",", false)).toThrow(
        "duplicate failed: toSlot is required for session clips",
      );
    });

    // z.coerce.string() turns a JSON null into "null" before we see it, so a
    // caller unsetting toSlot must not read as naming a second destination.
    it("reads a coerced null alongside a real toPath as omitted", () => {
      expect(resolveClipDestinations("t2/s1", "null", false)).toStrictEqual({
        destination: "session",
        slots: [{ trackIndex: 2, sceneIndex: 1 }],
        trackIndices: [],
      });
    });

    // A blank param names nothing, so it reads as omitted — which is what lets
    // toSlot: "" alongside a real toPath still honor the toPath.
    it("reads a blank destination param as omitted", () => {
      expect(() => resolveClipDestinations(undefined, "  ", false)).toThrow(
        "duplicate failed: clip requires toPath",
      );

      expect(resolveClipDestinations("t2/s1", "  ", false)).toStrictEqual({
        destination: "session",
        slots: [{ trackIndex: 2, sceneIndex: 1 }],
        trackIndices: [],
      });
    });
  });

  describe("arrangement destinations", () => {
    it("reads tracks off toPath", () => {
      expect(resolveClipDestinations("t2,t3", undefined, true)).toStrictEqual({
        destination: "arrangement",
        slots: [],
        trackIndices: [2, 3],
      });
    });

    it("leaves the track list empty when toPath is omitted", () => {
      // Empty means the source clip's own track, resolved later against the clip.
      expect(resolveClipDestinations(undefined, undefined, true)).toStrictEqual(
        {
          destination: "arrangement",
          slots: [],
          trackIndices: [],
        },
      );
    });

    // toPath is where the copy goes; arrangementStart only says where on a
    // track. With no track named, the position has nothing to apply to.
    it("drops an arrangement position when toPath names only session slots", () => {
      const warnSpy = vi.spyOn(console, "warn");

      expect(resolveClipDestinations("t2/s1", undefined, true)).toStrictEqual({
        destination: "session",
        slots: [{ trackIndex: 2, sceneIndex: 1 }],
        trackIndices: [],
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("arrangementStart/locator ignored"),
      );
    });

    it("drops the session slots when toPath also names a track", () => {
      const warnSpy = vi.spyOn(console, "warn");

      expect(
        resolveClipDestinations("t2/s1,t3", undefined, true),
      ).toStrictEqual({
        destination: "arrangement",
        slots: [],
        trackIndices: [3],
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('toPath "t2/s1" ignored'),
      );
    });

    it("rejects the deprecated toSlot paired with an arrangement position", () => {
      expect(() => resolveClipDestinations(undefined, "2/1", true)).toThrow(
        /toSlot is for session destinations.*use toPath/s,
      );
    });
  });

  it("refuses when toPath and toSlot both name a destination", () => {
    // Honoring one and dropping the other is the silent-destination bug toPath
    // exists to end, so neither wins.
    expect(() => resolveClipDestinations("t2/s1", "3/0", false)).toThrow(
      "duplicate failed: toPath and toSlot both name a destination; use toPath alone (toSlot is deprecated)",
    );
  });

  it("names both possibilities for a bare track with no position", () => {
    expect(() => resolveClipDestinations("t2", undefined, false)).toThrow(
      /"t2" names a track but not a spot on it.*arrangementStart or locator for track 2's arrangement.*"t2\/s<scene>" for a session slot/s,
    );
  });

  it("throws when nothing names a destination", () => {
    expect(() => resolveClipDestinations(undefined, undefined, false)).toThrow(
      'duplicate failed: clip requires toPath ("t0/s1" for a session slot) or arrangementStart/locator (for the arrangement)',
    );
  });

  it("rejects a destination no clip can occupy", () => {
    expect(() => resolveClipDestinations("t1/d0", undefined, true)).toThrow(
      /clips go to a track \("t0"\) or a session slot/,
    );
    expect(() => resolveClipDestinations("mt", undefined, true)).toThrow(
      /clips go to a track \("t0"\) or a session slot/,
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
      'toPath ignored: only supported for clips and devices (type "scene")',
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
