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

  it("reads a clip slot", () => {
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

  it("reads the roots that name something to create", () => {
    expect(parseObjectPath("t+")).toStrictEqual({ kind: "new-track" });
    expect(parseObjectPath("rt+")).toStrictEqual({ kind: "new-return-track" });
    expect(parseObjectPath("s+")).toStrictEqual({ kind: "new-scene" });
  });

  it("refuses a tail under a root that names something to create", () => {
    expect(() => parseObjectPath("t+/s0")).toThrow(
      'invalid path "t+/s0" - a new track has no parts yet',
    );
    expect(() => parseObjectPath("rt+/d0")).toThrow(
      'invalid path "rt+/d0" - a new return track has no parts yet',
    );
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
    // Live API index. "*" is the catch-all pad.
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

  it("rejects a root named after an Object prototype member", () => {
    // The "+" roots used to sit in a plain object, so looking one up answered
    // "constructor" and "toString" from the prototype. The bogus value came
    // back as if it were a parsed root, and the caller's input vanished from
    // the error every consumer went on to throw.
    for (const segment of ["constructor", "toString", "hasOwnProperty"]) {
      expect(() => parseObjectPath(segment)).toThrow(
        new RegExp(`"${segment}" is not a track or scene`),
      );
    }
  });

  it("rejects a scene segment anywhere a slot can't be", () => {
    for (const path of ["rt0/s1", "mt/s1", "t0/d0/s1", "t0/s1/d0"]) {
      expect(() => parseObjectPath(path)).toThrow(
        /a clip slot is "t<track>\/s<scene>"/,
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

  // Every segment pattern is anchored at both ends. Unanchored, "l1x" reads as
  // lane 1 and the junk vanishes — so a typo silently lands somewhere the
  // caller never named, which is worse than being told the path is wrong.
  it("rejects trailing junk after an indexed segment", () => {
    for (const path of [
      "t0x",
      "rt0x",
      "s0x",
      "t0/s0x",
      "t0/l1x",
      "t0/d0x",
      "t0/d0/c0x",
      "t0/d0/rc0x",
    ]) {
      expect(() => parseObjectPath(path)).toThrow(/invalid path/);
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

  // Live has no pad for a note it can't read, so "pizza" and "p36" address
  // nothing. Caught here because the read and write paths fail differently
  // otherwise — one throws, the other warn-skips about the rack.
  it("rejects a drum pad whose note is unparseable", () => {
    for (const path of ["t1/d0/pizza", "t1/d0/p36", "t1/d0/pH2", "t1/d0/pC9"]) {
      expect(() => parseObjectPath(path)).toThrow(
        /names no drum pad; use a note name \(e\.g\. "pC1"\), or "p\*" for the catch-all pad/,
      );
    }
  });

  it("accepts an enharmonic drum pad note", () => {
    // Pads are keyed by MIDI note, so "pE#1" names the same pad as "pF1". The
    // segment keeps the spelling as written; the lookup resolves it later.
    expect(parseObjectPath("t1/d0/pE#1")).toStrictEqual({
      kind: "device",
      root: { kind: "track", trackIndex: 1 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "drum-pad", note: "E#1" },
      ],
    });
  });

  // A path has to nest the way Live does, or it parses and then fails later as
  // a missing object — which reads as "your rack is wrong", not "your path is".
  it("rejects a segment that can't follow the one before it", () => {
    const cases: [string, RegExp][] = [
      ["t0/c0", /"c0" can't follow a track; expected "d<index>"/],
      ["mt/rc0", /"rc0" can't follow a track/],
      ["t0/pC1", /"pC1" can't follow a track/],
      [
        "t0/d0/d1",
        /"d1" can't follow a device; expected "c<index>", "rc<index>", or "p<note>"/,
      ],
      ["t0/d0/c0/c1", /"c1" can't follow a chain; expected "d<index>"/],
      ["t0/d0/rc0/rc1", /"rc1" can't follow a return chain/],
      [
        "t0/d0/pC1/rc0",
        /"rc0" can't follow a drum pad; expected "c<index>" or "d<index>"/,
      ],
    ];

    for (const [path, message] of cases) {
      expect(() => parseObjectPath(path)).toThrow(message);
    }
  });

  it("accepts every nesting Live actually has", () => {
    for (const path of [
      "t0/d0",
      "t0/d0/c1/d2",
      "t0/d0/rc0/d1",
      "t0/d0/pC1",
      "t0/d0/pC1/d0",
      "t0/d0/pC1/c1/d0",
      "t0/d0/p*/c0/d0/pD1/d0",
    ]) {
      expect(() => parseObjectPath(path)).not.toThrow();
    }
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
    it("reads trackIndex/sceneIndex as a clip slot", () => {
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
      "t+",
      "rt+",
      "s+",
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

describe("parseObjectPath - the [song position] coordinate", () => {
  it("hangs a position off each arrangement lane", () => {
    expect(parseObjectPath("t0[5|1]")).toStrictEqual({
      kind: "arrangement-position",
      lane: { kind: "track", trackIndex: 0 },
      position: "5|1",
    });
    expect(parseObjectPath("t0/l1[5|1]")).toStrictEqual({
      kind: "arrangement-position",
      lane: { kind: "take-lane", trackIndex: 0, laneIndex: 1 },
      position: "5|1",
    });
    expect(parseObjectPath("t0/l+[5|1]")).toStrictEqual({
      kind: "arrangement-position",
      lane: { kind: "new-take-lane", trackIndex: 0 },
      position: "5|1",
    });
  });

  it("leaves the lane open for a bare coordinate", () => {
    expect(parseObjectPath("[5|1]")).toStrictEqual({
      kind: "arrangement-position",
      lane: null,
      position: "5|1",
    });
  });

  // The position is kept as written: what it means is the resolver's job, and
  // a result always spells it back as bar|beat.
  it.each([
    ["a locator", "loc:Verse"],
    ["a locator id", "loc:locator-0"],
    ["a name holding both separators", "loc:A, B/C"],
    ["a note-value offset", "1|1-n/4"],
  ])("keeps %s verbatim", (_label, position) => {
    expect(parseObjectPath(`t0[${position}]`)).toStrictEqual({
      kind: "arrangement-position",
      lane: { kind: "track", trackIndex: 0 },
      position,
    });
  });

  // Only a regular track's arrangement has a timeline to sit on.
  it.each([
    ["a return track", "rt0[5|1]"],
    ["the main track", "mt[5|1]"],
    ["a scene", "s3[5|1]"],
    ["a clip slot", "t0/s3[5|1]"],
    ["a device", "t0/d0[5|1]"],
    ["a track that does not exist yet", "t+[5|1]"],
  ])("refuses a position on %s", (_label, path) => {
    expect(() => parseObjectPath(path)).toThrow(
      "a song position needs an arrangement lane",
    );
  });

  it.each([
    ["an empty coordinate", "t0[]", 'its "[]" names no position'],
    ["an unclosed bracket", "t0[5|1", 'its "[" is never closed'],
    ["a stray closer", "t0 5|1]", 'it closes a "[" it never opened'],
  ])("refuses %s", (_label, path, problem) => {
    expect(() => parseObjectPath(path)).toThrow(problem);
  });

  it("round-trips every shape", () => {
    for (const path of ["t0[5|1]", "t0/l1[5|1]", "t0/l+[5|1]", "[loc:Verse]"]) {
      expect(formatObjectPath(parseObjectPath(path))).toBe(path);
    }
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
