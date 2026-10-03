// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A split that finishes just as the request runs out of time still changed the
// Set, so the clips it cut keep their entries (ADR-0042).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupClipSplittingMocks } from "#src/tools/shared/arrangement/tests/helpers/arrangement-splitting-test-helpers.ts";

// The split's own check is the first call; every one after it is out of time.
vi.mock(import("#src/tools/clip/helpers/loop-deadline.ts"), () => ({
  LOOP_DEADLINE_BUFFER_MS: 10000,
  computeLoopDeadline: vi.fn(() => 0),
}));
vi.mock(import("#src/shared/max/v8-request-deadline.ts"), () => ({
  isDeadlineExceeded: vi.fn(() => false),
}));

const { updateClip } = await import("#src/tools/clip/update/update-clip.ts");
const { isDeadlineExceeded } =
  await import("#src/shared/max/v8-request-deadline.ts");

const NOT_RUN =
  "the request ran out of time; the rest of this update did not run";

describe("updateClip - a split cut short by the deadline", () => {
  beforeEach(() => {
    vi.mocked(isDeadlineExceeded)
      .mockReset()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
  });

  it("keeps the pieces of a cut clip, and does not throw for a lone target", async () => {
    setupClipSplittingMocks("clip_1");

    const result = await updateClip(
      { id: "clip_1", arrangementSplit: "2|1", name: "Cut" },
      { timeoutMs: 100 },
    );

    expect(result).toStrictEqual([
      { id: "clip_1", path: "t0[1|1]", detail: NOT_RUN },
      { id: "dup_2", path: "t0[2|1]", detail: NOT_RUN },
    ]);
  });

  it("still refuses a clip the split never reached", async () => {
    setupClipSplittingMocks("clip_1");
    registerMockObject("session_clip", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
      properties: { is_arrangement_clip: 0, is_midi_clip: 1 },
    });

    const result = await updateClip(
      { ids: "session_clip,clip_1", arrangementSplit: "2|1" },
      { timeoutMs: 100 },
    );

    expect(result).toStrictEqual([
      {
        id: "session_clip",
        ok: false,
        detail:
          "not updated: the request ran out of time; re-run for this clip",
      },
      { id: "clip_1", path: "t0[1|1]", detail: NOT_RUN },
      { id: "dup_2", path: "t0[2|1]", detail: NOT_RUN },
    ]);
  });
});
