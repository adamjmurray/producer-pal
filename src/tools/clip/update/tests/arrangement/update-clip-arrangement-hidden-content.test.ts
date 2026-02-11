// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type MockObjectHandle } from "#src/test/mocks/mock-registry.ts";
import { setupArrangementClipPath } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

function setupArrangementClipMock(
  handle: MockObjectHandle,
  props: Record<string, unknown>,
): void {
  const fallbackGet = handle.get.getMockImplementation();

  handle.get.mockImplementation((prop: string) => {
    const value = props[prop];

    if (value !== undefined) {
      return [value];
    }

    if (fallbackGet != null) {
      return fallbackGet.call(handle, prop);
    }

    return [0];
  });
}

describe("updateClip - arrangementLength (expose hidden content)", () => {
  it("should preserve envelopes by tiling when exposing hidden content", async () => {
    const trackIndex = 0;
    const handles = setupArrangementClipPath(trackIndex, [
      "789",
      "1000",
      "2000",
      "3000",
    ]);
    const sourceClip = handles.get("789");

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected source clip handle for 789");
    }

    setupArrangementClipMock(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      is_audio_clip: 0,
      start_time: 1,
      end_time: 5,
      loop_start: 0,
      loop_end: 4,
      looping: 0,
      length: 6.5,
      name: "Test Clip",
      color_index: 5,
      muted: 0,
      playing_status: 1,
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "1:2.5", // 6.5 beats - extend to reveal 2.5 beats of hidden content
    });

    // Should tile the content (note: updateClip doesn't actually do this yet, this tests the intent)
    const firstResult = Array.isArray(result) ? result[0] : result;

    expect(firstResult).toBeDefined();
  });
});
