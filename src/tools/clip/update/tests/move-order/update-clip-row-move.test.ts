// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  BAR,
  registerClipAt,
  registerRow,
  type RowClip,
} from "./move-order-test-helpers.ts";

describe("updateClip - moving a row of arrangement clips", () => {
  let copies: string[];
  let track: RegisteredMockObject;

  /**
   * A row of 4-bar clips on t0, with the copies Live hands back for each move.
   * @param row - The clips, in call order
   */
  function setupTrack(row: RowClip[]): void {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    registerRow(row);
    copies = [];

    let copyCount = 0;

    track = registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { track_index: 0, has_midi_input: 1, is_frozen: 0 },
      methods: {
        duplicate_clip_to_arrangement: (_sourceId, startTime) => {
          copyCount += 1;

          const copyId = `9${String(copyCount)}`;

          copies.push(copyId);
          registerClipAt(
            copyId,
            livePath.track(0).arrangementClip(row.length + copyCount),
            startTime as number,
            (startTime as number) + 4 * BAR,
          );

          return `id ${copyId}`;
        },
        create_midi_clip: () => "id temp",
        delete_clip: () => null,
      },
    });
  }

  /**
   * Every position the track took a move at, in call order.
   * @returns The target positions in beats
   */
  function movedTo(): number[] {
    return vi
      .mocked(track.call)
      .mock.calls.filter(
        ([method]) => method === "duplicate_clip_to_arrangement",
      )
      .map((call) => call[2] as number);
  }

  /**
   * The response a back-to-front row move hands back: one entry per id the
   * caller named, in that order, holding the copy Live made for it.
   * @param paths - The destination paths, in the caller's order
   * @returns The expected result entries
   */
  function movedRow(
    paths: string[],
  ): Array<{ id: string | undefined; path: string }> {
    return paths.map((path, index) => ({
      id: copies[paths.length - 1 - index],
      path,
    }));
  }

  /**
   * The middle clip used to be cleared before its turn, and the dead object
   * read as a session clip.
   */
  function expectNoSessionClipWarning(): void {
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("session clip"),
    );
  }

  beforeEach(() => {
    setupTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
      { id: "115", start: 32, end: 48 },
    ]);
  });

  it("keeps every clip when a row shifts four bars later", async () => {
    const result = await updateClip({
      id: "113,114,115",
      toPath: "t0[5|1],t0[9|1],t0[13|1]",
    });

    // Back-to-front, so no move clears a clip the loop has yet to reach.
    expect(movedTo()).toStrictEqual([48, 32, 16]);
    // The response still pairs 1:1 with the ids the caller named.
    expect(result).toStrictEqual(movedRow(["t0[5|1]", "t0[9|1]", "t0[13|1]"]));
    expectNoSessionClipWarning();
  });

  // arrangementLength broadcasts, so one value covers every id. Reading it as
  // "these clips aren't moving" switched the ordering off for the whole batch
  // and the row-move loss came straight back.
  it("keeps every clip when the row shift also sets a length", async () => {
    const result = await updateClip({
      id: "113,114,115",
      toPath: "t0[5|1],t0[9|1],t0[13|1]",
      arrangementLength: "4bar",
    });

    expect(movedTo().slice(0, 3)).toStrictEqual([48, 32, 16]);
    expect(result).toStrictEqual(movedRow(["t0[5|1]", "t0[9|1]", "t0[13|1]"]));
    expectNoSessionClipWarning();
  });

  it("keeps a row shifting four bars earlier working", async () => {
    setupTrack([
      { id: "113", start: 16, end: 32 },
      { id: "114", start: 32, end: 48 },
      { id: "115", start: 48, end: 64 },
    ]);

    const result = await updateClip({
      id: "113,114,115",
      toPath: "t0[1|1],t0[5|1],t0[9|1]",
    });

    expect(movedTo()).toStrictEqual([0, 16, 32]);
    expect(result).toStrictEqual([
      { id: copies[0], path: "t0[1|1]" },
      { id: copies[1], path: "t0[5|1]" },
      { id: copies[2], path: "t0[9|1]" },
    ]);
  });

  it("refuses both moves when two clips trade positions", async () => {
    const result = await updateClip({
      id: "113,114",
      toPath: "t0[5|1],t0[1|1]",
    });

    expect(movedTo()).toStrictEqual([]);
    // Each clip is reported where it still is, with its own entry saying why.
    // Nothing else was asked of either clip, so each target keeps a skip.
    expect(result).toStrictEqual([
      {
        id: "113",
        ok: false,
        detail:
          "not moved: it would land on clip t0[5|1] (id 114), " +
          "which this call can't move out of the way first; move them in separate calls",
      },
      {
        id: "114",
        ok: false,
        detail:
          "not moved: it would land on clip t0[1|1] (id 113), " +
          "which this call can't move out of the way first; move them in separate calls",
      },
    ]);
  });

  // The first id's toPath doesn't parse, so that clip goes nowhere — and the
  // second one's destination is the span it is sitting in.
  it("keeps a clip whose toPath entry didn't parse", async () => {
    const result = await updateClip({
      id: "113,114",
      toPath: "not-a-real-path,t0[1|1]",
    });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      {
        id: "113",
        ok: false,
        detail:
          'not moved: invalid toPath "not-a-real-path" - "not-a-real-path" is not ' +
          'a track or scene; expected "t<index>", "rt<index>", "mt", or "s<index>"',
      },
      {
        id: "114",
        ok: false,
        detail:
          "not moved: it would land on clip t0[1|1] (id 113), which this call " +
          "leaves where it is; move that clip out of the way too, or use separate calls",
      },
    ]);
  });

  // t0[1|1] fully determines a lane and a position, so it can't cover two
  // clips at once: refuse instead of padding the second one with null.
  it("refuses one track-qualified toPath for two clips", async () => {
    await expect(
      updateClip({ id: "114,113", toPath: "t0[1|1]" }),
    ).rejects.toThrow(
      "toPath names 1 destination but the call names 2 clips. A destination " +
        "holds one object, so toPath must name one per clip, in order.",
    );

    expect(movedTo()).toStrictEqual([]);
  });

  it("refuses a swap written as arrangementStart too", async () => {
    const result = (await updateClip({
      id: "113,114",
      arrangementStart: "5|1,1|1",
    })) as Array<{ detail?: string }>;

    expect(movedTo()).toStrictEqual([]);
    expect(result[0]?.detail).toContain("not moved:");
    expect(result[1]?.detail).toContain("not moved:");
  });
});

