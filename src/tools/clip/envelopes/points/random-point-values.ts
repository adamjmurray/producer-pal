// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Rolling a point's `rand(min, max)` once the parameter is known: its ends may
// be display values to convert, and a raw end past the parameter's range is
// refused here, so a write never fails on one roll and lands on the next.

import {
  type EnvelopeRand,
  type EnvelopeRandEnd,
  isRawRand,
  rollEnvelopeRand,
} from "#src/notation/barbeat/envelope/envelope-rand.ts";
import {
  type DisplayEnvelopePoint,
  type WrittenEnvelopePoint,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { envelopeParameter } from "#src/tools/clip/read/helpers/clip-envelopes.ts";
import { type EnvelopeTrack, trackObject } from "../envelope-track.ts";
import { type EnvelopeTarget } from "../targets/envelope-targets.ts";
import { type RawPoints } from "./display-point-values.ts";

/** What a parameter takes: its raw range, and whether it is a list of options. */
export interface ParameterLimits {
  min: number;
  max: number;
  quantized: boolean;
}

/**
 * Give every point its raw value, rolling the ones written as `rand()`.
 * @param points - The parsed notation
 * @param toRaw - Converts display values to raw ones, for this parameter
 * @param limits - The parameter's limits, when they can be read
 * @returns The points, all with raw values, and any clamp note
 * @throws Error saying why a range can't be rolled on this parameter
 */
export function randomPointValues(
  points: readonly WrittenEnvelopePoint[],
  toRaw: (points: readonly DisplayEnvelopePoint[]) => RawPoints,
  limits: () => ParameterLimits | undefined,
): RawPoints {
  const ranges = points.flatMap((point) =>
    "rand" in point ? [point.rand] : [],
  );

  if (ranges.length === 0) {
    return toRaw(points as DisplayEnvelopePoint[]);
  }

  checkRanges(ranges, limits());

  // The display ends ride along as extra points, to share one conversion.
  const displays = [
    ...new Set(
      ranges.flatMap(({ min, max }) =>
        [min, max].flatMap((end) =>
          typeof end === "object" ? [end.display] : [],
        ),
      ),
    ),
  ];
  const raw = toRaw([
    ...points.map((point) => {
      if (!("rand" in point)) {
        return point;
      }

      const { rand: _, ...rest } = point;

      return { ...rest, value: 0 };
    }),
    ...displays.map((display) => ({ time: 0, jump: false, display })),
  ]);
  const ends = new Map(
    displays.map((display, index) => [
      display,
      raw.points[points.length + index]?.value as number,
    ]),
  );
  const rawEnd = (end: EnvelopeRandEnd): number =>
    typeof end === "object" ? (ends.get(end.display) as number) : end;

  return {
    ...raw,
    points: raw.points.slice(0, points.length).map((point, index) => {
      const written = points[index] as WrittenEnvelopePoint;

      return "rand" in written
        ? {
            ...point,
            value: rollEnvelopeRand(
              rawEnd(written.rand.min),
              rawEnd(written.rand.max),
            ),
          }
        : point;
    }),
  };
}

/**
 * Read what the parameter a line writes takes.
 * @param target - The parameter the line writes
 * @param track - The track the clip sits on
 * @returns Its limits, or undefined when it can't be read
 */
export function targetLimits(
  target: EnvelopeTarget,
  track: EnvelopeTrack,
): ParameterLimits | undefined {
  const param = envelopeParameter(
    trackObject(track),
    target.device,
    target.parameter,
  );

  if (param?.exists() !== true) {
    return undefined;
  }

  const min = param.getProperty("min");
  const max = param.getProperty("max");

  return typeof min === "number" && typeof max === "number"
    ? {
        min,
        max,
        quantized: (param.getProperty("is_quantized") as number) > 0,
      }
    : undefined;
}

/**
 * Refuse a range the parameter can't take.
 * @param ranges - Each rand() range the line writes
 * @param limits - The parameter's limits, when they can be read
 * @throws Error naming the range and why it doesn't fit
 */
function checkRanges(
  ranges: readonly EnvelopeRand[],
  limits: ParameterLimits | undefined,
): void {
  if (limits == null) {
    return;
  }

  for (const range of ranges) {
    if (limits.quantized && !isRawRand(range)) {
      throw new Error(
        "not written: rand() can't roll between an option list's labels; write each point's option",
      );
    }

    const past = [range.min, range.max]
      .filter((end) => typeof end === "number")
      .find((end) => end < limits.min || end > limits.max);

    if (past != null) {
      throw new Error(
        `not written: rand() end ${String(past)} is outside the parameter's range ${limits.min}..${limits.max}`,
      );
    }
  }
}
