// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  mockContext,
  setupArrangementClip,
  setupClip,
  setupClipSlot,
  setupLiveSet,
  setupMidiSourceClip,
  setupScene,
  setupTileClip,
  setupTrackWithQueuedMethods,
} from "./arrangement-tiling-test-helpers.ts";
import { createPartialTile, tileClipToRange } from "../arrangement-tiling.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPartialTile", () => {
  /**
   * Set up common mocks for createPartialTile tests.
   * @param opts - Loop and holding clip configuration
   * @param opts.loopStart - Loop start position
   * @param opts.loopEnd - Loop end position
   * @param opts.holdingEndTime - Holding clip end time
   * @param opts.finalClipProps - Optional properties for final clip
   * @returns Source clip and track mocks
   */
  function setupPartialTileMocks(opts: {
    loopStart: number;
    loopEnd: number;
    holdingEndTime: number;
    finalClipProps?: Record<string, unknown>;
  }) {
    const sourceClip = setupArrangementClip("100", 0, {
      loop_start: opts.loopStart,
      loop_end: opts.loopEnd,
      start_marker: opts.loopStart,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "400"],
      ],
      create_midi_clip: [["id", "300"]],
      delete_clip: [null, null],
    });

    setupClip("200", { properties: { end_time: opts.holdingEndTime } });

    if (opts.finalClipProps) {
      setupClip("400", { properties: opts.finalClipProps });
    }

    return { sourceClip, track };
  }

  it("creates partial tile by combining helper functions", () => {
    const { sourceClip, track } = setupPartialTileMocks({
      loopStart: 2,
      loopEnd: 10,
      holdingEndTime: 1008,
      finalClipProps: { start_marker: 2, loop_start: 2 },
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
    const { sourceClip, track } = setupPartialTileMocks({
      loopStart: 1,
      loopEnd: 11,
      holdingEndTime: 1010,
    });

    createPartialTile(sourceClip, track, 500, 8, 1000, true, mockContext, {
      adjustPreRoll: false,
    });

    expect(track.call).toHaveBeenCalledTimes(5);
  });

  it("adjusts pre-roll on the created tile when adjustPreRoll defaults to true", () => {
    // adjustPreRoll is omitted → defaults to true. The moved tile (clip 400) has
    // pre-roll (start_marker 2 < loop_start 6), so the default path must snap its
    // start_marker up to loop_start (6). Source loop_start is 1 so the earlier
    // content-offset set("start_marker", 1) can't be confused with this snap.
    const result = createPartialTileWithPreRoll();

    expect(result.set).toHaveBeenCalledWith("start_marker", 6);
  });

  it("does not adjust pre-roll when adjustPreRoll is false even if the tile has pre-roll", () => {
    // The tile has pre-roll (start_marker 2 < loop_start 6), but adjustPreRoll is
    // explicitly false, so it must be left untouched (no snap to loop_start).
    const result = createPartialTileWithPreRoll(false);

    expect(result.set).not.toHaveBeenCalledWith("start_marker", 6);
  });

  it("sets the tile start_marker from source loop_start plus content offset", () => {
    // clipLength = loopEnd 10 - loopStart 2 = 8; contentOffset 10 → 10 % 8 = 2 →
    // start_marker = loopStart 2 + 2 = 4. The tile has no pre-roll (start_marker
    // 4 >= loop_start 2) and adjustPreRoll is false, isolating the offset math.
    const { sourceClip, track } = setupPartialTileMocks({
      loopStart: 2,
      loopEnd: 10,
      holdingEndTime: 1008,
      finalClipProps: { start_marker: 4, loop_start: 2, end_time: 100 },
    });

    const result = createPartialTile(
      sourceClip,
      track,
      500,
      6,
      1000,
      true,
      mockContext,
      { adjustPreRoll: false, contentOffset: 10 },
    );

    expect(result.set).toHaveBeenCalledWith("start_marker", 4);
  });

  /**
   * Create a partial tile whose moved tile (clip 400) carries pre-roll
   * (start_marker 2 < loop_start 6). The source loop_start is 1, so the earlier
   * content-offset set("start_marker", 1) can never be mistaken for a pre-roll
   * snap to 6.
   * @param adjustPreRoll - Omit to exercise the default (true), or pass false to
   * disable the pre-roll snap explicitly
   * @returns The created partial tile
   */
  function createPartialTileWithPreRoll(adjustPreRoll?: boolean) {
    const { sourceClip, track } = setupPartialTileMocks({
      loopStart: 1,
      loopEnd: 11,
      holdingEndTime: 1010,
      finalClipProps: { start_marker: 2, loop_start: 6, end_time: 100 },
    });

    return createPartialTile(
      sourceClip,
      track,
      500,
      6,
      1000,
      true,
      mockContext,
      { adjustPreRoll },
    );
  }
});

