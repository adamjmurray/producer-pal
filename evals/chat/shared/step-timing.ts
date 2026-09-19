// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Generation speed for one model call, read off the AI SDK's `finish-step`
 * stream part.
 */

/** Generation speed for one step, limited to what the SDK could measure. */
export interface StepTiming {
  /** Milliseconds from the model call starting to its first generated chunk. */
  timeToFirstTokenMs?: number;
  /**
   * Output tokens per second after the first chunk. Measured over the model
   * response alone, so tool execution and the wait for the first token are both
   * outside it.
   */
  outputTokensPerSecond?: number;
}

/** The `performance` fields of a `finish-step` part that {@link toStepTiming} reads. */
export interface StepPerformance {
  timeToFirstOutputMs?: number | undefined;
  outputTokensPerSecond?: number | undefined;
}

/**
 * Pull the two speeds worth printing out of a step's `performance`.
 *
 * The SDK divides by a duration that can be zero and clamps the resulting
 * Infinity to 0, so a 0 here means "couldn't measure", not "zero per second" —
 * drop it rather than print it.
 *
 * @param performance - The `performance` field of a `finish-step` stream part
 * @returns The usable timings, or undefined when neither is usable
 */
export function toStepTiming(
  performance: StepPerformance | undefined,
): StepTiming | undefined {
  const timeToFirstTokenMs = measured(performance?.timeToFirstOutputMs);
  const outputTokensPerSecond = measured(performance?.outputTokensPerSecond);

  if (timeToFirstTokenMs == null && outputTokensPerSecond == null) {
    return undefined;
  }

  return {
    ...(timeToFirstTokenMs != null && { timeToFirstTokenMs }),
    ...(outputTokensPerSecond != null && { outputTokensPerSecond }),
  };
}

/**
 * Keep a measurement only when it is a finite, positive number.
 *
 * @param value - Candidate measurement
 * @returns The value, or undefined when it can't be trusted
 */
function measured(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
