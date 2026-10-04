// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { prepareClipData } from "../../helpers/clip-data-preparation.ts";
import { createClip } from "../../create-clip.ts";
import { setupSessionMocks } from "../create-clip-test-helpers.ts";

// Mock the scale-mask read so we can assert exactly when createClip reads it
// (the transformString != null ? readLiveSetScaleMask() : undefined ternary).
vi.mock(import("#src/tools/clip/helpers/scale-mask.ts"), () => ({
  readLiveSetScaleMask: vi.fn(),
}));

// Mock code application so we can assert whether/how createClipAtIndex invokes it
// without needing the full code-exec V8 round-trip.
vi.mock(import("#src/tools/clip/code-exec/apply-code-to-clip.ts"), () => ({
  applyCodeToSingleClip: vi.fn(),
}));

import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { readLiveSetScaleMask } from "#src/tools/clip/helpers/scale-mask.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const FOUR_FOUR = { signature_numerator: 4, signature_denominator: 4 };

/** A 4/4 Set whose track 0 refuses every arrangement create. */
function registerFailingArrangementTrack(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: FOUR_FOUR,
  });
  registerMockObject("track-0", {
    path: livePath.track(0),
    methods: {
      create_midi_clip: () => {
        throw new Error("boom");
      },
    },
  });
}

describe("prepareClipData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the sample-derived length (1 beat) for audio clips", () => {
    const result = prepareClipData(
      "sample.wav",
      null,
      null,
      4,
      4,
      undefined,
      null,
    );

    // Audio clips take their length from the sample file, not calculateClipLength
    // (which would return a 1-bar = 4-beat default for empty notes).
    expect(result.clipLength).toBe(1);
    expect(result.notes).toStrictEqual([]);
  });

  it("computes MIDI clip length from notes (not the audio path)", () => {
    const result = prepareClipData(null, "C3 1|1", null, 4, 4, undefined, null);

    expect(result.clipLength).toBe(4); // 1 bar in 4/4
  });

  it("reports no dropped duplicates when there are no same-pitch collisions", () => {
    const result = prepareClipData(
      null,
      "C3 1|1 D3 1|1",
      null,
      4,
      4,
      undefined,
      null,
    );

    expect(result.droppedDuplicates).toBe(0);
  });

  it("counts dropped duplicates without warning", () => {
    const one = prepareClipData(
      null,
      "C3 1|1 C3 1|1",
      null,
      4,
      4,
      undefined,
      null,
    );
    const two = prepareClipData(
      null,
      "C3 1|1 C3 1|1 C3 1|1",
      null,
      4,
      4,
      undefined,
      null,
    );

    expect(one.droppedDuplicates).toBe(1);
    expect(two.droppedDuplicates).toBe(2);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("uplicate"),
    );
  });

  it("keeps duplicates for the transform to settle when one will run", () => {
    const result = prepareClipData(
      null,
      "C3 1|1 C3 1|1",
      null,
      4,
      4,
      undefined,
      "velocity = 100",
    );

    expect(result.notes).toHaveLength(2);
    expect(result.droppedDuplicates).toBe(0);
  });
});

describe("createClip - skip entries (createClipAtIndex catch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addresses a failed session clip by its clip slot", async () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { ...FOUR_FOUR, scenes: children("scene_0", "scene_1") },
    });
    registerMockObject("track-0", { path: livePath.track(0) });

    // Live refuses the create in each slot, so neither destination gets a clip.
    for (const sceneIndex of [0, 1]) {
      registerMockObject(`clip-slot-0-${sceneIndex}`, {
        path: livePath.track(0).clipSlot(sceneIndex),
        properties: { has_clip: 0 },
        methods: {
          create_clip: () => {
            throw new Error("boom");
          },
        },
      });
    }

    const result = await createClip({ slot: "0/0,0/1", notes: "C3 1|1" });

    // No bar|beat position: a clip slot doesn't have one.
    expect(result).toStrictEqual([
      { path: "t0/s0", ok: false, detail: "boom" },
      { path: "t0/s1", ok: false, detail: "boom" },
    ]);
  });

  it("addresses a failed arrangement clip by its position", async () => {
    registerFailingArrangementTrack();

    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "1|1,3|1",
      notes: "C3 1|1",
    });

    expect(result).toStrictEqual([
      { path: "t0[1|1]", ok: false, detail: "boom" },
      { path: "t0[3|1]", ok: false, detail: "boom" },
    ]);
  });

  // A lone destination has no list for an entry to hold a place in.
  it("throws when the call named one destination and it got no clip", async () => {
    registerFailingArrangementTrack();

    await expect(
      createClip({ trackIndex: 0, arrangementStart: "1|1", notes: "C3 1|1" }),
    ).rejects.toThrow("boom");
  });
});

describe("createClip - code execution wiring (createClipAtIndex)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not invoke code execution when no code is provided", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR });

    await createClip({ slot: "0/0", notes: "C3 1|1" });

    expect(applyCodeToSingleClip).not.toHaveBeenCalled();
  });

  it("keeps the read-back noteCount when code execution reports no count", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR });
    // null => clip lookup found no note count; noteCount must not be overwritten.
    vi.mocked(applyCodeToSingleClip).mockResolvedValue(null);

    const result = await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      code: "return notes",
    });

    expect(applyCodeToSingleClip).toHaveBeenCalledOnce();
    // buildClipResult read back 1 note; the null code result leaves it intact.
    expect((result as { noteCount?: number }).noteCount).toBe(1);
  });
});

describe("createClip - scale mask wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the Live Set scale mask when a transform is present", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR });

    await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      transforms: "velocity = 100",
    });

    expect(readLiveSetScaleMask).toHaveBeenCalled();
  });

  it("does not read the scale mask when no transform is present", async () => {
    setupSessionMocks({ liveSet: FOUR_FOUR });

    await createClip({ slot: "0/0", notes: "C3 1|1" });

    expect(readLiveSetScaleMask).not.toHaveBeenCalled();
  });
});
