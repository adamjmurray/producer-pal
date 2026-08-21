// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Mock the loop-deadline module to control deadline behavior
vi.mock(import("#src/tools/clip/helpers/loop-deadline.ts"), () => ({
  LOOP_DEADLINE_BUFFER_MS: 10000,
  computeLoopDeadline: vi.fn(() => 0),
  isDeadlineExceeded: vi.fn(() => false),
}));

// Dynamic import after mock is set up
const { updateClip } = await import("#src/tools/clip/update/update-clip.ts");
const { computeLoopDeadline, isDeadlineExceeded } =
  await import("#src/tools/clip/helpers/loop-deadline.ts");

/**
 * Setup two MIDI clip mocks for deadline tests.
 * @param mocks - Registered clip mocks
 */
function setupTwoMidiClips(mocks: UpdateClipMocks): void {
  setupSessionMidiClip(mocks.clip123);
  setupSessionMidiClip(mocks.clip456);
}

function setupSessionMidiClip(clip: RegisteredMockObject): void {
  setupMidiClipMock(clip, {
    is_arrangement_clip: 0,
    is_midi_clip: 1,
    signature_numerator: 4,
    signature_denominator: 4,
  });
}

describe("updateClip - deadline exceeded", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    vi.mocked(isDeadlineExceeded).mockReturnValue(false);
    vi.mocked(computeLoopDeadline).mockClear();
  });

  it("checks the deadline it inherited instead of starting a fresh budget", async () => {
    // The V8 adapter sets it once per request. Recomputing here from timeoutMs
    // would give a nested call (duplicate -> updateClip) a full budget of its
    // own, so N of them could overrun the request timeout together.
    setupTwoMidiClips(mocks);

    const deadline = Date.now() + 5_000;

    await updateClip(
      { id: "123", name: "Updated" },
      { timeoutMs: 30_000, deadline },
    );

    expect(isDeadlineExceeded).toHaveBeenCalledWith(deadline);
    expect(computeLoopDeadline).not.toHaveBeenCalled();
  });

  it("should stop updating clips when deadline is exceeded", async () => {
    setupTwoMidiClips(mocks);

    // Deadline exceeded immediately - should not process any clips
    vi.mocked(isDeadlineExceeded).mockReturnValue(true);

    const result = await updateClip(
      { id: "123, 456", name: "Updated" },
      { timeoutMs: 1 },
    );

    // No clips should be updated
    expect(result).toStrictEqual([]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Ran out of time after updating 0 of 2 clips"),
    );
  });

  it("names the clips a cut-short batch did not reach", async () => {
    setupTwoMidiClips(mocks);

    vi.mocked(isDeadlineExceeded)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await updateClip({ id: "123, 456", name: "Updated" }, { timeoutMs: 100 });

    // A bare count doesn't say which id to re-run.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Not updated: 456. Re-run for those ids."),
    );
  });

  it("should process some clips before deadline is exceeded", async () => {
    setupTwoMidiClips(mocks);

    // Allow first clip, then exceed deadline
    vi.mocked(isDeadlineExceeded)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const result = await updateClip(
      { id: "123, 456", name: "Updated" },
      { timeoutMs: 100 },
    );

    // Only first clip should be updated (unwrapSingleResult returns single object)
    expect(result).toStrictEqual({ id: "123" });
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Ran out of time after updating 1 of 2 clips"),
    );
  });
});
