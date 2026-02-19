// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  mockContext,
  setupArrangementClip,
  setupClip,
  setupTrackWithQueuedMethods,
} from "./arrangement-tiling-test-helpers.ts";
import { createPartialTile, tileClipToRange } from "../arrangement-tiling.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPartialTile", () => {
  it("creates partial tile by combining helper functions", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      loop_start: 2,
      loop_end: 10,
      start_marker: 2,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "400"],
      ],
      create_midi_clip: [["id", "300"]],
      delete_clip: [null, null],
    });

    setupClip("200", {
      properties: {
        end_time: 1008,
      },
    });
    setupClip("400", {
      properties: {
        start_marker: 2,
        loop_start: 2,
      },
    });

    const result = createPartialTile(
      sourceClip,
      track,
      500,
      6,
      1000,
      true,
      mockContext,
    );

    expect(result).toBeInstanceOf(MockLiveAPI);
  });

  it("skips pre-roll adjustment when adjustPreRoll is false", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      loop_start: 1,
      loop_end: 11,
      start_marker: 1,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "400"],
      ],
      create_midi_clip: [["id", "300"]],
      delete_clip: [null, null],
    });

    setupClip("200", {
      properties: {
        end_time: 1010,
      },
    });

    createPartialTile(
      sourceClip,
      track,
      500,
      8,
      1000,
      true,
      mockContext,
      false,
    );

    expect(track.call).toHaveBeenCalledTimes(5);
  });
});

describe("tileClipToRange", () => {
  it("creates correct number of full tiles without remainder", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
        ["id", "202"],
      ],
    });

    setupClip("200", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    setupClip("201", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    setupClip("202", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      12,
      1000,
      mockContext,
    );

    expect(track.call).toHaveBeenCalledTimes(3);
    expect(track.call).toHaveBeenNthCalledWith(
      1,
      "duplicate_clip_to_arrangement",
      "id 100",
      100,
    );
    expect(track.call).toHaveBeenNthCalledWith(
      2,
      "duplicate_clip_to_arrangement",
      "id 100",
      104,
    );
    expect(track.call).toHaveBeenNthCalledWith(
      3,
      "duplicate_clip_to_arrangement",
      "id 100",
      108,
    );

    expect(result).toStrictEqual([{ id: "200" }, { id: "201" }, { id: "202" }]);
  });

  it("creates appropriate combination of full and partial tiles", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
        ["id", "300"],
        ["id", "302"],
      ],
      create_midi_clip: [["id", "301"]],
      delete_clip: [null, null],
    });

    setupClip("200", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    setupClip("201", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    setupClip("300", {
      properties: {
        end_time: 1004,
      },
    });
    setupClip("302", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      10,
      1000,
      mockContext,
    );

    expect(result.length).toBeGreaterThan(2);
  });

  it("does not create partial tile when remainder is negligible", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
    });

    setupClip("200", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      4.0005,
      1000,
      mockContext,
    );

    expect(track.call).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("skips pre-roll adjustment when adjustPreRoll is false", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 4,
      loop_end: 8,
      start_marker: 2,
      end_marker: 8,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
    });

    setupClip("200", {
      properties: {
        start_marker: 2,
        loop_start: 4,
      },
    });

    tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext, {
      adjustPreRoll: false,
    });

    expect(track.call).toHaveBeenCalledTimes(1);
  });

  it("handles zero-length range gracefully", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
    });
    const track = setupTrackWithQueuedMethods(0, {});

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      0,
      1000,
      mockContext,
    );

    expect(track.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual([]);
  });

  it("handles only partial tile when total length less than clip length", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 8,
      start_marker: 0,
      end_marker: 8,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "300"],
        ["id", "301"],
      ],
      create_midi_clip: [["id", "302"]],
      delete_clip: [null, null],
    });

    setupClip("300", {
      properties: {
        end_time: 1008,
      },
    });
    setupClip("301", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      3,
      1000,
      mockContext,
    );

    expect(result).toHaveLength(1);
  });

  it("sets start_marker correctly when using startOffset parameter", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 2,
      loop_end: 10,
      start_marker: 2,
      end_marker: 10,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
        ["id", "202"],
      ],
    });

    const tile1 = setupClip("200", {
      properties: {
        start_marker: 2,
        loop_start: 2,
      },
    });
    const tile2 = setupClip("201", {
      properties: {
        start_marker: 2,
        loop_start: 2,
      },
    });
    const tile3 = setupClip("202", {
      properties: {
        start_marker: 2,
        loop_start: 2,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      24,
      1000,
      mockContext,
      {
        startOffset: 3,
      },
    );

    expect(tile1.set).toHaveBeenCalledWith("start_marker", 5);
    expect(tile2.set).toHaveBeenCalledWith("start_marker", 5);
    expect(tile3.set).toHaveBeenCalledWith("start_marker", 5);
    expect(result).toHaveLength(3);
  });

  it("sets end_marker to match loop_end when they differ", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 8, // end_marker differs from loop_end
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
    });

    setupClip("200", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext);

    // Should set end_marker to loop_end (4) because they differed
    expect(sourceClip.set).toHaveBeenCalledWith("end_marker", 4);
  });

  it("advances content offset correctly with custom tileLength", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
        ["id", "202"],
      ],
    });

    const tile1 = setupClip("200", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    const tile2 = setupClip("201", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    const tile3 = setupClip("202", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    // Use tileLength larger than clip to shift offset through content
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      15,
      1000,
      mockContext,
      { tileLength: 5 },
    );

    // tile0: offset=0, marker = 0+0 = 0
    // tile1: offset=5, marker = 0+(5%4) = 0+1 = 1
    // tile2: offset=10, marker = 0+(10%4) = 0+2 = 2
    expect(tile1.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tile2.set).toHaveBeenCalledWith("start_marker", 1);
    expect(tile3.set).toHaveBeenCalledWith("start_marker", 2);
    expect(result).toHaveLength(3);
  });

  it("wraps start_marker correctly when offsetting through multiple loops", () => {
    const sourceClip = setupArrangementClip("100", 0, {
      is_midi_clip: 1,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
        ["id", "202"],
      ],
    });

    const tile1 = setupClip("200", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    const tile2 = setupClip("201", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });
    const tile3 = setupClip("202", {
      properties: {
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      12,
      1000,
      mockContext,
      {
        startOffset: 0,
      },
    );

    expect(tile1.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tile2.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tile3.set).toHaveBeenCalledWith("start_marker", 0);
    expect(result).toHaveLength(3);
  });
});
