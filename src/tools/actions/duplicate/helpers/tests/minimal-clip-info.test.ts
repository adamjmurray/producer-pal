// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { getMinimalClipInfo } from "../minimal-clip-info.ts";

describe("getMinimalClipInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names an arrangement clip by its lane and where it starts", () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      type: "Song",
      properties: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
    registerMockObject("456", {
      path: livePath.track(2).arrangementClip(0),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        start_time: 4.0,
      },
    });

    const result = getMinimalClipInfo(LiveAPI.from("456"));

    expect(result.id).toBe("456");
    // start_time 4 in 4/4 is bar 2 beat 1
    expect(result.path).toBe("t2[2|1]");
  });

  it("returns id and path for session clip", () => {
    registerMockObject("789", {
      path: livePath.track(1).clipSlot(3).clip(),
      type: "Clip",
      properties: {
        is_arrangement_clip: 0,
      },
    });

    const result = getMinimalClipInfo(LiveAPI.from("789"));

    expect(result.id).toBe("789");
    expect(result.path).toBe("t1/s3");
  });

  it("throws error when trackIndex is null for arrangement clip", () => {
    const mockClip = {
      id: "792",
      path: `invalid_path`,
      trackIndex: null,
      getProperty: (property: string) => {
        if (property === "is_arrangement_clip") {
          return 1;
        }

        if (property === "start_time") {
          return 0;
        }

        return 0;
      },
    };

    expect(() => getMinimalClipInfo(mockClip as unknown as LiveAPI)).toThrow(
      "could not determine trackIndex for clip",
    );
  });

  it("throws error when trackIndex or sceneIndex is null for session clip", () => {
    const mockClip = {
      id: "793",
      path: `invalid_path`,
      trackIndex: null,
      sceneIndex: null,
      getProperty: () => 0,
    };

    expect(() => getMinimalClipInfo(mockClip as unknown as LiveAPI)).toThrow(
      "could not determine trackIndex/sceneIndex for clip",
    );
  });
});
