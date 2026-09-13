// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import {
  beginLiveApiBuildStats,
  liveApiBuildStats,
} from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  parseObjectPath,
  type CanonicalDeviceSegment,
  type DeviceSegment,
} from "#src/tools/shared/validation/object-path.ts";
import {
  resolveDeviceTypeSegments,
  type DeviceTypeResolution,
} from "../device-type-segments.ts";

const INST = LIVE_API_DEVICE_TYPE_INSTRUMENT;
const AFX = LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;
const MFX = LIVE_API_DEVICE_TYPE_MIDI_EFFECT;

/** Device positions, the shape a resolved path comes back as. */
const d = (...indices: number[]): CanonicalDeviceSegment[] =>
  indices.map((index) => ({ kind: "device", index }));

/**
 * Register a container holding devices of the given Live API types, in the
 * order Live keeps them: MIDI effects, then the instrument, then audio effects.
 * @param id - The container's object id, which also names its devices
 * @param types - One Live API `type` value per device
 * @param options - Where the container sits, and what kind of object it is
 */
function registerContainer(
  id: string,
  types: number[],
  options: {
    path?: PathLike;
    type?: "Chain" | "DrumChain";
    properties?: object;
  } = {},
): void {
  const ids = types.map((_, index) => `${id}-d${String(index)}`);

  registerMockObject(id, {
    ...options,
    properties: { ...options.properties, devices: children(...ids) },
  });

  for (const [index, type] of types.entries()) {
    registerMockObject(ids[index] as string, {
      type: "Device",
      properties: { type },
    });
  }
}

/**
 * Canonicalize a path the way the device tools do, through the real parse.
 * @param path - A device path
 * @param label - Param name the path came from
 * @returns The resolution
 */
function resolve(path: string, label = "path"): DeviceTypeResolution {
  const parsed = parseObjectPath(path);

  if (parsed.kind !== "device") {
    throw new Error(`"${path}" is not a device path`);
  }

  return resolveDeviceTypeSegments(parsed.root, parsed.segments, path, label);
}

/**
 * The one warning a failed resolution raised.
 * @returns The warning text
 */
function warning(): string {
  expect(capturedWarnings()).toHaveLength(1);

  return capturedWarnings()[0] as string;
}

