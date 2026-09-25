// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { copyLabels } from "../sources/copy-labels.ts";
import {
  calculateSceneLength,
  duplicateSceneToArrangement,
} from "../sources/duplicate-scene.ts";
import { duplicateSceneToArrangementAtPositions } from "../sources/scene-arrangement-positions.ts";

vi.mock(import("../sources/duplicate-scene.ts"), () => ({
  calculateSceneLength: vi.fn(() => 16),
  duplicateSceneToArrangement: vi.fn(async () => ({ clips: [] })),
}));

/**
 * Copy a 4-bar scene count times end to end from bar 1.
 * @param count - How many copies
 * @param arrangementLength - The call's arrangementLength, if any
 * @returns Where each copy started, in beats
 */
async function copyStarts(
  count: number,
  arrangementLength?: string,
): Promise<number[]> {
  const labels = copyLabels({ arrangementLength }, 1, {
    numerator: 4,
    denominator: 4,
  });

  await duplicateSceneToArrangementAtPositions(
    LiveAPI.from("scene1"),
    "scene1",
    count,
    labels,
    { arrangementStart: "1|1" },
    {},
  );

  return vi
    .mocked(duplicateSceneToArrangement)
    .mock.calls.map((call) => call[1]);
}

describe("duplicateSceneToArrangementAtPositions - end to end", () => {
  beforeEach(() => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMockObject("scene1", { path: livePath.scene(0) });
  });

  it("steps by the scene's length when no arrangementLength is given", async () => {
    expect(await copyStarts(3)).toStrictEqual([0, 16, 32]);
    expect(calculateSceneLength).toHaveBeenCalledOnce();
  });

  it("steps by one arrangementLength that covers every copy", async () => {
    expect(await copyStarts(2, "8bar")).toStrictEqual([0, 32]);
    expect(calculateSceneLength).not.toHaveBeenCalled();
  });

  it("steps by each copy's own length from a list", async () => {
    expect(await copyStarts(3, "2bar,1bar,4bar")).toStrictEqual([0, 8, 12]);
  });
});
