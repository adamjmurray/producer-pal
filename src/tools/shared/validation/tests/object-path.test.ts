// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  formatDeviceSegment,
  formatObjectPath,
  liveApiCollection,
  parseObjectPath,
} from "../object-path.ts";

describe("parseObjectPath", () => {
  it("reads every root", () => {
    expect(parseObjectPath("t7")).toStrictEqual({
      kind: "track",
      trackIndex: 7,
    });
    expect(parseObjectPath("rt1")).toStrictEqual({
      kind: "return-track",
      returnIndex: 1,
    });
    expect(parseObjectPath("mt")).toStrictEqual({ kind: "master-track" });
    expect(parseObjectPath("s3")).toStrictEqual({
      kind: "scene",
      sceneIndex: 3,
    });
  });

  it("reads a session slot", () => {
    expect(parseObjectPath("t7/s2")).toStrictEqual({
      kind: "slot",
      trackIndex: 7,
      sceneIndex: 2,
    });
    expect(parseObjectPath("t0/s0")).toStrictEqual({
      kind: "slot",
      trackIndex: 0,
      sceneIndex: 0,
    });
  });

  it("reads take lanes, indexed like the Live API", () => {
    // Track.take_lanes excludes the main lane, so l0 is the first take lane and
    // the segment index is the Live API index like every other segment.
    expect(parseObjectPath("t0/l0")).toStrictEqual({
      kind: "take-lane",
      trackIndex: 0,
      laneIndex: 0,
    });
    expect(parseObjectPath("t2/l1")).toStrictEqual({
      kind: "take-lane",
      trackIndex: 2,
      laneIndex: 1,
    });
    expect(parseObjectPath("t2/l+")).toStrictEqual({
      kind: "new-take-lane",
      trackIndex: 2,
    });
  });

  it("reads multi-digit indices, not just the first digit", () => {
    expect(parseObjectPath("t12/s34")).toStrictEqual({
      kind: "slot",
      trackIndex: 12,
      sceneIndex: 34,
    });
  });

  it("reads a device chain down to its segments", () => {
    expect(parseObjectPath("t1/d0")).toStrictEqual({
      kind: "device",
      root: { kind: "track", trackIndex: 1 },
      segments: [{ kind: "device", index: 0 }],
    });
    expect(parseObjectPath("mt/d0/c1/d2")).toStrictEqual({
      kind: "device",
      root: { kind: "master-track" },
      segments: [
        { kind: "device", index: 0 },
        { kind: "chain", index: 1 },
        { kind: "device", index: 2 },
      ],
    });
    expect(parseObjectPath("rt0/d0/rc1")).toStrictEqual({
      kind: "device",
      root: { kind: "return-track", returnIndex: 0 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "return-chain", index: 1 },
      ],
    });
  });

  it("keeps a drum pad's note rather than an index", () => {
    // Live indexes drum_pads by MIDI note, the one place a segment isn't a
    // Live API index. Note validity is the resolver's problem, not the parser's.
    expect(parseObjectPath("t1/d0/pF#2")).toStrictEqual({
      kind: "device",
      root: { kind: "track", trackIndex: 1 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "drum-pad", note: "F#2" },
      ],
    });
    expect(parseObjectPath("t1/d0/p*")).toStrictEqual({
      kind: "device",
      root: { kind: "track", trackIndex: 1 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "drum-pad", note: "*" },
      ],
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseObjectPath("  t7/s2  ")).toStrictEqual({
      kind: "slot",
      trackIndex: 7,
      sceneIndex: 2,
    });
  });

  it("rejects an empty path", () => {
    expect(() => parseObjectPath("")).toThrow("invalid path: path is empty");
    expect(() => parseObjectPath("   ")).toThrow("invalid path: path is empty");
  });

  // Every caller goes through z.coerce.string(), but the guard is what keeps a
  // non-string from reaching .split() and throwing something less useful.
  it("rejects a non-string path", () => {
    expect(() => parseObjectPath(null as unknown as string)).toThrow(
      "invalid path: path is empty",
    );
    expect(() => parseObjectPath(123 as unknown as string)).toThrow(
      "invalid path: path is empty",
    );
  });

  it("rejects a stray slash instead of reading it as a device path", () => {
    for (const path of ["t1/", "/t1", "t1//d0", "/"]) {
      expect(() => parseObjectPath(path)).toThrow(
        /has an empty segment; drop the stray "\/"/,
      );
    }
  });

  it("rejects a root that names nothing", () => {
    expect(() => parseObjectPath("x0/d0")).toThrow(
      /"x0" is not a track or scene; expected "t<index>", "rt<index>", "mt", or "s<index>"/,
    );
    // "t" with no index used to parse as track NaN
    expect(() => parseObjectPath("t")).toThrow(/"t" is not a track or scene/);
    expect(() => parseObjectPath("rt/d0")).toThrow(/"rt" is not a track/);
    expect(() => parseObjectPath("track0")).toThrow(/"track0" is not a track/);
  });

  it("rejects a scene segment anywhere a slot can't be", () => {
    for (const path of ["rt0/s1", "mt/s1", "t0/d0/s1", "t0/s1/d0"]) {
      expect(() => parseObjectPath(path)).toThrow(
        /a session slot is "t<track>\/s<scene>"/,
      );
    }
  });

  it("rejects a take lane anywhere a track's lanes can't be", () => {
    for (const path of ["rt0/l1", "mt/l+", "t0/d0/l1", "t0/l1/d0"]) {
      expect(() => parseObjectPath(path)).toThrow(
        /a take lane is "t<track>\/l<lane>"/,
      );
    }
  });

  it("rejects parts under a scene", () => {
    expect(() => parseObjectPath("s0/t1")).toThrow(/a scene has no parts/);
  });

  it("rejects a device segment that names nothing", () => {
    for (const path of ["t1/dabc", "t1/d-1", "t0/d0/cabc", "t0/d0/rcx"]) {
      expect(() => parseObjectPath(path)).toThrow(
        /is not a device, chain, or drum pad/,
      );
    }
  });

  it("rejects a drum pad with no note", () => {
    expect(() => parseObjectPath("t1/d0/p")).toThrow(
      /"p" is not a device, chain, or drum pad/,
    );
  });

  it("uses the caller's label in messages", () => {
    expect(() => parseObjectPath("x9", "toPath")).toThrow(
      /invalid toPath "x9"/,
    );
    expect(() => parseObjectPath("", "toPath")).toThrow(
      "invalid toPath: path is empty",
    );
  });

  describe("the spellings results used before 2.2.0", () => {
    // A model pasting back what a result told it made a well-founded guess, so
    // honor it and warn — the same trade already taken on hidden params.
    it("reads trackIndex/sceneIndex as a session slot", () => {
      const warn = vi.spyOn(console, "warn");

      expect(parseObjectPath("0/3")).toStrictEqual({
        kind: "slot",
        trackIndex: 0,
        sceneIndex: 3,
      });
      expect(warn).toHaveBeenCalledWith(
        'path "0/3" is the old slot spelling; use "t0/s3"',
      );
    });

    it("reads a bare index as a track", () => {
      const warn = vi.spyOn(console, "warn");

      expect(parseObjectPath("7", "toPath")).toStrictEqual({
        kind: "track",
        trackIndex: 7,
      });
      expect(warn).toHaveBeenCalledWith(
        'toPath "7" is a bare track index; use "t7"',
      );
    });

    // Three numbers were never a spelling of anything, so there's nothing to
    // guess at — it takes the ordinary root error.
    it("does not tolerate a third index", () => {
      expect(() => parseObjectPath("0/1/2")).toThrow(/"0" is not a track/);
    });
  });
});

