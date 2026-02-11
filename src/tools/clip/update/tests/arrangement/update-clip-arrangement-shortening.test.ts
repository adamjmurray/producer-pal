// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall } from "#src/test/mocks/mock-live-api.ts";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import * as arrangementTiling from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import {
  setupMidiClipMock,
  type UpdateClipMockHandles,
  setupArrangementClipPath,
  setupMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

function setupClipProperties(
  handle: MockObjectHandle,
  props: Record<string, unknown>,
): void {
  const fallbackGet = handle.get.getMockImplementation();

  handle.get.mockImplementation((prop: string) => {
    const value = props[prop];

    if (value !== undefined) {
      return [value];
    }

    if (fallbackGet != null) {
      return fallbackGet.call(handle, prop);
    }

    return [0];
  });
}

describe("updateClip - arrangementLength (shortening only)", () => {
  let defaultHandles: UpdateClipMockHandles;

  beforeEach(() => {
    defaultHandles = setupMocks();
  });

  it("should shorten arrangement clip to 50% of original length", async () => {
    const trackIndex = 0;

    const clipHandles = setupArrangementClipPath(trackIndex, ["789"]);
    const sourceClip = clipHandles.get("789");

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected source clip handle for 789");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0, // 4 bars starting at beat 0
      end_time: 16.0, // 4 bars ending at beat 16
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "2:0", // 2 bars = 8 beats (50% of 4 bars)
    });

    // Should create temp clip at beat 8 with length 8
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_midi_clip",
      8.0, // newEndTime
      8.0, // tempClipLength
    );

    // Should delete the temp clip
    expect(liveApiCall).toHaveBeenCalledWith("delete_clip", expect.any(String));

    expect(result).toStrictEqual({ id: "789" });
  });

  it("should shorten arrangement clip to single beat", async () => {
    const trackIndex = 0;

    const clipHandles = setupArrangementClipPath(trackIndex, ["789"]);
    const sourceClip = clipHandles.get("789");

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected source clip handle for 789");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0,
      end_time: 16.0, // 4 bars
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "0:1", // 1 beat
    });

    // Should create temp clip at beat 1 with length 15
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_midi_clip",
      1.0, // newEndTime
      15.0, // tempClipLength
    );

    expect(result).toStrictEqual({ id: "789" });
  });

  it("should emit warning and ignore for session clips", async () => {
    setupMidiClipMock(defaultHandles.clip123, {
      is_arrangement_clip: 0, // Session clip
      is_midi_clip: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    });

    const result = await updateClip({
      ids: "123",
      arrangementLength: "2:0",
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      "arrangementLength parameter ignored for session clip (id 123)",
    );

    // Should not call create_midi_clip or delete_clip
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle zero length with clear error", async () => {
    setupClipProperties(defaultHandles.clip789, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0,
      end_time: 16.0,
      signature_numerator: 4,
      signature_denominator: 4,
    });

    await expect(
      updateClip({
        ids: "789",
        arrangementLength: "0:0",
      }),
    ).rejects.toThrow("arrangementLength must be greater than 0");
  });

  it("should handle same length as no-op", async () => {
    const trackIndex = 0;
    const clipHandles = setupArrangementClipPath(trackIndex, ["789"]);
    const sourceClip = clipHandles.get("789");

    expect(sourceClip).toBeDefined();

    if (sourceClip == null) {
      throw new Error("Expected source clip handle for 789");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0,
      end_time: 16.0, // 4 bars
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });

    liveApiCall.mockClear(); // Clear previous calls

    const result = await updateClip({
      ids: "789",
      arrangementLength: "4:0", // Same as current length
    });

    // Should not create temp clip (no-op)
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );

    expect(result).toStrictEqual({ id: "789" });
  });

  it("should allow both arrangementLength and arrangementStart (move then resize)", async () => {
    // Order of operations: move FIRST, then resize
    // This ensures lengthening operations use the new position for tile placement
    const trackIndex = 0;
    const movedClipId = "999";
    const clipHandles = setupArrangementClipPath(trackIndex, [
      "789",
      movedClipId,
    ]);
    const sourceClip = clipHandles.get("789");
    const movedClip = clipHandles.get(movedClipId);

    expect(sourceClip).toBeDefined();
    expect(movedClip).toBeDefined();

    if (sourceClip == null || movedClip == null) {
      throw new Error("Expected source and moved clip handles");
    }

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 0.0,
      end_time: 16.0, // 4 bars at original position
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });
    setupClipProperties(movedClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: 32.0, // Moved to bar 9
      end_time: 48.0, // Still 4 bars long (16 beats)
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });

    // Mock duplicate_clip_to_arrangement to return moved clip
    liveApiCall.mockImplementation(function (method: string) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${movedClipId}`;
      }
    });

    const result = await updateClip({
      ids: "789",
      arrangementLength: "2:0", // Shorten to 2 bars
      arrangementStart: "9|1", // Move to bar 9
    });

    // Should FIRST duplicate to new position (move operation)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 789",
      32.0, // bar 9 in 4/4 = 32 beats
    );

    // Should delete original after move
    expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 789");

    // Should THEN create temp clip to shorten (at moved position)
    // Shortening from 32-48 to 32-40 means temp clip at position 40
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_midi_clip",
      40.0, // newEndTime = 32 + 8 (2 bars)
      8.0, // tempClipLength = 48 - 40 = 8
    );

    expect(result).toStrictEqual({ id: movedClipId });
  });

  it("should call createAudioClipInSession with correct arguments when shortening audio clip", async () => {
    const trackIndex = 0;
    const silenceWavPath = "/path/to/silence.wav";
    const tempClipId = "temp-session-clip";
    const tempArrangementClipId = "temp-arrangement-clip";

    const clipHandles = setupArrangementClipPath(trackIndex, [
      "789",
      tempArrangementClipId,
    ]);
    const sourceClip = clipHandles.get("789");
    const tempArrangementClip = clipHandles.get(tempArrangementClipId);

    expect(sourceClip).toBeDefined();
    expect(tempArrangementClip).toBeDefined();

    if (sourceClip == null || tempArrangementClip == null) {
      throw new Error("Expected arrangement clip handles");
    }

    registerMockObject(tempClipId, {
      path: `live_set tracks ${trackIndex} clip_slots 0 clip`,
      properties: {
        is_midi_clip: 0,
        is_audio_clip: 1,
      },
    });

    setupClipProperties(sourceClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 0, // Audio clip
      is_audio_clip: 1,
      start_time: 0.0,
      end_time: 16.0, // 4 bars
      signature_numerator: 4,
      signature_denominator: 4,
      trackIndex,
    });
    setupClipProperties(tempArrangementClip, {
      is_arrangement_clip: 1,
      is_midi_clip: 0,
      is_audio_clip: 1,
    });

    // Mock liveApiCall for duplicate_clip_to_arrangement
    liveApiCall.mockImplementation(function (method: string) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tempArrangementClipId}`;
      }
    });

    // Mock createAudioClipInSession to verify it's called with correct arguments
    const mockCreateAudioClip = vi
      .spyOn(arrangementTiling, "createAudioClipInSession")
      .mockReturnValue({
        clip: { id: tempClipId } as unknown as LiveAPI,
        slot: { call: vi.fn() } as unknown as LiveAPI,
      });

    await updateClip(
      {
        ids: "789",
        arrangementLength: "2:0", // Shorten to 2 bars (8 beats)
      },
      { silenceWavPath },
    );

    // Verify createAudioClipInSession was called with correct 3 arguments:
    // 1. track object
    // 2. tempClipLength (8.0 beats)
    // 3. silenceWavPath from context
    expect(mockCreateAudioClip).toHaveBeenCalledWith(
      expect.objectContaining({ _path: `live_set tracks ${trackIndex}` }),
      8.0, // tempClipLength = originalEnd (16) - newEnd (8)
      silenceWavPath,
    );

    mockCreateAudioClip.mockRestore();
  });
});
