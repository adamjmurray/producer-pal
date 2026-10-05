// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A resize that stays in place counts as written ground: a clip it covers is
// replaced by it, and a throw after it keeps the entry with what landed. One
// that landed nothing counts for neither.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
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
      { id: "100", start: 0, length: 16, looping: true },
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

  it("replaces nothing when a looped clip's every tile was refused", async () => {
    setUpLane(
      [
        { id: "100", start: 0, length: 16, looping: true },
        { id: "101", start: 20, length: 8 },
      ],
      ["100"],
    );

    const result = (await updateClip({
      id: "101,100",
      arrangementLength: "3bar,16bar",
    })) as ClipResult[];

    expect(result[0]).toStrictEqual({
      id: "101",
      ok: false,
      detail: expect.stringContaining("was meant to replace it, but failed"),
    });
  });
});
