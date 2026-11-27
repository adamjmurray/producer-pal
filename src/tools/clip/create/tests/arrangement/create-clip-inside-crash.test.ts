// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  duplicatingTrackMethods,
  setupArrangementClip,
  setupClip,
  setupTrack,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-mock-objects.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";

/**
 * A take lane holding one clip from bar 1 to bar 5, on track 0.
 * @returns The lane's mock
 */
function laneWithClip(): ReturnType<typeof lookupMockObject> {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerTakeLaneTrack({
    initialLanes: 1,
    initialLaneClips: [[{ start: 0, end: 16 }]],
  });

  return lookupMockObject(undefined, livePath.track(0).takeLane(0));
}

// Live 12.3 crashes when a create lands strictly inside a clip; a take lane
// can't be cut out of the way, so there the clip is skipped.
describe("createClip inside a take-lane clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips it on Live 12.3, creating nothing", async () => {
    registerLiveVersion("12.3.8");
    const lane = laneWithClip();

    await expect(
      createClip({ path: "t0/l0[2|1]", notes: "C3 1|1", length: "1bar" }),
    ).rejects.toThrow(
      "Live 12.3 crashes placing a clip inside another on a take lane (t0/l0[1|1])",
    );
    expect(lane?.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each(["12.4.16", "13.0"])("creates it as usual on Live %s", async (v) => {
    registerLiveVersion(v);
    const lane = laneWithClip();

    await createClip({ path: "t0/l0[2|1]", notes: "C3 1|1", length: "1bar" });

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 4, 4);
  });

  it("creates on Live 12.3 when the clip reaches the other's end", async () => {
    registerLiveVersion("12.3.8");
    const lane = laneWithClip();

    await createClip({ path: "t0/l0[4|1]", notes: "C3 1|1", length: "2bar" });

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 12, 8);
  });
});

/**
 * t0's main lane holding a clip from bar 1 to bar 5 that shows the cut once
 * the rest comes back from the holding area (16 + 100).
 * @returns t0's mock
 */
function registerCuttableTrack(): ReturnType<typeof setupTrack> {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  const head = { is_arrangement_clip: 1, start_time: 0, end_time: 16 };
  const existing = setupArrangementClip("200", 0, head);

  setupClip("400", {
    properties: { is_arrangement_clip: 1, start_time: 116, end_time: 132 },
  });
  setupClip("500", {
    properties: { is_arrangement_clip: 1, start_time: 4, end_time: 16 },
  });
  const trackProps: Record<string, unknown> = {
    arrangement_clips: ["id", existing.id],
    has_midi_input: 1,
  };
  const methods = duplicatingTrackMethods();

  return setupTrack(0, {
    properties: trackProps,
    methods: {
      ...methods,
      duplicate_clip_to_arrangement: (...args: unknown[]) => {
        const result = methods.duplicate_clip_to_arrangement?.(...args);

        if (args[1] === 4) {
          head.end_time = 4;
          trackProps.arrangement_clips = ["id", "200", "id", "500"];
        }

        return result;
      },
    },
  });
}

/**
 * Where a call sits among a mock's calls.
 * @param track - The mock
 * @param args - The call's arguments
 * @returns Its index, or -1
 */
function callIndex(
  track: ReturnType<typeof setupTrack>,
  ...args: unknown[]
): number {
  return track.call.mock.calls.findIndex(
    (call) => JSON.stringify(call) === JSON.stringify(args),
  );
}

/**
 * Create a 1-bar clip at bar 2, inside the clip.
 */
async function createInside(): Promise<void> {
  await createClip({ path: "t0[2|1]", notes: "C3 1|1", length: "1bar" })
    // The mock's new clip has no span; only the calls matter here.
    .catch(() => undefined);
}

describe("createClip inside a main-lane clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["12.4.16", "13.0"])(
    "creates straight away on Live %s",
    async (v) => {
      registerLiveVersion(v);
      const track = registerCuttableTrack();

      await createInside();

      expect(track.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );
      expect(track.call).toHaveBeenCalledWith("create_midi_clip", 4, 4);
    },
  );

  it("cuts the clip at the new start before creating on Live 12.3", async () => {
    registerLiveVersion("12.3.8");
    const track = registerCuttableTrack();

    await createInside();

    const cut = callIndex(track, "duplicate_clip_to_arrangement", "id 400", 4);

    expect(
      callIndex(track, "duplicate_clip_to_arrangement", "id 200", 116),
    ).toBeGreaterThanOrEqual(0);
    expect(cut).toBeGreaterThanOrEqual(0);
    expect(callIndex(track, "create_midi_clip", 4, 4)).toBeGreaterThan(cut);
  });

  it("refuses on Live 12.3 when the lane still shows the clip whole", async () => {
    registerLiveVersion("12.3.8");
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    const existing = setupArrangementClip("200", 0, {
      is_arrangement_clip: 1,
      start_time: 0,
      end_time: 16,
    });

    setupClip("400", {
      properties: { is_arrangement_clip: 1, start_time: 116, end_time: 132 },
    });
    const track = setupTrack(0, {
      properties: { arrangement_clips: ["id", existing.id], has_midi_input: 1 },
      methods: duplicatingTrackMethods(),
    });

    const result = (await createClip({
      path: "t0[2|1]",
      notes: "C3 1|1",
      length: "1bar",
    })) as { detail?: string };

    expect(result.detail).toContain("couldn't cut the clip at t0[1|1] first");
    expect(result.detail).toContain("already changed: cut the clip at t0[1|1]");
    expect(track.call).not.toHaveBeenCalledWith("create_midi_clip", 4, 4);
  });
});
