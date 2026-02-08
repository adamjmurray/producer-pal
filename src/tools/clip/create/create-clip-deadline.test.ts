// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { setupArrangementClipMocks } from "./create-clip-test-helpers.ts";

// Mock the loop-deadline module to control deadline behavior
vi.mock(import("#src/tools/clip/helpers/loop-deadline.ts"), () => ({
  LOOP_DEADLINE_BUFFER_MS: 10000,
  computeLoopDeadline: vi.fn(() => 0),
  isDeadlineExceeded: vi.fn(() => false),
}));

const { createClip } = await import("./create-clip.ts");
const { isDeadlineExceeded } =
  await import("#src/tools/clip/helpers/loop-deadline.ts");

describe("createClip - deadline exceeded", () => {
  beforeEach(() => {
    vi.mocked(isDeadlineExceeded).mockReturnValue(false);
  });

  it("should stop creating clips when deadline is exceeded", async () => {
    setupArrangementClipMocks();

    // Deadline exceeded before creating any clips
    vi.mocked(isDeadlineExceeded).mockReturnValue(true);

    const result = await createClip(
      {
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1, 3|1",
        notes: "C3 1|1",
      },
      { timeoutMs: 1 },
    );

    expect(result).toStrictEqual([]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Deadline exceeded"),
    );
  });

  it("should create partial clips before deadline exceeded", async () => {
    setupArrangementClipMocks();
    mockLiveApiGet({
      Track: { exists: () => true },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      arrangement_clip: {
        length: 4,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Allow first clip, exceed on second
    vi.mocked(isDeadlineExceeded)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const result = await createClip(
      {
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1, 3|1",
        notes: "C3 1|1",
      },
      { timeoutMs: 100 },
    );

    // Only first clip created (unwrapSingleResult returns single object)
    expect(result).toMatchObject({
      id: "arrangement_clip",
      noteCount: 1,
    });
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Deadline exceeded after creating 1 of 2"),
    );
  });
});