describe("formatObjectPath", () => {
  it("round-trips every shape the grammar accepts", () => {
    const paths = [
      "t7",
      "rt1",
      "mt",
      "s3",
      "t7/s2",
      "t0/l0",
      "t2/l+",
      "t1/d0",
      "mt/d0/c1/d2",
      "rt0/d0/rc1",
      "t1/d0/pF#2",
      "t1/d0/p*/d0",
    ];

    for (const path of paths) {
      expect(formatObjectPath(parseObjectPath(path))).toBe(path);
    }
  });

  // Which is how a tolerated legacy value comes back out as the spelling we
  // want the caller using.
  it("renders a tolerated legacy value in the new spelling", () => {
    expect(formatObjectPath(parseObjectPath("0/3"))).toBe("t0/s3");
    expect(formatObjectPath(parseObjectPath("7"))).toBe("t7");
  });
});

describe("formatDeviceSegment", () => {
  it("renders each segment kind", () => {
    expect(formatDeviceSegment({ kind: "device", index: 2 })).toBe("d2");
    expect(formatDeviceSegment({ kind: "chain", index: 0 })).toBe("c0");
    expect(formatDeviceSegment({ kind: "return-chain", index: 1 })).toBe("rc1");
    expect(formatDeviceSegment({ kind: "drum-pad", note: "C1" })).toBe("pC1");
  });
});

describe("liveApiCollection", () => {
  it("names the Live API collection each segment indexes into", () => {
    expect(liveApiCollection({ kind: "device", index: 0 })).toBe("devices");
    expect(liveApiCollection({ kind: "chain", index: 0 })).toBe("chains");
    expect(liveApiCollection({ kind: "return-chain", index: 0 })).toBe(
      "return_chains",
    );
  });
});
