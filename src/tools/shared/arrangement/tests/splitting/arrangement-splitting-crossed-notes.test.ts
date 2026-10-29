// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  ARRANGEMENT_SPLIT_MODE,
  performSplitting,
} from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import {
  overrideWithDuplicateCounter,
  setupClipSplittingMocks,
  withEachLiveCallCostingASecond,
  type SplittingClipProps,
} from "../helpers/arrangement-splitting-test-helpers.ts";
import { recordClipReports } from "../helpers/clip-report-recorder.ts";

interface TestNote {
  start_time: number;
  duration: number;
  mute?: number;
}

/** A 12-beat clip from beat 100, unlooped: cuts at 104 and 108 are 4 and 8. */
const UNLOOPED_12: SplittingClipProps = {
  looping: false,
  startTime: 100,
  endTime: 112,
  loopEnd: 12,
  endMarker: 12,
};

interface CutOpts {
  /** Where the clip starts playing. */
  startMarker?: number;
  /** 1-based duplicate call Live refuses. */
  failOnDuplicate?: number;
  /** Every Live call eats a second of a 1.5 s budget. */
  runOutOfTime?: boolean;
  /** Leave out the reporter, as a caller with nowhere to say it would. */
  noReporter?: boolean;
}

/**
 * Cut the clip at the song positions and collect what its entry was told.
 * @param props - The clip
 * @param notes - The notes the clip holds
 * @param points - Song positions to cut at
 * @param opts - What else is true of the call
 * @returns The crossed-note reasons the entry was given, and the note reads made
 */
function cutWithNotes(
  props: SplittingClipProps,
  notes: TestNote[],
  points: number[],
  opts: CutOpts = {},
): { said: string[]; reads: number } {
  const { callState } = setupClipSplittingMocks("clip_1", props);
  const clipMock = lookupMockObject("clip_1");
  const clip = LiveAPI.from("id clip_1");
  const { reports, reportClip } = recordClipReports();
  const inner = clipMock?.call.getMockImplementation();

  if (opts.startMarker != null && clipMock) {
    clipMock.properties.start_marker = opts.startMarker;
  }

  clipMock?.call.mockImplementation((method: string, ...args: unknown[]) =>
    method === "get_notes_extended"
      ? JSON.stringify({
          notes: notes.map((n) => ({ pitch: 36, mute: 0, ...n })),
        })
      : inner?.(method, ...args),
  );

  if (opts.failOnDuplicate != null) {
    overrideWithDuplicateCounter(callState.trackMock, {
      failOnDuplicate: opts.failOnDuplicate,
    });
  }

  const context = {
    ...(opts.noReporter ? {} : { reportClip }),
    ...(opts.runOutOfTime ? { deadline: 1500 } : {}),
  };
  const run = (): unknown =>
    performSplitting([clip], points, [clip], context, ARRANGEMENT_SPLIT_MODE);

  if (opts.runOutOfTime) {
    withEachLiveCallCostingASecond(callState.trackMock, run);
  } else {
    run();
  }

  return {
    said: reports.filter((r) => /crossed/.test(r.reason)).map((r) => r.reason),
    reads: noteReads(clipMock),
  };
}

/**
 * @param clipMock - The clip's mock
 * @returns How many times the notes were read
 */
function noteReads(clipMock: ReturnType<typeof lookupMockObject>): number {
  return (
    clipMock?.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "get_notes_extended",
    ).length ?? 0
  );
}

