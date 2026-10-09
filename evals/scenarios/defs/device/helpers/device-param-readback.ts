// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading parameter values back from a `ppal-read-device` result, with
 * `include: ["params", "param-values"]`, so a scenario can grade what a device
 * ended up set to.
 */

/** One entry of a read's `parameters`. */
interface ReadParam {
  name?: string;
  value?: unknown;
  min?: unknown;
  max?: unknown;
}

/** A device read that carries `parameters`. */
interface ParamRead {
  parameters?: ReadParam[];
}

/** A rack macro's number range when the read doesn't report one. */
const DEFAULT_MACRO_MAX = 127;

/**
 * A param's number: a bare number, or a display string like "-6 dB".
 *
 * @param value - The `value`, `min` or `max` a read reported
 * @returns The number, or NaN when it isn't one
 */
function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number.parseFloat(String(value));
}

/**
 * The number a named param reads as.
 *
 * @param result - Parsed ppal-read-device result
 * @param name - Exact param name
 * @returns The number, or undefined when there is no such param or it reads as
 *   no number
 */
export function paramNumber(result: unknown, name: string): number | undefined {
  const param = ((result as ParamRead).parameters ?? []).find(
    (candidate) => candidate.name === name,
  );
  const value = toNumber(param?.value);

  return Number.isNaN(value) ? undefined : value;
}

/**
 * Where each rack macro sits in its range, 0 (down) to 1 (up), by macro number.
 * A renamed macro reads as "Name (Macro 6)", an unrenamed one as "Macro 6".
 *
 * @param result - Parsed ppal-read-device result for a rack
 * @returns Macro number (1 is the first) to position. A macro that reads as no
 *   number is left out.
 */
export function macroPositions(result: unknown): Map<number, number> {
  const positions = new Map<number, number>();

  for (const param of (result as ParamRead).parameters ?? []) {
    const match = /^Macro (\d+)$|\(Macro (\d+)\)$/.exec(param.name ?? "");
    const number = Number(match?.[1] ?? match?.[2]);
    const min = Number.isNaN(toNumber(param.min)) ? 0 : toNumber(param.min);
    const max = Number.isNaN(toNumber(param.max))
      ? DEFAULT_MACRO_MAX
      : toNumber(param.max);
    const position = (toNumber(param.value) - min) / (max - min);

    if (match != null && !Number.isNaN(position)) {
      positions.set(number, position);
    }
  }

  return positions;
}

/**
 * Check the macros the model was meant to raise are all the way up and the
 * rest are still down. Every macro 1 to `count` must be on the read, so a rack
 * that reads back no macros is a failure and not a pass.
 *
 * @param result - Parsed ppal-read-device result for the rack
 * @param raised - The macro numbers that should be all the way up
 * @param count - How many macros the rack shows; the rest should be all the
 *   way down
 * @returns What is wrong, or null when the macros are as wanted
 */
export function macroProblem(
  result: unknown,
  raised: number[],
  count: number,
): string | null {
  const positions = macroPositions(result);
  const wrong: string[] = [];

  for (let number = 1; number <= count; number++) {
    const position = positions.get(number);
    const shouldBeUp = raised.includes(number);

    if (position == null) {
      wrong.push(`macro ${number} not read`);
    } else if (shouldBeUp && position < 0.98) {
      wrong.push(`macro ${number} should be up, reads ${position.toFixed(2)}`);
    } else if (!shouldBeUp && position > 0.02) {
      wrong.push(
        `macro ${number} should be down, reads ${position.toFixed(2)}`,
      );
    }
  }

  return wrong.length === 0 ? null : wrong.join("; ");
}