describe("updateClip - a move Live turns down at write time", () => {
  /** Registered as audio, so a MIDI clip sent there is refused on arrival. */
  const AUDIO_TRACK = 1;

  /**
   * A row of clips on t0, plus an audio track for the moves that get refused.
   * @param row - The clips, in call order
   */
  function setupRefusingTrack(row: RowClip[]): void {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    registerRow(row);
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { track_index: 0, has_midi_input: 1, is_frozen: 0 },
      methods: {
        duplicate_clip_to_arrangement: (_sourceId, startTime) => {
          registerClipAt(
            "copy",
            livePath.track(0).arrangementClip(row.length),
            startTime as number,
            0,
          );

          return "id copy";
        },
        delete_clip: () => null,
      },
    });
    registerMockObject("track-1", {
      path: livePath.track(AUDIO_TRACK),
      type: "Track",
      properties: {
        track_index: AUDIO_TRACK,
        has_midi_input: 0,
        is_frozen: 0,
      },
    });
  }

  /**
   * Every position t0 took a move at.
   * @returns The target positions in beats
   */
  function movedTo(): number[] {
    return vi
      .mocked(lookupMockObject("track-0")?.call as Mock)
      .mock.calls.filter(
        ([method]) => method === "duplicate_clip_to_arrangement",
      )
      .map((call) => call[2] as number);
  }

  // The planner puts 114 first because 113 is moving onto its span, and trusts
  // the declared move to clear it. Live refuses that move, so the span never
  // comes free and 113's move has to be called off — or it runs over a clip
  // that is still sitting there and the call reports both as updated.
  it("calls off the move that was waiting on it", async () => {
    setupRefusingTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);

    const result = await updateClip({
      id: "113,114",
      toPath: `t0[5|1],t${AUDIO_TRACK}[9|1]`,
    });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      {
        id: "113",
        ok: false,
        detail:
          "not moved: it would land on clip t0[5|1] (id 114), which Live wouldn't " +
          "move; move that clip first, or use separate calls",
      },
      {
        id: "114",
        ok: false,
        detail:
          "not moved: track t1 (id track-1) is audio; a MIDI clip needs a MIDI track",
      },
    ]);
  });

  // A clip called off here didn't vacate either, so whatever was waiting on it
  // has to go too — a sweep over the graph, not one hop.
  it("calls off the moves waiting behind that one", async () => {
    setupRefusingTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
      { id: "115", start: 32, end: 48 },
    ]);

    const result = await updateClip({
      id: "113,114,115",
      toPath: `t0[5|1],t0[9|1],t${AUDIO_TRACK}[13|1]`,
    });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      {
        id: "113",
        ok: false,
        detail:
          "not moved: it would land on clip t0[5|1] (id 114), whose own move this " +
          "call gave up on; move that clip first, or use separate calls",
      },
      {
        id: "114",
        ok: false,
        detail:
          "not moved: it would land on clip t0[9|1] (id 115), which Live wouldn't " +
          "move; move that clip first, or use separate calls",
      },
      {
        id: "115",
        ok: false,
        detail:
          "not moved: track t1 (id track-1) is audio; a MIDI clip needs a MIDI track",
      },
    ]);
  });

  // The resize clears the span it tiles across just as the move clears its
  // destination, so a called-off move takes its arrangementLength with it.
  it("drops the resize of a called-off move too", async () => {
    setupRefusingTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);

    await updateClip({
      id: "113,114",
      toPath: `t0[5|1],t${AUDIO_TRACK}[9|1]`,
      arrangementLength: "8bar",
    });

    expect(movedTo()).toStrictEqual([]);
    expect(lookupMockObject("113")?.call).not.toHaveBeenCalledWith(
      "duplicate_region",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe("updateClip - moving a row of take-lane clips", () => {
  /**
   * Two clips on t0/l0, at bar 1 and bar 5.
   * @returns Their ids, in lane order
   */
  function setupTakeLane(): string[] {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerTakeLaneTrack({
      initialLanes: 1,
      initialLaneClips: [
        [
          { start: 0, end: BAR },
          { start: 4 * BAR, end: 5 * BAR },
        ],
      ],
    });

    return [0, 1].map(
      (index) =>
        lookupMockObject(
          undefined,
          livePath.track(0).takeLane(0).arrangementClip(index),
        )?.id as string,
    );
  }

  // A take-lane create wipes the range it writes to, so this row has to run
  // back-to-front too. In call order the first landing destroyed the second
  // clip, which the batch then reported as deleted.
  it("keeps both clips when a take-lane row shifts four bars later", async () => {
    const [first, second] = setupTakeLane();

    const result = (await updateClip({
      id: `${first},${second}`,
      toPath: "t0/l0[5|1],t0/l0[9|1]",
    })) as ClipResult[];

    expect(result.map((entry) => entry.path)).toStrictEqual([
      "t0/l0[5|1]",
      "t0/l0[9|1]",
    ]);

    for (const entry of result) {
      expect(entry.deleted).toBeUndefined();
      expect(entry.detail).toContain("re-created on t0/l0");
    }
  });
});
