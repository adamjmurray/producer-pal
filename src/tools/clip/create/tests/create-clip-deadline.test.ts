// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupArrangementClipMocks } from "./create-clip-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

// Mock the loop-deadline module to control deadline behavior
vi.mock(import("#src/tools/clip/helpers/loop-deadline.ts"), () => ({
  LOOP_DEADLINE_BUFFER_MS: 10000,
  computeLoopDeadline: vi.fn(() => 0),
  isDeadlineExceeded: vi.fn(() => false),
}));

const { createClip } = await import("../create-clip.ts");
const { isDeadlineExceeded } =
  await import("#src/tools/clip/helpers/loop-deadline.ts");

describe("createClip - deadline exceeded", () => {
  beforeEach(() => {
    vi.mocked(isDeadlineExceeded).mockReturnValue(false);
  });

  // Every destination the call never reached says so in its own entry, so the
  // warning only reports how far the call got (ADR-0042).
  it("refuses every destination when the deadline is already up", async () => {
    setupArrangementClipMocks();

    // Deadline exceeded before creating any clips
    vi.mocked(isDeadlineExceeded).mockReturnValue(true);

    const result = await createClip(
      {
        trackIndex: 0,
        arrangementStart: "1|1, 3|1",
        notes: "C3 1|1",
      },
      { timeoutMs: 1 },
    );

    const reason =
      "not created: the request ran out of time; re-run for this clip";

    expect(result).toStrictEqual([
      { path: "t0[1|1]", ok: false, detail: reason },
      { path: "t0[3|1]", ok: false, detail: reason },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("Ran out of time after creating 0 of 2 clips"),
    );
  });

  it("should create partial clips before deadline exceeded", async () => {
    const { clip } = setupArrangementClipMocks();

    // Add additional properties the production code reads from the clip
    clip.get.mockImplementation((prop: string) => {
      switch (prop) {
        case "length":
          return [4];
        case "signature_numerator":
          return [4];
        case "signature_denominator":
          return [4];
        default:
          return [0];
      }
    });

    // Allow first clip, exceed on second
    vi.mocked(isDeadlineExceeded)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const result = await createClip(
      {
        trackIndex: 0,
        arrangementStart: "1|1, 3|1",
        notes: "C3 1|1",
      },
      { timeoutMs: 100 },
    );

    // The second destination keeps its slot, saying why it got no clip.
    expect(result).toStrictEqual([
      {
        length: "1bar",
        path: "t0[1|1]",
        id: "arrangement_clip",
        noteCount: 1,
      },
      {
        path: "t0[3|1]",
        ok: false,
        detail:
          "not created: the request ran out of time; re-run for this clip",
      },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("Ran out of time after creating 1 of 2"),
    );
  });
});