describe("performSplitting with a note across a cut", () => {
  it("says one note ends at the cut", () => {
    const { said } = cutWithNotes(
      UNLOOPED_12,
      [{ start_time: 0, duration: 12 }],
      [104],
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("counts each note once, however many cuts it crosses", () => {
    const { said } = cutWithNotes(
      UNLOOPED_12,
      [
        { start_time: 0, duration: 12 },
        { start_time: 2, duration: 8 },
        { start_time: 5, duration: 1 },
      ],
      [104, 108],
    );

    expect(said).toStrictEqual(["2 notes crossed a cut and now end at it"]);
  });

  it("ignores notes that end at a cut or start on one", () => {
    const { said } = cutWithNotes(
      UNLOOPED_12,
      [
        { start_time: 0, duration: 4 },
        { start_time: 4, duration: 4 },
      ],
      [104, 108],
    );

    expect(said).toStrictEqual([]);
  });

  it("ignores muted notes", () => {
    const { said } = cutWithNotes(
      UNLOOPED_12,
      [{ start_time: 0, duration: 12, mute: 1 }],
      [104],
    );

    expect(said).toStrictEqual([]);
  });

  it("counts only the cuts that landed", () => {
    // The 2nd duplicate fails, so only the cut at 104 happened.
    const { said } = cutWithNotes(
      UNLOOPED_12,
      [
        { start_time: 3, duration: 2 },
        { start_time: 7, duration: 2 },
      ],
      [104, 108],
      { failOnDuplicate: 2 },
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("measures from the start marker, skipping notes that never play", () => {
    // Plays from beat 2, so a cut 1 beat in is at note time 3. The note from 1
    // to 5 starts before the marker and never plays.
    const { said } = cutWithNotes(
      UNLOOPED_12,
      [
        { start_time: 1, duration: 4 },
        { start_time: 2.5, duration: 2 },
      ],
      [101],
      { startMarker: 2 },
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("wraps a cut in a later loop pass to its place in the loop", () => {
    // 4-beat loop: the cut 6 beats in is 2 beats into the second pass.
    const looped: SplittingClipProps = {
      looping: true,
      startTime: 100,
      endTime: 112,
      loopEnd: 4,
    };
    const { said } = cutWithNotes(
      looped,
      [
        { start_time: 1, duration: 2 },
        { start_time: 3, duration: 2 },
      ],
      [106],
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("skips the pickup in a later pass, where it doesn't play", () => {
    // Loop 2-6: the note from 1 to 5 is a pickup, played only in the first
    // pass. A cut 8 beats in is at note time 4 of the second pass.
    const looped: SplittingClipProps = {
      looping: true,
      startTime: 100,
      endTime: 116,
      loopStart: 2,
      loopEnd: 6,
    };
    const { said } = cutWithNotes(
      looped,
      [
        { start_time: 1, duration: 4 },
        { start_time: 3, duration: 2 },
      ],
      [108],
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("finds a cut in the third pass of a loop", () => {
    const looped: SplittingClipProps = {
      looping: true,
      startTime: 100,
      endTime: 116,
      loopEnd: 4,
    };
    // 10 beats in is 2 beats into the third 4-beat pass.
    const { said } = cutWithNotes(
      looped,
      [
        { start_time: 1, duration: 2 },
        { start_time: 2, duration: 1 },
      ],
      [110],
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("counts nothing for a cut on, or just before, a loop boundary", () => {
    const looped: SplittingClipProps = {
      looping: true,
      startTime: 100,
      endTime: 116,
      loopEnd: 4,
    };
    const { said } = cutWithNotes(
      looped,
      [
        { start_time: 0, duration: 4 },
        { start_time: 3, duration: 2 },
      ],
      [104, 107.9995],
    );

    expect(said).toStrictEqual([]);
  });

  it("counts only the cuts made when the budget runs out", () => {
    const sixteen: SplittingClipProps = {
      looping: false,
      startTime: 100,
      endTime: 116,
      loopEnd: 16,
      endMarker: 16,
    };
    // Cuts at 4, 8 and 12; only the first lands. The note across 12 is left
    // whole in the tail, so it doesn't count.
    const { said } = cutWithNotes(
      sixteen,
      [
        { start_time: 3, duration: 2 },
        { start_time: 11, duration: 2 },
      ],
      [104, 108, 112],
      { runOutOfTime: true },
    );

    expect(said).toStrictEqual(["1 note crossed a cut and now ends at it"]);
  });

  it("reads no notes when there is nowhere to say", () => {
    const { reads } = cutWithNotes(
      UNLOOPED_12,
      [{ start_time: 0, duration: 12 }],
      [104],
      { noReporter: true },
    );

    expect(reads).toBe(0);
  });

  it("says nothing for an audio clip", () => {
    const { said, reads } = cutWithNotes(
      { ...UNLOOPED_12, isMidi: false },
      [{ start_time: 0, duration: 12 }],
      [104],
    );

    expect(said).toStrictEqual([]);
    expect(reads).toBe(0);
  });

  it("still cuts when the notes can't be read", () => {
    const { callState } = setupClipSplittingMocks("clip_1", UNLOOPED_12);
    const clip = LiveAPI.from("id clip_1");
    const { reports, reportClip } = recordClipReports();

    const clipMock = lookupMockObject("clip_1");
    const inner = clipMock?.call.getMockImplementation();

    clipMock?.call.mockImplementation((method: string, ...args: unknown[]) => {
      if (method === "get_notes_extended") {
        throw new Error("Live refused the note read");
      }

      return inner?.(method, ...args);
    });

    performSplitting(
      [clip],
      [104],
      [clip],
      { reportClip },
      ARRANGEMENT_SPLIT_MODE,
    );

    expect(reports).toStrictEqual([]);
    expect(callState.duplicateCount).toBeGreaterThan(0);
  });
});
