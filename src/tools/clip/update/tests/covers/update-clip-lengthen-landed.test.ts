// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A resize that stays in place counts as written ground: a clip it covers is
// replaced by it, and a throw after it keeps the entry with what landed.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
import {
  lookupMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { resizesLikeLiveClip } from "#src/test/mocks/registry/mock-clip-resize.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { setUpLane } from "../move-order/lane-with-clips-test-helpers.ts";

vi.mock(import("#src/tools/clip/envelopes/apply-clip-envelopes.ts"), () => ({
  applyClipEnvelopes: vi.fn(),
}));

const BOOM = "envelope boom";

/** Make the envelope step throw for the clip with this id. */
function envelopesThrowFor(id: string): void {
  vi.mocked(applyClipEnvelopes).mockImplementation((clip) => {
    if ((clip as { id: string }).id === id) {
      return Promise.reject(new Error(BOOM));
    }

    return Promise.resolve();
  });
}

describe("a resize in place", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes envelopes over a looping clip's new span, after it grows", async () => {
    setUpLane([
      { id: "100", start: 0, length: 4, looping: true },
      { id: "101", start: 8, length: 4, looping: true },
    ]);
    resizesLikeLiveClip(lookupMockObject("100") as RegisteredMockObject);

    const spans = new Map<string, number>();

    vi.mocked(applyClipEnvelopes).mockImplementation((entry) => {
      const { id } = entry as ClipResult;
      const { properties } = lookupMockObject(id) as RegisteredMockObject;

      spans.set(
        id,
        Number(properties.end_time) - Number(properties.start_time),
      );

      return Promise.resolve();
    });

    const result = await updateClip({
      id: "100,101",
      arrangementLength: "2bar,1bar",
      envelopes: "pan: 1|1 0.5",
    });

    expect(result).toStrictEqual([
      { id: "100", path: "t0[1|1]" },
      { id: "101", path: "t0[3|1]" },
    ]);
    // One clip each, envelopes written once it has its new span.
    expect(spans).toStrictEqual(
      new Map([
        ["100", 8],
        ["101", 4],
      ]),
    );
  });

  it("keeps the clip's entry, with the lengthening, when a later step throws", async () => {
    setUpLane([{ id: "100", start: 0, length: 16 }]);
    envelopesThrowFor("100");

    const result = await updateClip({
      id: "100",
      arrangementLength: "8bar",
      envelopes: "pan: 1|1 0.5",
    });

    expect(result).toStrictEqual({
      id: "100",
      path: "t0[1|1]",
      detail: `${BOOM}; already changed: lengthened`,
    });
  });

  it("still replaces the clip it covers when a later step throws", async () => {
    setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 20, length: 8 },
    ]);
    envelopesThrowFor("100");

    const result = (await updateClip({
      id: "101,100",
      arrangementLength: "3bar,16bar",
      envelopes: "pan: 1|1 0.5",
    })) as ClipResult[];

    expect(result[0]).not.toHaveProperty("ok");
    expect(result[0]?.detail).toContain("overwritten later in this call");
  });

  // The slot is ignored beside a length, so the clip is resized where it is.
  it("replaces the clip it covers when a slot rides along with the length", async () => {
    setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 20, length: 8 },
    ]);

    const result = (await updateClip({
      id: "101,100",
      toPath: "t1/s0,t1/s1",
      arrangementLength: "3bar,16bar",
    })) as ClipResult[];

    expect(result[0]).not.toHaveProperty("ok");
    expect(result[0]?.detail).toContain("overwritten later in this call");
  });

  it("doesn't call a clip cut short by its own shortening", async () => {
    vi.mocked(applyClipEnvelopes).mockResolvedValue(undefined);
    setUpLane([
      { id: "100", start: 0, length: 16 },
      { id: "101", start: 40, length: 8 },
    ]);

    const result = await updateClip({
      id: "100,101",
      arrangementLength: "2bar,1bar",
    });

    expect(result).toStrictEqual([
      { id: "100", path: "t0[1|1]" },
      { id: "101", path: "t0[11|1]" },
    ]);
  });
});
