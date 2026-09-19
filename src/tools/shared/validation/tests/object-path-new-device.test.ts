// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  requireClipPath,
  requireDeviceContainer,
  requireDevicePath,
} from "../helpers/object-paths.ts";
import { formatObjectPath, parseObjectPath } from "../object-path.ts";

describe('parseObjectPath, the "d+" that appends a device', () => {
  it("names the track the device goes on", () => {
    expect(parseObjectPath("t0/d+")).toStrictEqual({
      kind: "new-device",
      root: { kind: "track", trackIndex: 0 },
      segments: [],
    });
  });

  it("names the chain the device goes in", () => {
    expect(parseObjectPath("t0/d0/c1/d+")).toStrictEqual({
      kind: "new-device",
      root: { kind: "track", trackIndex: 0 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "chain", index: 1 },
      ],
    });
  });

  it.each([
    "rt0/d+",
    "mt/d+",
    "t0/d0/rc0/d+",
    "t0/d0/pC1/d+",
    "t0/d0/pC1/c1/d+",
  ])("round-trips %s", (path) => {
    expect(formatObjectPath(parseObjectPath(path))).toBe(path);
  });

  it.each([
    ["t0/d0/d+", "a device"],
    ["t0/inst/d+", "a device"],
  ])("refuses %s, since a device holds no devices", (path, noun) => {
    expect(() => parseObjectPath(path)).toThrow(
      `"d+" can't follow ${noun}; expected "c<index>", "rc<index>", or "p<note>"`,
    );
  });

  it("refuses anything after it, since the device it makes is the last one", () => {
    expect(() => parseObjectPath("t0/d+/c0")).toThrow(
      'invalid path "t0/d+/c0" - "d+" appends a new device, so nothing can follow it',
    );
  });

  // Each must be last, so no path can carry both.
  it("refuses a c+ after it", () => {
    expect(() => parseObjectPath("t0/d+/c+")).toThrow(
      '"d+" appends a new device, so nothing can follow it',
    );
  });
});

describe('narrowing a "d+" path', () => {
  it("is a place to put a device", () => {
    expect(
      requireDeviceContainer(parseObjectPath("t0/d0/c1/d+")),
    ).toStrictEqual({
      root: { kind: "track", trackIndex: 0 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "chain", index: 1 },
      ],
      appendsDevice: true,
    });
  });

  // A read or a property write needs a device that is already there, and the
  // refusal has to name the tools that would have made one.
  it("is refused where an existing object was wanted", () => {
    expect(() => requireDevicePath(parseObjectPath("t0/d+"))).toThrow(
      'invalid path "t0/d+" - "d+" appends a device, which only ' +
        "ppal-create-device, ppal-duplicate and ppal-update-device do; " +
        'name an existing device as "d<index>"',
    );
  });

  it("holds no clips", () => {
    expect(() => requireClipPath(parseObjectPath("t0/d+"))).toThrow(
      "device paths hold no clips",
    );
  });
});