describe("resolveDeviceTypeSegments", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("reads nothing when no segment names a device by type", () => {
    const parsed = parseObjectPath("t0/d1/c0/d2") as Extract<
      ReturnType<typeof parseObjectPath>,
      { kind: "device" }
    >;

    beginLiveApiBuildStats();

    const result = resolveDeviceTypeSegments(
      parsed.root,
      parsed.segments,
      "t0/d1/c0/d2",
    );

    // The fast path runs on every device path, so it must not touch Live.
    expect(liveApiBuildStats().resolved).toBe(0);
    expect(result.resolved).toBe(true);
    expect(result.segments).toBe(parsed.segments as DeviceSegment[]);
  });

  it("counts within the type, past the MIDI effects Live sorts in front", () => {
    registerContainer("track-0", [MFX, INST, AFX], { path: livePath.track(0) });

    expect(resolve("t0/mfx0").segments).toStrictEqual(d(0));
    expect(resolve("t0/inst").segments).toStrictEqual(d(1));
    expect(resolve("t0/afx0").segments).toStrictEqual(d(2));
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("indexes the n-th effect of its own type", () => {
    registerContainer("track-0", [MFX, MFX, INST, AFX, AFX], {
      path: livePath.track(0),
    });

    expect(resolve("t0/mfx1").segments).toStrictEqual(d(1));
    expect(resolve("t0/afx1").segments).toStrictEqual(d(4));
  });

  it("resolves inside a rack chain", () => {
    registerContainer("track-0", [INST], { path: livePath.track(0) });
    registerContainer("chain-1", [MFX, INST], {
      path: livePath.track(0).device(0).chain(1),
      type: "Chain",
    });

    expect(resolve("t0/d0/c1/inst").segments).toStrictEqual([
      ...d(0),
      { kind: "chain", index: 1 },
      ...d(1),
    ]);
  });

  it("resolves under a drum pad and under one of its layers", () => {
    registerMockObject("rack", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { chains: children("pad-a", "pad-b") },
    });
    registerContainer("pad-a", [MFX, INST], {
      type: "DrumChain",
      properties: { in_note: 36 },
    });
    registerContainer("pad-b", [INST, AFX], {
      type: "DrumChain",
      properties: { in_note: 36 },
    });

    const pad = { kind: "drum-pad", note: "C1" } as const;

    expect(resolve("t0/d0/pC1/inst").segments).toStrictEqual([
      ...d(0),
      pad,
      ...d(1),
    ]);
    expect(resolve("t0/d0/pC1/c1/inst").segments).toStrictEqual([
      ...d(0),
      pad,
      { kind: "chain", index: 1 },
      ...d(0),
    ]);
  });

  it("warns and names an index nothing occupies when there is no instrument", () => {
    registerContainer("track-0", [AFX], { path: livePath.track(0) });

    const result = resolve("t0/inst");

    expect(warning()).toBe(
      'path "t0/inst" names nothing: t0 has no instrument',
    );
    // One past the last device, so every consumer resolves it to nothing.
    expect(result).toStrictEqual({ segments: d(1), resolved: false });
  });

  it("warns with what the container does hold when an index is past the end", () => {
    registerContainer("track-0", [INST, AFX], { path: livePath.track(0) });

    expect(resolve("t0/afx1").resolved).toBe(false);
    expect(warning()).toBe(
      'path "t0/afx1" names nothing: t0 has 1 audio effect (afx0)',
    );
  });

  it("gives a range when the container holds more than one", () => {
    registerContainer("track-0", [AFX, AFX], { path: livePath.track(0) });

    resolve("t0/afx2");

    expect(warning()).toBe(
      'path "t0/afx2" names nothing: t0 has 2 audio effects (afx0-afx1)',
    );
  });

  it("says there are none of that type at all", () => {
    registerContainer("track-0", [INST], { path: livePath.track(0) });

    resolve("t0/mfx0");

    expect(warning()).toBe(
      'path "t0/mfx0" names nothing: t0 has no MIDI effects',
    );
  });

  it("says what return and main tracks hold, before counting anything", () => {
    registerContainer("return-0", [AFX], { path: livePath.returnTrack(0) });
    registerContainer("main", [AFX], { path: livePath.masterTrack() });

    expect(resolve("rt0/inst").resolved).toBe(false);
    expect(warning()).toBe(
      'path "rt0/inst" names nothing: return and main tracks hold only audio effects',
    );
    expect(resolve("mt/mfx0").resolved).toBe(false);
    expect(resolve("rt0/afx0").segments).toStrictEqual(d(0));
  });

  it("names the container when the container itself is missing", () => {
    mockNonExistentObjects();

    expect(resolve("t9/inst")).toStrictEqual({
      segments: d(0),
      resolved: false,
    });
    expect(warning()).toBe('path "t9/inst" names nothing: t9 does not exist');
  });

  it("spells a missing container the way the call did", () => {
    mockNonExistentObjects();
    resolve("t0/d3/c0/afx0");

    expect(warning()).toBe(
      'path "t0/d3/c0/afx0" names nothing: t0/d3/c0 does not exist',
    );
  });

  it("reports the param the path came from", () => {
    registerContainer("track-0", [AFX], { path: livePath.track(0) });
    resolve("t0/inst", "toPath");

    expect(warning()).toBe(
      'toPath "t0/inst" names nothing: t0 has no instrument',
    );
  });

  it("warns once for the path, not once per unresolvable segment", () => {
    registerContainer("track-0", [AFX], { path: livePath.track(0) });

    // The whole path already names nothing, so the segments below the miss have
    // nothing left to say — and nothing to resolve against either.
    expect(resolve("t0/inst/c0/afx0")).toStrictEqual({
      segments: [...d(1), { kind: "chain", index: 0 }, ...d(0)],
      resolved: false,
    });
    expect(warning()).toBe(
      'path "t0/inst/c0/afx0" names nothing: t0 has no instrument',
    );
  });
});