describe("tileClipToRange", () => {
  it("creates correct number of full tiles without remainder", () => {
    const sourceClip = setupMidiSourceClip("100", 0);
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
        ["id", "202"],
      ],
    });

    setupTileClip("200");
    setupTileClip("201");
    setupTileClip("202");

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
    const sourceClip = setupMidiSourceClip("100", 0);
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

    setupTileClip("200");
    setupTileClip("201");
    setupClip("300", { properties: { end_time: 1004 } });
    setupTileClip("302");

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

  it("skips the partial tile when the source overlaps its target", () => {
    // Defensive guard: no current caller tiles over the source (they start at
    // the source's end), but a future one could. Source [100,104] is the only
    // arrangement clip; a remainder-2 partial would land at [100,102], inside
    // the source. It must be skipped, not routed through the holding area where
    // it would trim the source.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_arrangement_clip: 1,
      start_time: 100,
      end_time: 104,
    });
    const track = setupTrackWithQueuedMethods(0, {});

    // totalLength 2 < clipLength 4 → zero full tiles, a 2-beat partial at 100.
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      2,
      1000,
      mockContext,
    );

    expect(result).toStrictEqual([]);
    expect(track.call).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("overlaps the partial tile"),
    );
    warn.mockRestore();
  });

  it("skips a full tile when the source overlaps its own target position", () => {
    // A full tile landing on the source's own range cannot be cleared without
    // destroying the content being duplicated, so clearClipAtDuplicateTarget
    // returns false and the tile is skipped (no dup, position advances).
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_arrangement_clip: 1,
      start_time: 100,
      end_time: 104,
    });
    const track = setupTrackWithQueuedMethods(0, {});

    // totalLength 4 === clipLength 4 → one full tile at 100, on top of the
    // source [100,104]. Remainder is 0, so there is no partial tile either.
    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      4,
      1000,
      mockContext,
    );

    expect(result).toStrictEqual([]);
    expect(track.call).not.toHaveBeenCalled();
  });

  it("does not create partial tile when remainder is negligible", () => {
    const sourceClip = setupMidiSourceClip("100", 0);
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
    });

    setupTileClip("200");

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
    const sourceClip = setupMidiSourceClip("100", 0, {
      loop_start: 4,
      loop_end: 8,
      start_marker: 2,
      end_marker: 8,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
    });

    setupTileClip("200", { start_marker: 2, loop_start: 4 });

    tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext, {
      adjustPreRoll: false,
    });

    expect(track.call).toHaveBeenCalledTimes(1);
  });

  it("handles zero-length range gracefully", () => {
    const sourceClip = setupMidiSourceClip("100", 0);
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
    const { result } = tilePartialOnlyMidiSource();

    expect(result).toHaveLength(1);
  });

  it("sets start_marker correctly when using startOffset parameter", () => {
    const sourceClip = setupMidiSourceClip("100", 0, {
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

    const tile1 = setupTileClip("200", { start_marker: 2, loop_start: 2 });
    const tile2 = setupTileClip("201", { start_marker: 2, loop_start: 2 });
    const tile3 = setupTileClip("202", { start_marker: 2, loop_start: 2 });

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
    const sourceClip = setupMidiSourceClip("100", 0, {
      end_marker: 8, // end_marker differs from loop_end
    });

    tileSourceAsSingleFullTile(sourceClip);

    // Should set end_marker to loop_end (4) because they differed
    expect(sourceClip.set).toHaveBeenCalledWith("end_marker", 4);
  });

  it("does not touch end_marker when it already equals loop_end", () => {
    // Default setupMidiSourceClip has end_marker 4 === loop_end 4, so the safety
    // set must be skipped entirely (no needless set that could shift markers).
    const sourceClip = setupMidiSourceClip("100", 0);

    tileSourceAsSingleFullTile(sourceClip);

    expect(sourceClip.set).not.toHaveBeenCalledWith(
      "end_marker",
      expect.anything(),
    );
  });

  it("adjusts pre-roll on a full tile when adjustPreRoll defaults to true", () => {
    // adjustPreRoll is omitted → defaults to true. The created tile (clip 200)
    // has pre-roll (start_marker 2 < loop_start 4), so the default path must snap
    // its start_marker up to loop_start (4). The source loop_start is 0, so the
    // earlier content set("start_marker", 0) can't be mistaken for this snap.
    const sourceClip = setupMidiSourceClip("100", 0);
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
      create_midi_clip: [["id", "300"]],
      delete_clip: [null],
    });

    const tile = setupTileClip("200", {
      start_marker: 2,
      loop_start: 4,
      end_time: 100,
    });

    tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext);

    expect(tile.set).toHaveBeenCalledWith("start_marker", 4);
  });

  it("routes the partial tile through the MIDI holding path and returns its id", () => {
    // A MIDI source with a remainder tile must build the shortened holding copy
    // with create_midi_clip (the audio path would need session scenes). The
    // returned entry must carry the partial tile's id, not an empty object.
    const { result, track } = tilePartialOnlyMidiSource();

    expect(track.call).toHaveBeenCalledWith(
      "create_midi_clip",
      expect.any(Number),
      expect.any(Number),
    );
    expect(result).toStrictEqual([{ id: "301" }]);
  });

  it("advances content offset correctly with custom tileLength", () => {
    const { sourceClip, track, tiles } = setupThreeTileMocks();

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
    expect(tiles[0]!.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tiles[1]!.set).toHaveBeenCalledWith("start_marker", 1);
    expect(tiles[2]!.set).toHaveBeenCalledWith("start_marker", 2);
    expect(result).toHaveLength(3);
  });

  it("wraps start_marker correctly when offsetting through multiple loops", () => {
    const { sourceClip, track, tiles } = setupThreeTileMocks();

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

    expect(tiles[0]!.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tiles[1]!.set).toHaveBeenCalledWith("start_marker", 0);
    expect(tiles[2]!.set).toHaveBeenCalledWith("start_marker", 0);
    expect(result).toHaveLength(3);
  });

  it("uses the audio (session) path when tiling an audio source", () => {
    // An audio source must build its pre-roll trim through the session
    // (create_audio_clip), never create_midi_clip. The full tile carries pre-roll
    // (start_marker 2 < loop_start 4) to force adjustClipPreRoll down the audio
    // branch — a MIDI/audio misdetection would call create_midi_clip instead.
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_midi_clip: 0,
      is_audio_clip: 1,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "600"],
      ],
      delete_clip: [null, null],
    });

    setupTileClip("200", { start_marker: 2, loop_start: 4, end_time: 100 });
    setupLiveSet({ properties: { scenes: ["id", "s1"] } });
    setupScene("s1", 0, { properties: { is_empty: 1 } });
    const slot = setupClipSlot(0, 0, {
      methods: {
        create_audio_clip: () => null,
        delete_clip: () => null,
      },
    });

    setupClip("700", { path: "live_set tracks 0 clip_slots 0 clip" });

    tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext);

    expect(slot.call).toHaveBeenCalledWith(
      "create_audio_clip",
      "/tmp/test-silence.wav",
    );
    expect(track.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it("advances position and content offset past a self-overlapping full tile", () => {
    // The source occupies arrangement [100,104]; tiling starts on top of it, so
    // tile 0 self-overlaps and is skipped. With tileLength 6 (≠ clipLength 4) the
    // next tile must land at 100 + 6 = 106 and read content at offset 6 (6 % 4 = 2)
    // — proving both the position and the content-offset advance in the skip path.
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_arrangement_clip: 1,
      start_time: 100,
      end_time: 104,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [["id", "200"]],
    });
    const tile = setupTileClip("200");

    tileClipToRange(sourceClip, track, 100, 12, 1000, mockContext, {
      tileLength: 6,
    });

    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      106,
    );
    expect(tile.set).toHaveBeenCalledWith("start_marker", 2);
  });

  it("advances content offset past a silently-failed full tile", () => {
    // clipLength 5 with tileLength 6 (≠) makes the content offset observable via
    // start_marker. The middle tile's dup silently fails and is skipped; the tile
    // after it must still read content at the advanced offset (12 % 5 = 2), not a
    // rewound one.
    const sourceClip = setupMidiSourceClip("100", 0, {
      loop_end: 5,
      end_marker: 5,
    });
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", 0],
        ["id", "202"],
      ],
    });

    setupTileClip("200");
    const tile2 = setupTileClip("202");

    tileClipToRange(sourceClip, track, 200, 18, 1000, mockContext, {
      tileLength: 6,
    });

    expect(tile2.set).toHaveBeenCalledWith("start_marker", 2);
  });

  it("warns and skips a tile when its dup silently fails, advancing position", () => {
    // Middle dup returns ["id", 0] — that tile is skipped, the next tile
    // is created at the correct downstream position, and no phantom id is
    // pushed into the result.
    const sourceClip = setupMidiSourceClip("100", 0);
    const track = setupTrackWithQueuedMethods(0, {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", 0],
        ["id", "202"],
      ],
    });

    setupTileClip("200");
    setupTileClip("202");

    const result = tileClipToRange(
      sourceClip,
      track,
      100,
      12,
      1000,
      mockContext,
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "Failed to duplicate source clip for tile at 104",
      ),
    );
    expect(result).toStrictEqual([{ id: "200" }, { id: "202" }]);
    // Third tile must be at position 108 (offset advanced over the skip)
    expect(track.call).toHaveBeenNthCalledWith(
      3,
      "duplicate_clip_to_arrangement",
      "id 100",
      108,
    );
  });
});

