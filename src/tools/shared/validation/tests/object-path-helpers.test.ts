// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { parseObjectPath, type ObjectPath } from "../object-path.ts";
import {
  namedHiddenPath,
  namedPath,
  parseObjectPathList,
  parseSessionSlotList,
  requireClipPath,
  requireDeviceContainer,
  requireDevicePath,
  requireSessionSlot,
  trackSegmentPath,
} from "../object-path-helpers.ts";

describe("parseObjectPathList", () => {
  it("parses a comma-separated list in order", () => {
    expect(parseObjectPathList("t7,t8/s1,t1/d0")).toStrictEqual([
      { kind: "track", trackIndex: 7 },
      { kind: "slot", trackIndex: 8, sceneIndex: 1 },
      {
        kind: "device",
        root: { kind: "track", trackIndex: 1 },
        segments: [{ kind: "device", index: 0 }],
      },
    ]);
  });

  it("tolerates whitespace around entries", () => {
    expect(parseObjectPathList(" t7 , t8 ")).toStrictEqual([
      { kind: "track", trackIndex: 7 },
      { kind: "track", trackIndex: 8 },
    ]);
  });

  it("returns an empty list for no input", () => {
    expect(parseObjectPathList(undefined)).toStrictEqual([]);
    expect(parseObjectPathList(null)).toStrictEqual([]);
    expect(parseObjectPathList("")).toStrictEqual([]);
    expect(parseObjectPathList("   ")).toStrictEqual([]);
  });

  // An empty list reads as "the source's own track" downstream, so a param that
  // was sent but names nothing must not quietly become one.
  it("throws for a list that was sent but names nothing", () => {
    for (const input of [",", " , , "]) {
      expect(() => parseObjectPathList(input)).toThrow(
        /it names no destination/,
      );
    }
  });

  it("throws on the first bad entry rather than skipping it", () => {
    expect(() => parseObjectPathList("t7,nope")).toThrow(
      /"nope" is not a track/,
    );
  });

  // What a JSON null arrives as. An empty list means the source's own track, so
  // reading it as omitted is a copy landing somewhere nobody asked for.
  it("throws for a coerced null instead of reading it as omitted", () => {
    expect(() => parseObjectPathList("null", "toPath")).toThrow(
      'invalid toPath "null" - "null" is not a track',
    );
  });

  // The list is cycled against a position list, so a dropped entry moves every
  // later copy onto the wrong track instead of just making one fewer.
  it("warns when it drops an empty entry", () => {
    const warn = vi.spyOn(console, "warn");

    expect(parseObjectPathList("t1,,t2", "toPath")).toStrictEqual([
      { kind: "track", trackIndex: 1 },
      { kind: "track", trackIndex: 2 },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('toPath "t1,,t2" has empty entries'),
    );

    warn.mockClear();
    parseObjectPathList("t1,t2", "toPath");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("requireClipPath", () => {
  it("passes tracks and slots through", () => {
    const track: ObjectPath = { kind: "track", trackIndex: 7 };
    const slot: ObjectPath = { kind: "slot", trackIndex: 7, sceneIndex: 2 };

    expect(requireClipPath(track)).toBe(track);
    expect(requireClipPath(slot)).toBe(slot);
  });

  // A device path's own message talks about chains and pads, which tells a clip
  // caller nothing about what to send instead.
  it("rejects everything a clip can't occupy, in clip terms", () => {
    const cases: [string, RegExp][] = [
      ["t1/d0", /device paths hold no clips/],
      ["rt0", /return and master tracks have no clips/],
      ["mt", /return and master tracks have no clips/],
      ["s3", /a scene alone names no track/],
      ["t0/l1", /take lanes are not a clip destination/],
      ["t0/l+", /take lanes are not a clip destination/],
    ];

    for (const [path, message] of cases) {
      expect(() => requireClipPath(parseObjectPath(path))).toThrow(message);
      expect(() => requireClipPath(parseObjectPath(path))).toThrow(
        /clips go to a track \("t0"\) or a session slot \("t0\/s1"\)/,
      );
    }
  });

  it("names the path in its canonical spelling, under the caller's label", () => {
    expect(() =>
      requireClipPath(parseObjectPath("mt/d0"), "destination"),
    ).toThrow(/invalid destination "mt\/d0"/);
  });
});

describe("requireSessionSlot", () => {
  it("returns the track and scene a slot names", () => {
    expect(requireSessionSlot(parseObjectPath("t7/s2"))).toStrictEqual({
      trackIndex: 7,
      sceneIndex: 2,
    });
  });

  it("rejects a bare track, which names no one clip", () => {
    expect(() => requireSessionSlot(parseObjectPath("t7"))).toThrow(
      /a track has no one clip; name a session position as "t<track>\/s<scene>" \(e\.g\., "t7\/s0"\)/,
    );
  });

  it("rejects a non-clip path in clip terms", () => {
    expect(() => requireSessionSlot(parseObjectPath("t1/d0"))).toThrow(
      /device paths hold no clips/,
    );
  });
});

describe("parseSessionSlotList", () => {
  it("parses a comma-separated list of slots", () => {
    expect(parseSessionSlotList("t0/s1,t2/s3")).toStrictEqual([
      { trackIndex: 0, sceneIndex: 1 },
      { trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("throws on the first entry that isn't a slot", () => {
    expect(() => parseSessionSlotList("t0/s1,t2")).toThrow(
      /a track has no one clip/,
    );
  });
});

describe("requireDeviceContainer", () => {
  it("passes tracks and device chains through", () => {
    expect(requireDeviceContainer(parseObjectPath("t0"))).toStrictEqual({
      root: { kind: "track", trackIndex: 0 },
      segments: [],
    });
    expect(requireDeviceContainer(parseObjectPath("rt1"))).toStrictEqual({
      root: { kind: "return-track", returnIndex: 1 },
      segments: [],
    });
    expect(requireDeviceContainer(parseObjectPath("mt"))).toStrictEqual({
      root: { kind: "master-track" },
      segments: [],
    });
    expect(requireDeviceContainer(parseObjectPath("t0/d1"))).toStrictEqual({
      root: { kind: "track", trackIndex: 0 },
      segments: [{ kind: "device", index: 1 }],
    });
  });

  it("rejects everything that can't hold a device", () => {
    const cases: [string, RegExp][] = [
      ["s3", /a scene holds no devices/],
      ["t0/s1", /a session slot holds no devices/],
      ["t0/l1", /a take lane holds no devices/],
    ];

    for (const [path, message] of cases) {
      expect(() => requireDeviceContainer(parseObjectPath(path))).toThrow(
        message,
      );
      expect(() => requireDeviceContainer(parseObjectPath(path))).toThrow(
        /devices live on a track \("t0"\) or down its device chain \("t0\/d0"\)/,
      );
    }
  });
});

describe("requireDevicePath", () => {
  it("passes a device chain through", () => {
    expect(requireDevicePath(parseObjectPath("t0/d1/c2"))).toStrictEqual({
      root: { kind: "track", trackIndex: 0 },
      segments: [
        { kind: "device", index: 1 },
        { kind: "chain", index: 2 },
      ],
    });
  });

  // The bug this grammar's one parser fixes: rt0 used to fall through to the
  // device parser, which answered with a message about device indices.
  it("rejects a bare track, naming the track the caller wrote", () => {
    expect(() => requireDevicePath(parseObjectPath("t0"))).toThrow(
      'invalid path "t0" - a track is not a device; add a device index (e.g. "t0/d0")',
    );
    expect(() => requireDevicePath(parseObjectPath("rt0"))).toThrow(
      'invalid path "rt0" - a track is not a device; add a device index (e.g. "rt0/d0")',
    );
    expect(() => requireDevicePath(parseObjectPath("mt"), "toPath")).toThrow(
      'invalid toPath "mt" - a track is not a device; add a device index (e.g. "mt/d0")',
    );
  });
});

describe("trackSegmentPath", () => {
  it("maps each track root onto its Live API path", () => {
    expect(trackSegmentPath({ kind: "track", trackIndex: 2 }).toString()).toBe(
      "live_set tracks 2",
    );
    expect(
      trackSegmentPath({ kind: "return-track", returnIndex: 1 }).toString(),
    ).toBe("live_set return_tracks 1");
    expect(trackSegmentPath({ kind: "master-track" }).toString()).toBe(
      "live_set master_track",
    );
  });
});

describe("namedPath", () => {
  it("reads a blank param as naming nothing", () => {
    expect(namedPath(undefined)).toBeUndefined();
    expect(namedPath("")).toBeUndefined();
    expect(namedPath("   ")).toBeUndefined();
  });

  // z.coerce.string() turns a JSON null into "null" before the handler sees it.
  // Reading that as "unset" is how a copy lands on the source's own track with
  // nothing said about it, so it has to reach the parser and fail there.
  it("keeps a coerced null so it fails to parse instead of reading as omitted", () => {
    expect(namedPath("null")).toBe("null");
    expect(namedPath("undefined")).toBe("undefined");
  });

  it("trims a param that names something", () => {
    expect(namedPath(" t7/s2 ")).toBe("t7/s2");
  });
});

describe("namedHiddenPath", () => {
  // A caller moving off toSlot may send null for it; that must not read as a
  // second destination alongside a real toPath.
  it("reads a coerced null as naming nothing", () => {
    expect(namedHiddenPath("null")).toBeUndefined();
    expect(namedHiddenPath("undefined")).toBeUndefined();
  });

  it("reads a blank param as naming nothing", () => {
    expect(namedHiddenPath(undefined)).toBeUndefined();
    expect(namedHiddenPath("")).toBeUndefined();
    expect(namedHiddenPath("   ")).toBeUndefined();
  });

  it("trims a param that names something", () => {
    expect(namedHiddenPath(" 2/1 ")).toBe("2/1");
  });
});
