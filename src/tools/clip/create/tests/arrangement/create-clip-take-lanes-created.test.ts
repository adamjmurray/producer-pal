// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// Take lanes can't be deleted, so a clip written past the last lane says which
// lanes it made on the way.

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  registerTakeLaneTrack,
  stopMakingTakeLanesAfter,
} from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

/** Register the live_set time signature mock used by createClip. */
function registerLiveSet(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
}

describe("createClip - take lanes made on the way", () => {
  it("names every lane a clip past the end made", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 0 });

    const result = (await createClip({
      path: "t0/l3[5|1]",
      notes: "C3",
    })) as { path: string; created?: string };

    expect(result.path).toBe("t0/l3[5|1]");
    expect(result.created).toBe("l0-l3");
  });

  it("names only the lanes past the ones the track had", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 2 });

    const result = (await createClip({
      path: "t0/l3[1|1]",
      notes: "C3",
    })) as { created?: string };

    expect(result.created).toBe("l2-l3");
  });

  it("says nothing for a lane that was already there", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 2 });

    const result = (await createClip({
      path: "t0/l1[1|1]",
      notes: "C3",
    })) as object;

    expect(result).not.toHaveProperty("created");
  });

  it("says it once when several clips stack on the lane it made", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 0 });

    const result = (await createClip({
      path: "t0/l1[1|1],t0/l1[5|1]",
      notes: "C3",
    })) as Array<{ created?: string }>;

    expect(result[0]?.created).toBe("l0-l1");
    expect(result[1]).not.toHaveProperty("created");
  });

  it("keeps the lanes on the entry when the clip then fails", async () => {
    registerLiveSet();
    registerTakeLaneTrack({ initialLanes: 0, clipCreationFails: true });

    const result = (await createClip({
      path: "t0/l1[1|1]",
      notes: "C3",
    })) as { created?: string; detail?: string; ok?: boolean };

    expect(result.created).toBe("l0-l1");
    expect(result.detail).toContain("already changed: take lane l0-l1 made");
    expect(result.ok).toBeUndefined();
  });

  // Nothing changed, so a lone target's failure is the call's.
  it("fails the call when Live made no lane before it failed", async () => {
    registerLiveSet();
    stopMakingTakeLanesAfter(registerTakeLaneTrack({ initialLanes: 0 }), 0);

    await expect(
      createClip({ path: "t0/l1[1|1]", notes: "C3" }),
    ).rejects.toThrow("Live is unhappy");
  });
});
