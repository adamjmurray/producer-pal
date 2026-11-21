// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  paramProblem,
  paramText,
} from "../../helpers/device-param-readback.ts";

/**
 * What is wrong with the kick's Drum Synth after the user asked for a Decay of
 * 60 %: Decay should read 60, and the sound type should still be Kick. Switching
 * the type would make the other param live, but nobody asked for that.
 *
 * @param result - Parsed ppal-read-device result, read with param values
 * @returns A description of what is wrong, or null when it is as asked
 */
export function drumSynthProblem(result: unknown): string | null {
  const problems = [paramProblem(result, "Decay", 60)];
  const soundType = paramText(result, "Sound Type");

  if (soundType == null || !/kick/i.test(soundType)) {
    problems.push(`Sound Type reads ${soundType ?? "nothing"}, wanted Kick`);
  }

  const found = problems.filter((problem) => problem != null);

  return found.length === 0 ? null : found.join("; ");
}