/**
 * Tile an 8-beat MIDI source over a 3-beat range, so there are zero full tiles
 * and a single 3-beat partial tile routed through the holding area: the holding
 * copy is clip 300, and the partial tile that lands at 100 is clip 301.
 * @returns The tileClipToRange result and the track mock
 */
function tilePartialOnlyMidiSource() {
  const sourceClip = setupMidiSourceClip("100", 0, {
    loop_end: 8,
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

  setupClip("300", { properties: { end_time: 1008 } });
  setupTileClip("301");

  const result = tileClipToRange(sourceClip, track, 100, 3, 1000, mockContext);

  return { result, track };
}

/**
 * Tile the given source over a 4-beat range at position 100, producing exactly
 * one full tile (clip 200) and no remainder.
 * @param sourceClip - The source clip to tile
 * @returns The track and tile mocks
 */
function tileSourceAsSingleFullTile(sourceClip: LiveAPI) {
  const track = setupTrackWithQueuedMethods(0, {
    duplicate_clip_to_arrangement: [["id", "200"]],
  });
  const tile = setupTileClip("200");

  tileClipToRange(sourceClip, track, 100, 4, 1000, mockContext);

  return { track, tile };
}

/**
 * Set up a MIDI source clip, track, and 3 tile clips for tileClipToRange tests.
 * @returns Source clip, track, and tile mocks
 */
function setupThreeTileMocks() {
  const sourceClip = setupMidiSourceClip("100", 0);
  const track = setupTrackWithQueuedMethods(0, {
    duplicate_clip_to_arrangement: [
      ["id", "200"],
      ["id", "201"],
      ["id", "202"],
    ],
  });

  const tiles = [
    setupTileClip("200"),
    setupTileClip("201"),
    setupTileClip("202"),
  ];

  return { sourceClip, track, tiles };
}
