// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { duplicateClipToArrangement } from "../clip/duplicate-clip-to-arrangement.ts";

describe("duplicateClipToArrangement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when clip does not exist", async () => {
    (global as Record<string, unknown>).LiveAPI = createArrangementMockLiveAPI({
      clipExists: false,
    });

    await expect(duplicateClipToArrangement("nonexistent", 0)).rejects.toThrow(
      'no clip exists for clipId "nonexistent"',
    );
  });

  it("throws error when clip has no track index", async () => {
    (global as Record<string, unknown>).LiveAPI = createArrangementMockLiveAPI({
      clipExists: true,
      trackIndex: null,
    });

    await expect(duplicateClipToArrangement("clip1", 0)).rejects.toThrow(
      'no track index for clipId "clip1"',
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
