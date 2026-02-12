// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  mockContext,
  registerArrangementClip,
  registerClipHandle,
  registerClipSlotHandle,
  registerLiveSetHandle,
  registerTrackWithQueuedMethods,
  registerSceneHandle,
} from "./arrangement-tiling-test-helpers.ts";
import {
  adjustClipPreRoll,
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "./arrangement-tiling.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createShortenedClipInHolding", () => {
  it("duplicates clip to holding area and shortens to target length", () => {
    const { clip: sourceClip } = registerArrangementClip("100", 0, {
      loop_start: 0,
      loop_end: 16,
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
      create_midi_clip: [["id", "300"]],
      delete_clip: [null],
    });

    registerClipHandle("200", {
      properties: {
        end_time: 1016,
      },
    });

    const result = createShortenedClipInHolding(
      sourceClip,
      track,
      8,
      1000,
      true,
      mockContext,
    );

    expect(trackHandle.call).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 100",
      1000,
    );
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      2,
      "create_midi_clip",
      1008,
      8,
    );
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      3,
      "delete_clip",
      "id 300",
    );
    expect(result).toStrictEqual({
      holdingClipId: "200",
      holdingClip: expect.any(MockLiveAPI),
    });
    expect(result.holdingClip.id).toBe("200");
  });

  it("calculates temp clip length correctly for different target lengths", () => {
    const { clip: sourceClip } = registerArrangementClip("100", 0, {
      loop_start: 0,
      loop_end: 32,
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
      create_midi_clip: [["id", "300"]],
      delete_clip: [null],
    });

    registerClipHandle("200", {
      properties: {
        end_time: 2032,
      },
    });

    createShortenedClipInHolding(
      sourceClip,
      track,
      12,
      2000,
      true,
      mockContext,
    );

    expect(trackHandle.call).toHaveBeenNthCalledWith(
      2,
      "create_midi_clip",
      2012,
      20,
    );
  });

  it("creates audio clip in session for audio clip shortening", () => {
    const { clip: sourceClip } = registerArrangementClip("100", 0, {
      loop_start: 0,
      loop_end: 16,
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "500"],
      ],
      delete_clip: [null],
    });

    registerClipHandle("200", {
      properties: {
        end_time: 1016,
      },
    });

    registerLiveSetHandle({
      properties: {
        scenes: ["id", "1", "id", "2"],
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
    registerSceneHandle("1", 0, {
      properties: {
        is_empty: 0,
      },
    });
    registerSceneHandle("2", 1, {
      properties: {
        is_empty: 1,
      },
    });

    const clipSlotHandle = registerClipSlotHandle(0, 1, {
      methods: {
        create_audio_clip: () => null,
        delete_clip: () => null,
      },
    });

    const sessionClipHandle = registerClipHandle("400", {
      path: "live_set tracks 0 clip_slots 1 clip",
    });

    const result = createShortenedClipInHolding(
      sourceClip,
      track,
      8,
      1000,
      false,
      mockContext,
    );

    expect(trackHandle.call).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 100",
      1000,
    );
    expect(clipSlotHandle.call).toHaveBeenNthCalledWith(
      1,
      "create_audio_clip",
      "/tmp/test-silence.wav",
    );

    expect(sessionClipHandle.set).toHaveBeenCalledWith("warping", 1);
    expect(sessionClipHandle.set).toHaveBeenCalledWith("looping", 1);
    expect(sessionClipHandle.set).toHaveBeenCalledWith("loop_end", 8);

    expect(trackHandle.call).toHaveBeenNthCalledWith(
      2,
      "duplicate_clip_to_arrangement",
      "id 400",
      1008,
    );
    expect(clipSlotHandle.call).toHaveBeenNthCalledWith(2, "delete_clip");
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      3,
      "delete_clip",
      "id 500",
    );

    expect(result).toStrictEqual({
      holdingClipId: "200",
      holdingClip: expect.any(MockLiveAPI),
    });
  });
});

