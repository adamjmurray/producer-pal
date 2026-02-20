// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockContext,
  setupArrangementClip,
  setupClip,
  setupTrack,
} from "./arrangement-tiling-test-helpers.ts";
import {
  clearClipAtDuplicateTarget,
  setArrangementDuplicateCrashWorkaround,
} from "../arrangement-tiling.ts";

beforeEach(() => {
  vi.clearAllMocks();
  setArrangementDuplicateCrashWorkaround(true);
});

afterEach(() => {
  setArrangementDuplicateCrashWorkaround(true);
});

describe("clearClipAtDuplicateTarget", () => {
  it("does nothing when source is a session clip", () => {
    setupClip("100", {
      properties: {
        is_arrangement_clip: 0,
      },
    });
    const trackMock = setupTrack(0);

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      0,
      true,
      mockContext,
    );

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("does nothing when no arrangement clip overlaps target range", () => {
    // Source: 4 beats long (start_time=8, end_time=12), target position=0
    // Target range: 0 to 4. Existing clip at 16-20 doesn't overlap.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 8,
        end_time: 12,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 16,
      end_time: 20,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      0,
      true,
      mockContext,
    );

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("creates temp clip when existing clip starts at target position", () => {
    // Source: 4 beats long, target position=8
    // Target range: 8 to 12. Existing clip at 8-12 overlaps.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 16,
        end_time: 20,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 8,
      end_time: 12,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
      methods: {
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    // Temp clip uses the source's arrangement length (4 beats)
    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
    expect(trackMock.call).toHaveBeenCalledWith("delete_clip", "id 300");
  });

  it("creates temp clip when existing clip partially overlaps target range", () => {
    // Source: 4 beats long (start_time=20, end_time=24), target position=8
    // Target range: 8 to 12. Existing clip at 10-14 partially overlaps.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 20,
        end_time: 24,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 10,
      end_time: 14,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
      methods: {
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
  });

  it("does nothing when existing clip ends exactly at target position", () => {
    // Source: 4 beats long (start_time=20, end_time=24), target position=8
    // Target range: 8 to 12. Existing clip at 4-8 ends at target start (no overlap).
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 20,
        end_time: 24,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 4,
      end_time: 8,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      8,
      true,
      mockContext,
    );

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("does nothing when workaround is disabled", () => {
    setArrangementDuplicateCrashWorkaround(false);

    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 4,
      },
    });

    const existingClip = setupArrangementClip("200", 0, {
      start_time: 0,
      end_time: 4,
    });

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", existingClip.id],
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      0,
      true,
      mockContext,
    );

    expect(trackMock.call).not.toHaveBeenCalled();
  });

  it("checks multiple arrangement clips for overlap", () => {
    // Source: 4 beats long, target position=16
    // Target range: 16 to 20. Clip1 at 0-4 doesn't overlap, clip2 at 16-20 does.
    setupClip("100", {
      properties: {
        is_arrangement_clip: 1,
        start_time: 24,
        end_time: 28,
      },
    });

    const clip1 = setupArrangementClip("200", 0, {
      start_time: 0,
      end_time: 4,
    });

    const clip2 = setupArrangementClip(
      "201",
      0,
      {
        start_time: 16,
        end_time: 20,
      },
      1,
    );

    const trackMock = setupTrack(0, {
      properties: {
        arrangement_clips: ["id", clip1.id, "id", clip2.id],
      },
      methods: {
        create_midi_clip: () => ["id", "300"],
        delete_clip: () => null,
      },
    });

    clearClipAtDuplicateTarget(
      LiveAPI.from(trackMock.path),
      "100",
      16,
      true,
      mockContext,
    );

    expect(trackMock.call).toHaveBeenCalledWith("create_midi_clip", 16, 4);
  });
});
