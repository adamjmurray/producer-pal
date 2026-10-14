// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { readOneClip } from "#src/tools/clip/read/read-clip.ts";
import { setupMidiClipMock } from "./read-clip-test-helpers.ts";

describe("readOneClip envs flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  /**
   * Read a clip that reports the given Live flags.
   * @param isArrangementClip - Live's is_arrangement_clip
   * @param hasEnvelopes - Live's has_envelopes
   * @returns The read result
   */
  function readClip(isArrangementClip: number, hasEnvelopes: number) {
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_arrangement_clip: isArrangementClip,
        has_envelopes: hasEnvelopes,
      },
    });

    return readOneClip({ trackIndex: 0, sceneIndex: 0 });
  }

  it("flags a session clip with envelopes", () => {
    expect(readClip(0, 1).envs).toBe(true);
  });

  it("omits the flag when a session clip has no envelopes", () => {
    expect(readClip(0, 0)).not.toHaveProperty("envs");
  });

  it("never flags an arrangement clip, even when Live reports envelopes", () => {
    expect(readClip(1, 1)).not.toHaveProperty("envs");
  });
});
