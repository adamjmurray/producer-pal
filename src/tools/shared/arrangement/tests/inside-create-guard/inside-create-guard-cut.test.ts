// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  duplicatingTrackMethods,
  mockContext,
  setupArrangementClip,
  setupClip,
  setupTrack,
} from "../helpers/arrangement-mock-objects.ts";
import { cutArrangementClipAt } from "../../arrangement-duplicate-workaround.ts";

describe("cutArrangementClipAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps both sides, the rest starting at the cut", () => {
    const existing = setupArrangementClip("200", 0, {
      start_time: 8,
      end_time: 20,
    });

    // What the copy to the holding area becomes.
    setupClip("400", {
      properties: { is_arrangement_clip: 1, start_time: 120, end_time: 132 },
    });

    const trackMock = setupTrack(0, {
      properties: { arrangement_clips: ["id", existing.id] },
      methods: duplicatingTrackMethods(),
    });

    cutArrangementClipAt(
      LiveAPI.from(trackMock.path),
      { id: "200", start: 8, end: 20 },
      12,
      true,
      mockContext,
    );

    // Copy to the holding area (furthest end 20 + 100).
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 200",
      120,
    );
    // Trim the copy to what follows the cut, and the original to what precedes it.
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 120, 4);
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 12, 8);
    // Bring the copy back to start at the cut.
    expect(trackMock.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 400",
      12,
    );
  });
});
