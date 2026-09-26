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

describe('parseObjectPath, the "c+" that appends a chain', () => {
  it("names the rack the chain goes in", () => {
    expect(parseObjectPath("t0/d1/c+")).toStrictEqual({
      kind: "new-chain",
      root: { kind: "track", trackIndex: 0 },
      segments: [{ kind: "device", index: 1 }],
    });
  });

  it("names a drum pad, whose layers are chains too", () => {
    expect(parseObjectPath("t0/d0/pC1/c+")).toStrictEqual({
      kind: "new-chain",
      root: { kind: "track", trackIndex: 0 },
      segments: [
        { kind: "device", index: 0 },
        { kind: "drum-pad", note: "C1" },
      ],
    });
  });

  it.each([
    "rt0/d0/c+",
    "mt/d0/c+",
    "t0/inst/c+",
    "t0/d0/c1/d2/c+",
    "t0/d0/pC1/d0/c+",
  ])("round-trips %s", (path) => {
    expect(formatObjectPath(parseObjectPath(path))).toBe(path);
  });

  it("refuses a track, which has no chains", () => {
    expect(() => parseObjectPath("t0/c+")).toThrow(
      'invalid path "t0/c+" - "c+" can\'t follow a track',
    );
  });

  it.each([
    ["t0/d0/c0/c+", "a chain"],
    ["t0/d0/rc0/c+", "a return chain"],
  ])("refuses %s, which holds devices rather than chains", (path, noun) => {
    expect(() => parseObjectPath(path)).toThrow(
      `"c+" can't follow ${noun}; expected "d<index>"`,
    );
  });

  it("refuses anything after it, since the chain it makes is empty", () => {
    expect(() => parseObjectPath("t0/d0/c+/d0")).toThrow(
      'invalid path "t0/d0/c+/d0" - "c+" appends a new, empty chain, so nothing can follow it',
    );
  });
});

describe('narrowing a "c+" path', () => {
  it("is a place to put a device", () => {
    expect(requireDeviceContainer(parseObjectPath("t0/d1/c+"))).toStrictEqual({
      root: { kind: "track", trackIndex: 0 },
      segments: [{ kind: "device", index: 1 }],
      appendsChain: true,
    });
  });

  // A read or a property write needs a chain that is already there, and the
  // refusal has to name the tools that would have made one.
  it("is refused where an existing object was wanted", () => {
    expect(() => requireDevicePath(parseObjectPath("t0/d1/c+"))).toThrow(
      'invalid path "t0/d1/c+" - "c+" appends a chain, which only ' +
        "ppal-create-device, ppal-duplicate and ppal-update-device do; " +
        'name an existing chain as "c<index>"',
    );
  });

  it("holds no clips", () => {
    expect(() => requireClipPath(parseObjectPath("t0/d1/c+"))).toThrow(
      "device paths hold no clips",
    );
  });
});