describe("moveClipFromHolding", () => {
  it("duplicates holding clip to target position and cleans up", () => {
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "400"]],
      delete_clip: [null],
    });

    const result = moveClipFromHolding("200", track, 500);

    expect(trackHandle.call).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 200",
      500,
    );
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      2,
      "delete_clip",
      "id 200",
    );
    expect(result).toBeInstanceOf(MockLiveAPI);
    expect(result.id).toBe("400");
  });

  it("works with different holding clip IDs and positions", () => {
    const { track, trackHandle } = registerTrackWithQueuedMethods(2, {
      duplicate_clip_to_arrangement: [["id", "999"]],
      delete_clip: [null],
    });

    moveClipFromHolding("777", track, 1234);

    expect(trackHandle.call).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 777",
      1234,
    );
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      2,
      "delete_clip",
      "id 777",
    );
  });
});

describe("adjustClipPreRoll", () => {
  it("does nothing when clip has no pre-roll (start_marker >= loop_start)", () => {
    const clipHandle = registerClipHandle("100", {
      properties: {
        start_marker: 4,
        loop_start: 4,
      },
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {});
    const clip = LiveAPI.from("id 100");

    adjustClipPreRoll(clip, track, true, mockContext);

    expect(trackHandle.call).not.toHaveBeenCalled();
    expect(clipHandle.set).not.toHaveBeenCalled();
  });

  it("does nothing when start_marker > loop_start", () => {
    const clipHandle = registerClipHandle("100", {
      properties: {
        start_marker: 8,
        loop_start: 4,
      },
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {});
    const clip = LiveAPI.from("id 100");

    adjustClipPreRoll(clip, track, true, mockContext);

    expect(trackHandle.call).not.toHaveBeenCalled();
    expect(clipHandle.set).not.toHaveBeenCalled();
  });

  it("adjusts start_marker and shortens clip when pre-roll exists", () => {
    const clipHandle = registerClipHandle("100", {
      properties: {
        start_marker: 2,
        loop_start: 6,
        end_time: 100,
      },
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {
      create_midi_clip: [["id", "300"]],
      delete_clip: [null],
    });
    const clip = LiveAPI.from("id 100");

    adjustClipPreRoll(clip, track, true, mockContext);

    expect(clipHandle.set).toHaveBeenCalledWith("start_marker", 6);
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      1,
      "create_midi_clip",
      96,
      4,
    );
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      2,
      "delete_clip",
      "id 300",
    );
  });

  it("handles different pre-roll amounts correctly", () => {
    const clipHandle = registerClipHandle("100", {
      properties: {
        start_marker: 0,
        loop_start: 8,
        end_time: 200,
      },
    });
    const { track, trackHandle } = registerTrackWithQueuedMethods(1, {
      create_midi_clip: [["id", "400"]],
      delete_clip: [null],
    });
    const clip = LiveAPI.from("id 100");

    adjustClipPreRoll(clip, track, true, mockContext);

    expect(clipHandle.set).toHaveBeenCalledWith("start_marker", 8);
    expect(trackHandle.call).toHaveBeenNthCalledWith(
      1,
      "create_midi_clip",
      192,
      8,
    );
  });

  it("adjusts audio clip with pre-roll using session view workflow", () => {
    const clipHandle = registerClipHandle("100", {
      properties: {
        start_marker: 2,
        loop_start: 6,
        end_time: 100,
      },
    });

    registerLiveSetHandle({
      properties: {
        scenes: ["id", "500"],
      },
    });
    registerSceneHandle("500", 0, {
      properties: {
        is_empty: 1,
      },
    });

    const slotHandle = registerClipSlotHandle(0, 0, {
      methods: {
        create_audio_clip: () => null,
        delete_clip: () => null,
      },
    });
    const sessionClipHandle = registerClipHandle("700", {
      path: "live_set tracks 0 clip_slots 0 clip",
    });

    const { track, trackHandle } = registerTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "800"]],
      delete_clip: [null],
    });

    const clip = LiveAPI.from("id 100");

    adjustClipPreRoll(clip, track, false, mockContext);

    expect(clipHandle.set).toHaveBeenCalledWith("start_marker", 6);
    expect(slotHandle.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/tmp/test-silence.wav",
    );
    expect(sessionClipHandle.set).toHaveBeenCalledWith("warping", 1);
    expect(sessionClipHandle.set).toHaveBeenCalledWith("looping", 1);
    expect(sessionClipHandle.set).toHaveBeenCalledWith("loop_end", 4);
    expect(trackHandle.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 700",
      96,
    );
    expect(slotHandle.call).toHaveBeenCalledWith("delete_clip");
    expect(trackHandle.call).toHaveBeenCalledWith("delete_clip", "id 800");
  });
});
