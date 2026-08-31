// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateBarBeatPosition } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  beatsForClip,
  parseArrangementParams,
} from "../helpers/arrangement/update-clip-arrangement-params.ts";

vi.mock(import("#src/notation/barbeat/time/barbeat-time.ts"), () => ({
  // "1|1" = 0, "2|1" = 4, "3|1" = 8, "5|1" = 16
  barBeatToAbletonBeats: vi.fn(
    (pos) => (Number.parseInt(pos.split("|")[0] as string) - 1) * 4,
  ),
  durationToAbletonBeats: vi.fn((dur) => {
    if (dur === "1bar") return 4;
    if (dur === "2bar") return 8;
    if (dur === "1/2") return 2;
    if (dur === "0bar") return 0;
    if (dur === "-1bar") return -4;

    return 0;
  }),
  // No-op by default (valid positions pass); a single test overrides it to
  // throw, exercising the wiring. The real accept/reject parity is covered in
  // barbeat-position-validation.test.ts.
  validateBarBeatPosition: vi.fn(),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
}));

import * as console from "#src/shared/max/v8-max-console.ts";

describe("parseArrangementParams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
  });

  it("returns no values when both params are undefined", () => {
    const { startBeats, lengthBeats } = parseArrangementParams(
      undefined,
      undefined,
      2,
    );

    expect(beatsForClip(startBeats, 0)).toBeNull();
    expect(beatsForClip(lengthBeats, 0)).toBeNull();
  });

  it("reads a blank param as omitted", () => {
    const { startBeats } = parseArrangementParams("", undefined, 2);

    expect(beatsForClip(startBeats, 0)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  // Not blank, but names no position — the caller asked for a move, so the
  // clip staying put has to say so rather than read as a move that worked.
  it("warns when a position list names nothing", () => {
    const { startBeats } = parseArrangementParams(",  ,", undefined, 2);

    expect(beatsForClip(startBeats, 0)).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      'arrangementStart ",  ," names nothing',
    );
  });

  it("warns when a length list names nothing", () => {
    const { lengthBeats } = parseArrangementParams(undefined, ", ,", 2);

    expect(beatsForClip(lengthBeats, 0)).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      'arrangementLength ", ," names nothing',
    );
  });

  it("warns once when the schema coerced the param to a null string", () => {
    const { startBeats } = parseArrangementParams("null", undefined, 2);

    expect(beatsForClip(startBeats, 0)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      'arrangementStart "null" names nothing',
    );
  });

  it("broadcasts one position to every clip", () => {
    const { startBeats } = parseArrangementParams("2|1", undefined, 3);

    expect([0, 1, 2].map((i) => beatsForClip(startBeats, i))).toStrictEqual([
      4, 4, 4,
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("broadcasts one length to every clip", () => {
    const { lengthBeats } = parseArrangementParams(undefined, "1bar", 3);

    expect([0, 1, 2].map((i) => beatsForClip(lengthBeats, i))).toStrictEqual([
      4, 4, 4,
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("fans a position list out one per clip", () => {
    const { startBeats } = parseArrangementParams("1|1,2|1,3|1", undefined, 3);

    expect([0, 1, 2].map((i) => beatsForClip(startBeats, i))).toStrictEqual([
      0, 4, 8,
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("fans a length list out one per clip", () => {
    const { lengthBeats } = parseArrangementParams(undefined, "1bar,2bar", 2);

    expect([0, 1].map((i) => beatsForClip(lengthBeats, i))).toStrictEqual([
      4, 8,
    ]);
  });

  it("does not cycle a short list", () => {
    const { startBeats } = parseArrangementParams("1|1,2|1", undefined, 3);

    expect([0, 1, 2].map((i) => beatsForClip(startBeats, i))).toStrictEqual([
      0,
      4,
      null,
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      "arrangementStart: 2 positions for 3 clips; the clips past the last position were not moved",
    );
  });

  it("warns about extra positions", () => {
    const { startBeats } = parseArrangementParams("1|1,2|1,3|1", undefined, 2);

    expect([0, 1].map((i) => beatsForClip(startBeats, i))).toStrictEqual([
      0, 4,
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      "arrangementStart: 3 positions for 2 clips; the extra positions went unused",
    );
  });

  it("warns about a mismatched length list", () => {
    parseArrangementParams(undefined, "1bar,2bar,1bar", 2);

    expect(console.warn).toHaveBeenCalledWith(
      "arrangementLength: 3 lengths for 2 clips; the extra lengths went unused",
    );
  });

  it("parses both params together", () => {
    const { startBeats, lengthBeats } = parseArrangementParams("1|1", "1/2", 1);

    expect(beatsForClip(startBeats, 0)).toBe(0);
    expect(beatsForClip(lengthBeats, 0)).toBe(2);
  });

  it.each(["0bar", "-1bar"])("throws when a length is %s", (duration) => {
    expect(() => parseArrangementParams(undefined, duration, 1)).toThrow(
      "arrangementLength must be greater than 0",
    );
  });

  it("rejects a 0-indexed arrangementStart with the 1-indexing steer", () => {
    // Parity with create-clip: the 1-indexing guard runs on arrangementStart,
    // so a steer thrown there propagates rather than resolving to a silent
    // pre-origin beat.
    vi.mocked(validateBarBeatPosition).mockImplementationOnce(() => {
      throw new Error("beats are 1-indexed");
    });

    expect(() => parseArrangementParams("1|0", undefined, 1)).toThrow(
      /1-indexed/,
    );
  });
});

describe("beatsForClip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
  });

  it("covers a clip past the end of the call when one value was broadcast", () => {
    // The pieces arrangementSplit made have no position in the call.
    const { startBeats } = parseArrangementParams("2|1", undefined, 2);

    expect(beatsForClip(startBeats, undefined)).toBe(4);
  });

  it("gives a clip past the end of the call nothing from a list", () => {
    const { startBeats } = parseArrangementParams("1|1,2|1", undefined, 2);

    expect(beatsForClip(startBeats, undefined)).toBeNull();
  });
});
