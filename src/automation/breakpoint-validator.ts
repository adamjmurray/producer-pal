// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Breakpoint {
  time: number;
  value: number;
  /**
   * Curve FLAG (Slice-2b, v2). `true` = the segment STARTING at this
   * breakpoint is curved (max-bend). Byte-belegt via G2b-Fixture as a
   * pure boolean — Ableton stores no intermediate bend strength. Absent =
   * linear segment (byte-identical to the Slice-2 baseline).
   */
  curve?: boolean;
}

export interface ParamRange {
  min: number;
  max: number;
}

/**
 * Validate a list of automation breakpoints against a param range and time ordering.
 *
 * Slice-2b (v2): `curve` is a bool flag (no range/enum — not byte-supported).
 * A breakpoint flagged `curve: true` describes the segment STARTING at it, so
 * the LAST breakpoint must not carry the flag (it has no following segment).
 *
 * @param bp - Breakpoints to validate
 * @param range - Allowed min/max value range for the parameter
 * @returns The validated breakpoints array (unchanged)
 */
export function validateBreakpoints(
  bp: Breakpoint[],
  range: ParamRange,
): Breakpoint[] {
  if (bp.length === 0) {
    throw new Error("Breakpoint-Liste braucht mindestens 1 Punkt");
  }

  let prev = -Infinity;

  for (const p of bp) {
    if (!Number.isFinite(p.time)) {
      throw new Error(`Breakpoint time muss endlich sein (war ${p.time})`);
    }

    if (!Number.isFinite(p.value)) {
      throw new Error(`Breakpoint value muss endlich sein (war ${p.value})`);
    }

    if (p.time < 0) {
      throw new Error(`Breakpoint time muss >= 0 sein (war ${p.time})`);
    }

    if (p.time <= prev) {
      throw new Error(
        `Breakpoints muessen nach time strikt aufsteigend sortiert sein`,
      );
    }

    if (p.value < range.min || p.value > range.max) {
      throw new Error(
        `value ${p.value} ausserhalb Param-Range ${range.min}..${range.max}`,
      );
    }

    prev = p.time;
  }

  const last = bp.at(-1);

  if (last?.curve === true) {
    throw new Error("curve-Flag am letzten Breakpoint hat kein Folgesegment");
  }

  return bp;
}
