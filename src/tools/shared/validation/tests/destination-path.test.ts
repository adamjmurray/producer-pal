// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type DestinationPath,
  namedDeprecatedDestination,
  namedDestination,
  parseDestinationPath,
  parseDestinationPathList,
  parseTrackSegment,
  requireClipDestination,
} from "../destination-path.ts";

describe("parseDestinationPath", () => {
  it("reads a bare track", () => {
    expect(parseDestinationPath("t7")).toStrictEqual({
      kind: "track",
      trackIndex: 7,
    });
    expect(parseDestinationPath("t0")).toStrictEqual({
      kind: "track",
      trackIndex: 0,
    });
  });

  it("reads a session slot", () => {
    expect(parseDestinationPath("t7/s2")).toStrictEqual({
      kind: "slot",
      trackIndex: 7,
      sceneIndex: 2,
    });
    expect(parseDestinationPath("t0/s0")).toStrictEqual({
      kind: "slot",
      trackIndex: 0,
      sceneIndex: 0,
    });
  });

  it("reads multi-digit indices, not just the first digit", () => {
    expect(parseDestinationPath("t12/s34")).toStrictEqual({
      kind: "slot",
      trackIndex: 12,
      sceneIndex: 34,
    });
  });

  it("passes device paths through untouched", () => {
    const devicePaths = [
      "t1/d0",
      "t0/d0/c1",
      "t0/d0/pC1",
      "t0/d0/c0/d1",
      "rt0",
      "rt0/d0",
      "mt",
      "mt/d0",
    ];

    for (const path of devicePaths) {
      expect(parseDestinationPath(path)).toStrictEqual({
        kind: "device",
        path,
      });
    }
  });

  it("trims surrounding whitespace", () => {
    expect(parseDestinationPath("  t7/s2  ")).toStrictEqual({
      kind: "slot",
      trackIndex: 7,
      sceneIndex: 2,
    });
    expect(parseDestinationPath("  t1/d0  ")).toStrictEqual({
      kind: "device",
      path: "t1/d0",
    });
  });

  it("rejects an empty path", () => {
    expect(() => parseDestinationPath("")).toThrow(
      "invalid toPath: path is empty",
    );
    expect(() => parseDestinationPath("   ")).toThrow(
      "invalid toPath: path is empty",
    );
  });

  it("steers the old unprefixed toSlot form to the new spelling", () => {
    // A model that half-remembers toSlot will send "0/1"; the error has to name
    // the replacement instead of just saying no.
    expect(() => parseDestinationPath("0/1")).toThrow(
      /did you mean "t0\/s1"\?/,
    );
    expect(() => parseDestinationPath("7")).toThrow(/did you mean "t7"\?/);
  });

  it("rejects a stray slash instead of reading it as a device path", () => {
    for (const path of ["t1/", "/t1", "t1//d0"]) {
      expect(() => parseDestinationPath(path)).toThrow(
        /has an empty segment; drop the stray "\/"/,
      );
    }
  });

  it("rejects a segment that names no track", () => {
    expect(() => parseDestinationPath("x0/d0")).toThrow(
      /"x0" is not a track; expected "t<index>", "rt<index>", or "mt"/,
    );
    // "t" with no index used to parse as track NaN
    expect(() => parseDestinationPath("t")).toThrow(/"t" is not a track/);
    expect(() => parseDestinationPath("rt/d0")).toThrow(/"rt" is not a track/);
  });

  it("rejects a scene segment anywhere a slot can't be", () => {
    const bad = ["rt0/s1", "mt/s1", "t0/d0/s1", "t0/s1/d0"];

    for (const path of bad) {
      expect(() => parseDestinationPath(path)).toThrow(
        /a session slot is "t<track>\/s<scene>"/,
      );
    }
  });

  it("uses the caller's label in messages", () => {
    expect(() => parseDestinationPath("x9", "path")).toThrow(
      /invalid path "x9"/,
    );
  });
});

