// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The plan hands the ordering what the pipeline knows of the targets, and each
// target what the ordering decided. The ordering itself is stubbed here.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ClipPayload } from "#src/tools/clip/update/helpers/call/resolve-clip-targets.ts";
import { type ClipCall } from "#src/tools/clip/update/helpers/call/parse-clip-call.ts";
import { planClipMoves } from "#src/tools/clip/update/helpers/call/plan-clip-moves.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";

vi.mock(
  import("#src/tools/clip/update/helpers/arrangement/update-clip-move-order.ts"),
  () => ({
    orderArrangementMoves: vi.fn(),
  }),
);

import { orderArrangementMoves } from "#src/tools/clip/update/helpers/arrangement/update-clip-move-order.ts";

const CALL = {} as ClipCall;

/**
 * A target holding a clip that goes nowhere.
 * @param id - The clip's id
 * @param skip - Why the target is skipped, if it is
 * @returns The target
 */
function target(id: string, skip?: string): Target<ClipPayload> {
  const payload = {
    clip: LiveAPI.from(id),
    destination: null,
    startBeats: null,
    lengthBeats: null,
  } as unknown as ClipPayload;

  return {
    data: payload,
    ...(skip != null && { skip }),
  } as Target<ClipPayload>;
}

describe("planClipMoves", () => {
  beforeEach(() => {
    registerMockObject("1", { path: "live_set tracks 0 arrangement_clips 0" });
    registerMockObject("2", { path: "live_set tracks 0 arrangement_clips 1" });
    vi.mocked(orderArrangementMoves).mockReset();
  });

  it("makes no clip wait for a cut it is cut by when that target is skipped", () => {
    vi.mocked(orderArrangementMoves).mockReturnValue({
      order: [0],
      blockedIds: new Set(),
      dependencies: [new Set()],
      vacates: [false],
    });

    planClipMoves([target("1"), target("2", "no such clip")], CALL, {
      unwritten: new Set([1]),
      shortenedBy: new Map([[0, [1]]]),
    });

    const after = vi.mocked(orderArrangementMoves).mock.calls[0]?.[3];

    expect(after).toStrictEqual([new Set()]);
  });

  it("makes a clip wait for the clip that cuts it", () => {
    vi.mocked(orderArrangementMoves).mockReturnValue({
      order: [1, 0],
      blockedIds: new Set(),
      dependencies: [new Set(), new Set()],
      vacates: [false, false],
    });

    const plan = planClipMoves([target("1"), target("2")], CALL, {
      unwritten: new Set(),
      shortenedBy: new Map([[0, [1]]]),
    });

    expect(vi.mocked(orderArrangementMoves).mock.calls[0]?.[3]).toStrictEqual([
      new Set(),
      new Set([0]),
    ]);
    expect(plan.order).toStrictEqual([1, 0]);
  });

  it("gives a blocked clip no reason when the ordering said none", () => {
    vi.mocked(orderArrangementMoves).mockReturnValue({
      order: [0],
      blockedIds: new Set(["1"]),
      dependencies: [new Set()],
      vacates: [false],
    });

    const plan = planClipMoves([target("1")], CALL, {
      unwritten: new Set(),
      shortenedBy: new Map(),
    });

    expect(plan.each?.[0]?.blocked).toBeNull();
  });
});
