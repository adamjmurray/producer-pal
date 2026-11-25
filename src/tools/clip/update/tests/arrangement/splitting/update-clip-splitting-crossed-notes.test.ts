// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { setupClipSplittingMocks } from "#src/tools/shared/arrangement/tests/helpers/arrangement-splitting-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - a note across a cut", () => {
  it("says on the clip's entry that the note now ends at the cut", async () => {
    setupClipSplittingMocks("clip_1", {
      looping: false,
      endTime: 8,
      loopEnd: 8,
      endMarker: 8,
    });

    const clip = lookupMockObject("clip_1");
    const inner = clip?.call.getMockImplementation();

    clip?.call.mockImplementation((method: string, ...args: unknown[]) =>
      method === "get_notes_extended"
        ? JSON.stringify({
            notes: [{ pitch: 36, start_time: 0, duration: 8, mute: 0 }],
          })
        : inner?.(method, ...args),
    );

    const result = await updateClip(
      { id: "clip_1", arrangementSplit: "2|1" },
      {},
    );

    expect(result).toStrictEqual([
      {
        id: "clip_1",
        path: "t0[1|1]",
        detail: "1 note crossed a cut and now ends at it",
      },
      { id: "dup_2", path: "t0[2|1]" },
    ]);
  });
});
