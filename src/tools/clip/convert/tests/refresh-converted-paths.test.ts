// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { refreshPathsAfterConvert } from "../refresh-converted-paths.ts";

describe("refreshPathsAfterConvert", () => {
  it("reads the path again from the id, and leaves an entry with no id alone", () => {
    registerMockObject("clip-1", {
      path: livePath.track(2).clipSlot(0).clip(),
    });

    const stale: ClipResult = { id: "clip-1", path: "t0/s0" };
    const noId = { path: "t9/s9" } as ClipResult;

    refreshPathsAfterConvert([stale, noId]);

    expect(stale.path).toBe("t2/s0");
    expect(noId.path).toBe("t9/s9");
  });

  it("refreshes the track, instrument and clip a conversion made", () => {
    registerMockObject("new-track", { path: livePath.track(5) });
    registerMockObject("new-clip", {
      path: livePath.track(5).clipSlot(0).clip(),
    });

    const entry: ClipResult = {
      id: "no-such-object",
      path: "unchanged",
      converted: {
        track: { id: "new-track", path: "t4", name: "converted" },
        clip: { id: "new-clip", path: "t4/s0", noteCount: 3 },
      },
    };

    refreshPathsAfterConvert([entry]);

    expect(entry.path).toBe("unchanged");
    expect(entry.converted?.track.path).toBe("t5");
    expect(entry.converted?.clip?.path).toBe("t5/s0");
  });
});
