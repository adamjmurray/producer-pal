// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { prepareClipData } from "../helpers/create-clip-loop-helpers.ts";
import { createClip } from "../create-clip.ts";
import { setupSessionMocks } from "./create-clip-test-helpers.ts";

// Mock the scale-mask read so we can assert exactly when createClips reads it
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

const FOUR_FOUR = { signature_numerator: 4, signature_denominator: 4 };

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

  it("does not warn when interpreted notes have no same-pitch collisions", () => {
    prepareClipData(null, "C3 1|1 D3 1|1", null, 4, 4, undefined, null);

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("Dropped"),
    );
  });

  it("warns with singular wording for exactly one dropped duplicate", () => {
    prepareClipData(null, "C3 1|1 C3 1|1", null, 4, 4, undefined, null);

    expect(outlet).toHaveBeenCalledWith(
      1,
      "Dropped 1 duplicate note at the same pitch and start",
    );
  });

  it("warns with plural wording for multiple dropped duplicates", () => {
    prepareClipData(null, "C3 1|1 C3 1|1 C3 1|1", null, 4, 4, undefined, null);

    expect(outlet).toHaveBeenCalledWith(
      1,
      "Dropped 2 duplicate notes at the same pitch and start",
    );
  });
});

describe("createClip - failure warnings (createClipAtIndex catch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns with the session slot position when a session clip fails to create", async () => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { ...FOUR_FOUR, scenes: children("scene_0") },
    });
    registerMockObject("track-0", { path: livePath.track(0) });
    // has_clip: 1 makes prepareSessionClipSlot throw inside processClipIteration.
    registerMockObject("clip-slot-0-0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
    });

    await createClip({ slot: "0/0", notes: "C3 1|1" });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Failed to create clip at slot=0/0:"),
    );
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("trackIndex="),
    );
  });

  it("warns with the arrangement position when an arrangement clip fails to create", async () => {
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

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C3 1|1",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "Failed to create clip at trackIndex=0, arrangementStart=",
      ),
    );
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("slot="),
    );
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

describe("createClip - scale mask wiring (createClips)", () => {
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