describe("parseDestinationPathList", () => {
  it("parses a comma-separated list in order", () => {
    expect(parseDestinationPathList("t7,t8/s1,t1/d0")).toStrictEqual([
      { kind: "track", trackIndex: 7 },
      { kind: "slot", trackIndex: 8, sceneIndex: 1 },
      { kind: "device", path: "t1/d0" },
    ]);
  });

  it("tolerates whitespace around entries", () => {
    expect(parseDestinationPathList(" t7 , t8 ")).toStrictEqual([
      { kind: "track", trackIndex: 7 },
      { kind: "track", trackIndex: 8 },
    ]);
  });

  it("returns an empty list for no input", () => {
    expect(parseDestinationPathList(undefined)).toStrictEqual([]);
    expect(parseDestinationPathList(null)).toStrictEqual([]);
    expect(parseDestinationPathList("")).toStrictEqual([]);
    expect(parseDestinationPathList("   ")).toStrictEqual([]);
  });

  // An empty list reads as "the source's own track" downstream, so a param that
  // was sent but names nothing must not quietly become one.
  it("throws for a list that was sent but names nothing", () => {
    for (const input of [",", " , , "]) {
      expect(() => parseDestinationPathList(input)).toThrow(
        /it names no destination/,
      );
    }
  });

  it("throws on the first bad entry rather than skipping it", () => {
    expect(() => parseDestinationPathList("t7,nope")).toThrow(
      /"nope" is not a track/,
    );
  });

  // What a JSON null arrives as. An empty list means the source's own track, so
  // reading it as omitted is a copy landing somewhere nobody asked for.
  it("throws for a coerced null instead of reading it as omitted", () => {
    expect(() => parseDestinationPathList("null")).toThrow(
      'invalid toPath "null" - "null" is not a track',
    );
  });

  // The list is cycled against a position list, so a dropped entry moves every
  // later copy onto the wrong track instead of just making one fewer.
  it("warns when it drops an empty entry", () => {
    const warn = vi.spyOn(console, "warn");

    expect(parseDestinationPathList("t1,,t2")).toStrictEqual([
      { kind: "track", trackIndex: 1 },
      { kind: "track", trackIndex: 2 },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('toPath "t1,,t2" has empty entries'),
    );

    warn.mockClear();
    parseDestinationPathList("t1,t2");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("parseTrackSegment", () => {
  it("reads each track kind", () => {
    expect(parseTrackSegment("t3", "toPath")).toStrictEqual({
      kind: "track",
      trackIndex: 3,
    });
    expect(parseTrackSegment("rt1", "toPath")).toStrictEqual({
      kind: "return-track",
      returnIndex: 1,
    });
    expect(parseTrackSegment("mt", "toPath")).toStrictEqual({
      kind: "master-track",
    });
  });

  // The label has no default, so a caller can't inherit another param's name.
  it("names the caller's param, and defaults its input to the segment", () => {
    expect(() => parseTrackSegment("nope", "toPath")).toThrow(
      'invalid toPath "nope" - "nope" is not a track',
    );
  });
});

describe("requireClipDestination", () => {
  it("passes tracks and slots through", () => {
    const track: DestinationPath = { kind: "track", trackIndex: 7 };
    const slot: DestinationPath = {
      kind: "slot",
      trackIndex: 7,
      sceneIndex: 2,
    };

    expect(requireClipDestination(track)).toBe(track);
    expect(requireClipDestination(slot)).toBe(slot);
  });

  it("rejects a device destination with a clip-shaped message", () => {
    // The device parser's own message talks about chains and pads, which tells a
    // clip caller nothing about what to send instead.
    expect(() =>
      requireClipDestination({ kind: "device", path: "t1/d0" }),
    ).toThrow(/clips go to a track \("t0"\) or a session slot \("t0\/s1"\)/);
  });

  it("uses the caller's label", () => {
    expect(() =>
      requireClipDestination({ kind: "device", path: "mt" }, "destination"),
    ).toThrow(/invalid destination "mt"/);
  });
});

describe("namedDestination", () => {
  it("reads a blank param as naming nothing", () => {
    expect(namedDestination(undefined)).toBeUndefined();
    expect(namedDestination("")).toBeUndefined();
    expect(namedDestination("   ")).toBeUndefined();
  });

  // z.coerce.string() turns a JSON null into "null" before the handler sees it.
  // Reading that as "unset" is how a copy lands on the source's own track with
  // nothing said about it, so it has to reach the parser and fail there.
  it("keeps a coerced null so it fails to parse instead of reading as omitted", () => {
    expect(namedDestination("null")).toBe("null");
    expect(namedDestination("undefined")).toBe("undefined");
  });

  it("trims a param that names something", () => {
    expect(namedDestination(" t7/s2 ")).toBe("t7/s2");
  });
});

describe("namedDeprecatedDestination", () => {
  // A caller moving off toSlot may send null for it; that must not read as a
  // second destination alongside a real toPath.
  it("reads a coerced null as naming nothing", () => {
    expect(namedDeprecatedDestination("null")).toBeUndefined();
    expect(namedDeprecatedDestination("undefined")).toBeUndefined();
  });

  it("reads a blank param as naming nothing", () => {
    expect(namedDeprecatedDestination(undefined)).toBeUndefined();
    expect(namedDeprecatedDestination("")).toBeUndefined();
    expect(namedDeprecatedDestination("   ")).toBeUndefined();
  });

  it("trims a param that names something", () => {
    expect(namedDeprecatedDestination(" 2/1 ")).toBe("2/1");
  });
});
