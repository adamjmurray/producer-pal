// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  browserItemKind,
  misfitReason,
  nativeDeviceKind,
} from "../device-fit.ts";

describe("the kind of a device", () => {
  it.each([
    ["Operator", "instrument"],
    ["Arpeggiator", "midi-effect"],
    ["Compressor", "audio-effect"],
    ["Pro-Q 4", null],
  ])("reads a native name: %s", (name, kind) => {
    expect(nativeDeviceKind(name)).toBe(kind);
  });

  it.each([
    ["instrument", "instrument"],
    ["midi-effect", "midi-effect"],
    ["audio-effect", "audio-effect"],
    ["plugin", null],
    ["mfl-device", null],
    ["file", null],
  ])("reads a browser item's type: %s", (type, kind) => {
    expect(browserItemKind(type)).toBe(kind);
  });
});

// A return chain is a chain of its rack, not a track, so a mock that reads
// like an audio track must not make it one. It takes audio effects only,
// whatever its rack takes: Live refuses an instrument or MIDI effect there.
describe("a rack's return chain", () => {
  const RACK = "live_set tracks 0 devices 0";

  /**
   * Register a rack of the given type and a return chain on it, whose own
   * properties read like an audio track's.
   * @param rackType - The rack's `type`
   * @returns The return chain
   */
  function returnChainOf(rackType: number): LiveAPI {
    registerMockObject("rack", {
      path: RACK,
      properties: { type: rackType },
    });
    registerMockObject("return-chain", {
      path: `${RACK} return_chains 0`,
      type: "Chain",
      properties: { is_foldable: 0, has_midi_input: 0 },
    });

    return LiveAPI.from(`${RACK} return_chains 0`);
  }

  it("takes an audio effect", () => {
    expect(misfitReason("Reverb", "audio-effect", returnChainOf(1))).toBeNull();
  });

  it.each([
    ["Operator", "instrument", "an instrument"],
    ["Arpeggiator", "midi-effect", "a MIDI effect"],
  ] as const)("refuses %s in a Drum Rack's", (name, kind, what) => {
    expect(misfitReason(name, kind, returnChainOf(1))).toBe(
      `return chain t0/d0/rc0 (id return-chain) takes only audio effects; "${name}" is ${what}`,
    );
  });
});
