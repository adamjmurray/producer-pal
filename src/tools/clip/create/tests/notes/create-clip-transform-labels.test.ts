// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../../create-clip.ts";
import {
  registerEmptyClipSlot,
  setupArrangementClipMocks,
} from "../create-clip-test-helpers.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

// A transform with a bad argument warns once per clip, with the same text
// every time, which is exactly what the label has to tell apart.
const FAILING_TRANSFORM = "ratchet(n0/4)";
const FAILED = "ratchet() grid";

/**
 * The warnings with the failure's own wording cut off, leaving each label.
 * @returns The labels the warnings carry
 */
function warningLabels(): string[] {
  return capturedWarnings().map((warning) => warning.split(FAILED)[0] ?? "");
}

describe("createClip - transforms name the clip they warn about", () => {
  beforeEach(() => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: {
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
      },
    });
  });

  it("names the destination, with no ordinal for a single clip", async () => {
    registerEmptyClipSlot(0);

    await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      transforms: FAILING_TRANSFORM,
    });

    expect(warningLabels()).toStrictEqual(["clip t0/s0: "]);
  });

  it("tells two firings of the same reason apart", async () => {
    registerEmptyClipSlot(0);
    registerEmptyClipSlot(1);

    await createClip({
      slot: "0/0, 0/1",
      notes: "C3 1|1",
      transforms: FAILING_TRANSFORM,
    });

    expect(warningLabels()).toStrictEqual([
      "clip t0/s0 (1 of 2): ",
      "clip t0/s1 (2 of 2): ",
    ]);
  });

  it("names an arrangement clip by lane and start time", async () => {
    setupArrangementClipMocks();

    await createClip({
      arrangementStart: "1|1",
      trackIndex: 0,
      notes: "C3 1|1",
      transforms: FAILING_TRANSFORM,
    });

    expect(warningLabels()).toStrictEqual(["clip t0[1|1]: "]);
  });

  // A transform for the other kind of clip does nothing there; the created
  // clip exists, so its entry carries that as a detail and never as ok:false.
  it("says on the entry that a gain transform does nothing on a MIDI clip", async () => {
    registerEmptyClipSlot(0);

    const result = await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      transforms: "gain = -6",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({ detail: "gain ignored: the clip is MIDI" }),
    );
    expect(result).not.toHaveProperty("ok");
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says so on the entry when only part of the transform applies", async () => {
    registerEmptyClipSlot(0);

    const result = await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      transforms: "velocity = 100\ngain = -3",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({ detail: "gain ignored: the clip is MIDI" }),
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // A fact about this clip's notes goes on its entry, once, and is no warning.
  it("says on the entry what a transform did to the clip's notes", async () => {
    registerEmptyClipSlot(0);

    const result = await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      transforms: "duration = -1",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: "1 note(s) deleted: duration went to 0 or below",
      }),
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
