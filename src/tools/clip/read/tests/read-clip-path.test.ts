// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { setupMidiClipMock } from "./read-clip-test-helpers.ts";

describe("readClip path param", () => {
  it("reads the clip at a session position", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    const result = readClip({ path: "t1/s1" });

    expect(result.name).toBe("Test Clip");
  });

  // A track holds one clip per scene, so a path without a scene names nothing
  // in particular.
  it("rejects a bare track path", () => {
    expect(() => readClip({ path: "t1" })).toThrow(
      'invalid path "t1" - a track has no one clip',
    );
  });

  // What results said before 2.2.0, so a model pasting one back made a
  // well-founded guess: honor it, and warn to teach the spelling.
  it("honors the old unprefixed spelling, with a warning", () => {
    const warn = vi.spyOn(console, "warn");

    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ path: "1/1" }).name).toBe("Test Clip");
    expect(warn).toHaveBeenCalledWith(
      'path "1/1" is the old slot spelling; use "t1/s1"',
    );
  });

  it("still reads via the deprecated slot", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ slot: "1/1" }).name).toBe("Test Clip");
  });

  // The alias read-clip already accepted undeclared, now a real hidden param.
  it("reads via the trackIndex/sceneIndex fallback", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "Test Clip" },
    });

    expect(readClip({ trackIndex: 1, sceneIndex: 1 }).name).toBe("Test Clip");
  });

  it("prefers path over the params it replaced", () => {
    setupMidiClipMock({
      trackIndex: 1,
      sceneIndex: 1,
      clipProps: { name: "From path" },
    });
    setupMidiClipMock({
      trackIndex: 2,
      sceneIndex: 3,
      clipProps: { name: "From slot" },
    });

    expect(readClip({ path: "t1/s1", slot: "2/3" }).name).toBe("From path");
  });
});
