// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readReturnTrackInfo } from "./return-track-info.ts";

describe("readReturnTrackInfo", () => {
  it("reads each return track's name and id", () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return-a", "return-b") },
    });
    registerMockObject("return-a", { properties: { name: "Reverb" } });
    registerMockObject("return-b", { properties: { name: "Delay" } });

    expect(readReturnTrackInfo()).toStrictEqual([
      { name: "Reverb", id: "return-a" },
      { name: "Delay", id: "return-b" },
    ]);
  });

  it("reads the names fresh, even twice within one request", () => {
    // update-track resolves its sends through this reader, in a write path, so
    // memoizing the list per request would send to a name that has since
    // changed. The scope is what a memo would live in, so the test opens one.
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return-a") },
    });

    const returnA = registerMockObject("return-a", {
      properties: { name: "Reverb" },
    });

    beginLiveApiScope();

    try {
      expect(readReturnTrackInfo()).toStrictEqual([
        { name: "Reverb", id: "return-a" },
      ]);

      returnA.properties.name = "Hall";

      expect(readReturnTrackInfo()).toStrictEqual([
        { name: "Hall", id: "return-a" },
      ]);
    } finally {
      endLiveApiScope();
    }
  });

  it("reports an all-digit return track name as a string", () => {
    // This feeds a track's mixer `sends[].return`, promised as a string.
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { return_tracks: children("return-a") },
    });
    registerMockObject("return-a", { properties: { name: 5678 } });

    expect(readReturnTrackInfo()).toStrictEqual([
      { name: "5678", id: "return-a" },
    ]);
  });
});
