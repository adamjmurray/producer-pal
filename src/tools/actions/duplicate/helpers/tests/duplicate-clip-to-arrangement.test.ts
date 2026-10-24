// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../tests/duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicateClipToArrangement } from "../clip/duplicate-clip-to-arrangement.ts";

// The tests below swap in their own LiveAPI; the registry's is put back after.
const registryLiveAPI = (global as Record<string, unknown>).LiveAPI;

afterEach(() => {
  (global as Record<string, unknown>).LiveAPI = registryLiveAPI;
});

describe("duplicateClipToArrangement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when clip does not exist", async () => {
    (global as Record<string, unknown>).LiveAPI = createArrangementMockLiveAPI({
      clipExists: false,
    });

    await expect(duplicateClipToArrangement("nonexistent", 0)).rejects.toThrow(
      'id "nonexistent" does not exist',
    );
  });

  it("throws error when clip has no track index", async () => {
    (global as Record<string, unknown>).LiveAPI = createArrangementMockLiveAPI({
      clipExists: true,
      trackIndex: null,
    });

    await expect(duplicateClipToArrangement("clip1", 0)).rejects.toThrow(
      "no track for clip id clip1",
    );
  });

  it("copies onto the source clip's own track when handed no tracks", async () => {
    registerMockObject("clip1", {
      path: livePath.track(2).clipSlot(0).clip(),
      properties: { is_midi_clip: 1, length: 4 },
    });

    const copy = registerMockObject("copy1", {
      path: livePath.track(2).arrangementClip(0),
      properties: { is_arrangement_clip: 1, start_time: 8, end_time: 12 },
    });
    const track = registerMockObject("track2", {
      path: livePath.track(2),
      properties: { arrangement_clips: [] },
      methods: { duplicate_clip_to_arrangement: () => ["id", copy.id] },
    });

    expect(await duplicateClipToArrangement("clip1", 8)).toStrictEqual({
      copy: { id: "copy1", path: "t2[3|1]" },
    });
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip1",
      8,
    );
  });
});

interface ArrangementMockOptions {
  clipExists: boolean;
  trackIndex?: number | null;
}

interface ArrangementMockLiveAPIInstance {
  path: string;
  _path: string;
  trackIndex?: number | null;
  exists: () => boolean;
  id: string;
}

interface ArrangementMockLiveAPIConstructor {
  new (path: string): ArrangementMockLiveAPIInstance;
  from: (
    idOrPath: string | { toString: () => string },
  ) => ArrangementMockLiveAPIInstance;
}

/**
 * Helper to create a mock LiveAPI class for arrangement clip duplication tests
 * @param options - Mock configuration options
 * @param options.clipExists - Whether the clip exists
 * @param options.trackIndex - Track index for the clip
 * @returns Mock LiveAPI constructor
 */
function createArrangementMockLiveAPI({
  clipExists,
  trackIndex = 0,
}: ArrangementMockOptions): ArrangementMockLiveAPIConstructor {
  class MockLiveAPI implements ArrangementMockLiveAPIInstance {
    path: string;
    _path: string;
    trackIndex?: number | null;

    constructor(path: string) {
      this.path = path;
      this._path = path;

      if (path.includes("tracks") && !path.includes("clip")) {
        this.trackIndex = 0;
      } else if (clipExists) {
        this.trackIndex = trackIndex;
      }
    }

    static from(idOrPath: string | { toString: () => string }): MockLiveAPI {
      return new MockLiveAPI(String(idOrPath));
    }

    exists(): boolean {
      if (this.path === "clip1" || this.path === "nonexistent") {
        return clipExists;
      }

      return true;
    }

    get id(): string {
      return this.path.replaceAll(" ", "/");
    }
  }

  return MockLiveAPI;
}
