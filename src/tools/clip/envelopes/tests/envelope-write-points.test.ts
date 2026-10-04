// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which write point carries a curve: the one that starts the segment.

import { describe, expect, it } from "vitest";
import { type CurveCoefficients } from "#src/notation/barbeat/envelope/envelope-curves.ts";
import {
  type EnvelopeNotationEvent,
  formatEnvelopeNotation,
  parseEnvelopeNotation,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { envelopeWritePoints } from "#src/tools/clip/envelopes/envelope-write-points.ts";
import { type EnvelopeWritePoint } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";

const FOUR_FOUR = { timeSigNumerator: 4, timeSigDenominator: 4 };

/**
 * Notation to the points the remote script writes.
 * @param notation - The notation, in 4/4
 * @returns The write points
 */
function writePoints(notation: string): ReturnType<typeof envelopeWritePoints> {
  return envelopeWritePoints(parseEnvelopeNotation(notation, FOUR_FOUR));
}

describe("envelopeWritePoints", () => {
  it("leaves a straight ramp without coefficients", () => {
    expect(writePoints("1|1 0 / 2|1 1 ~0 3|1 0")).toStrictEqual([
      { time: 0, value: 0 },
      { time: 4, value: 1 },
      { time: 8, value: 0 },
    ]);
  });

  it("puts a rising curve's coefficients on the point it leaves", () => {
    expect(writePoints("1|1 0 ~0.5 2|1 1")).toStrictEqual([
      { time: 0, value: 0, coefficients: [0.125, 0.625, 0.375, 0.875] },
      { time: 4, value: 1 },
    ]);
  });

  it("flips the side for a falling ramp, as the curve is measured toward the end value", () => {
    expect(writePoints("1|1 1 ~0.5 2|1 0")).toStrictEqual([
      { time: 0, value: 1, coefficients: [0.625, 0.125, 0.875, 0.375] },
      { time: 4, value: 0 },
    ]);
  });

  it("puts the curve after a step on the step's new value", () => {
    expect(writePoints("1|1 0 _ 2|1 1 ~-1 3|1 0")).toStrictEqual([
      { time: 0, value: 0 },
      { time: 4, value: 1, jump: true, coefficients: [0, 1, 0, 1] },
      { time: 8, value: 0 },
    ]);
  });

  it("drops a curve between equal values, which draws nothing", () => {
    expect(writePoints("1|1 0.5 ~0.5 2|1 0.5")).toStrictEqual([
      { time: 0, value: 0.5 },
      { time: 4, value: 0.5 },
    ]);
  });
});

/**
 * What Live would hand back for the points: a jump is two events at one time,
 * each coefficient kept to 1/256, each value shown with a display.
 * @param points - The points the remote script was sent
 * @returns The events a read would report
 */
function liveEvents(points: EnvelopeWritePoint[]): EnvelopeNotationEvent[] {
  const events: EnvelopeNotationEvent[] = [];

  for (const [i, point] of points.entries()) {
    const previous = points[i - 1];

    if (point.jump && previous != null) {
      events.push(withDisplay(point.time, previous.value));
    }

    events.push({
      ...withDisplay(point.time, point.value),
      ...(point.coefficients != null && {
        coefficients: point.coefficients.map(
          (c) => Math.round(c * 256) / 256,
        ) as CurveCoefficients,
      }),
    });
  }

  return events;
}

/**
 * An event with a display derived from its value, as Live's is.
 * @param time - Beats
 * @param value - The raw value
 * @returns The event
 */
function withDisplay(time: number, value: number): EnvelopeNotationEvent {
  return { time, value, display: `${String(Math.round(value * 100))}%` };
}

describe("read, write, read", () => {
  it.each([
    "1|1 0 / 2|1 1 / 3|1 0",
    "1|1 0 ~0.5 2|1 1 ~-0.33 3|1 0.25 ~0.07 4|1 0.9",
    "1|1 1 ~-1 2|1 0 ~1 3|1 1",
    "1|1 0 _ 2|1 1 ~0.5 3|1 0 _ 4|1 0.5 / 5|1 0.5",
    "1|1 0 ~0.42 3|1 0.25 _ 3|1 0.9 ~-0.58 5|1 0.1",
    "1|1 0.5 _ 2|1 0.5 ~0.5 3|1 1",
  ])("prints %s again after a write", (notation) => {
    const read = formatEnvelopeNotation(
      liveEvents(
        envelopeWritePoints(parseEnvelopeNotation(notation, FOUR_FOUR)),
      ),
      FOUR_FOUR,
    );
    const again = formatEnvelopeNotation(
      liveEvents(envelopeWritePoints(parseEnvelopeNotation(read, FOUR_FOUR))),
      FOUR_FOUR,
    );

    // The read adds Live's displays; writing that back changes nothing.
    expect(again).toBe(read);
    expect(read.replaceAll(/ \([^)]*\)/g, "")).toBe(notation);
  });
});
