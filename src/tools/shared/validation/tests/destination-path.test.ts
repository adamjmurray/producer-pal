// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type DestinationPath,
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
  });

  it("throws on the first bad entry rather than skipping it", () => {
    expect(() => parseDestinationPathList("t7,nope")).toThrow(
      /"nope" is not a track/,
    );
  });
});

describe("parseTrackSegment", () => {
  it("reads each track kind", () => {
    expect(parseTrackSegment("t3")).toStrictEqual({
      kind: "track",
      trackIndex: 3,
    });
    expect(parseTrackSegment("rt1")).toStrictEqual({
      kind: "return-track",
      returnIndex: 1,
    });
    expect(parseTrackSegment("mt")).toStrictEqual({ kind: "master-track" });
  });

  it("defaults its label and input to the segment itself", () => {
    expect(() => parseTrackSegment("nope")).toThrow(
      'invalid path "nope" - "nope" is not a track',
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
