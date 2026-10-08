// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// update-clip's `envelopes` on arrangement clips, through the whole tool: the
// clip comes back under a new id, and several clips in one call each get their
// turn.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { CLIP_ID, registerLaneWorld } from "./lane-world-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

describe("updateClip - envelopes on an arrangement clip", () => {
  beforeEach(() => {
    vi.mocked(requestNode).mockReset();
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: true, result: {} },
    });
  });

  it("returns the clip under its new id", async () => {
    const world = registerLaneWorld();

    const result = await updateClip({
      id: CLIP_ID,
      envelopes: "volume: 1|1 0 / 3|1 1",
    });

    expect(result).toStrictEqual({
      id: "802",
      path: "t0[5|1]",
      envelopes: 1,
    });
    expect(world.laneIds()).toStrictEqual(["802"]);
  });

  it("handles each clip of a call on its own turn", async () => {
    const world = registerLaneWorld({
      neighbors: [{ id: "901", start: 24, end: 32 }],
    });

    const result = await updateClip({
      ids: `${CLIP_ID},901`,
      envelopes: "volume: 1|1 0 / 2|1 1",
    });

    expect(result).toStrictEqual([
      { id: "802", path: "t0[5|1]", envelopes: 1 },
      { id: "805", path: "t0[7|1]", envelopes: 1 },
    ]);
    expect(world.laneIds()).toStrictEqual(["802", "805"]);
  });
});
