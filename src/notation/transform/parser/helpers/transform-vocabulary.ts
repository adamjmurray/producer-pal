// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { editDistance } from "#src/notation/peggy-error-formatter.ts";

// The names the transform grammar accepts, for "did you mean" hints. Peggy
// can't import these, so a parity test holds them in step with the grammar.

/** Assignable parameters (grammar rule `parameter`). */
export const TRANSFORM_PARAMETERS = [
  "velocity",
  "pitch",
  "timing",
  "duration",
  "probability",
  "deviation",
  "gain",
  "pitchShift",
];

/** Readable properties per namespace (grammar rules `<namespace>PropertyName`). */
export const TRANSFORM_PROPERTIES: Record<string, string[]> = {
  note: [
    "velocity",
    "pitch",
    "start",
    "duration",
    "probability",
    "deviation",
    "index",
    "count",
  ],
  next: ["velocity", "pitch", "start", "duration", "probability", "deviation"],
  clip: ["duration", "barDuration", "position", "index", "count"],
  audio: ["gain", "pitchShift"],
};

/** The only properties a where() predicate may read. */
export const WHERE_PROPERTIES = [
  "note.velocity",
  "note.pitch",
  "note.start",
  "note.duration",
  "note.probability",
  "note.deviation",
];

// Words models reach for that no edit distance would find.
const SYNONYMS: Record<string, string> = {
  v: "velocity",
  length: "duration",
  len: "duration",
  start: "timing",
  time: "timing",
  position: "timing",
  timing: "start",
};

/**
 * Suggest the valid name a mistyped one most likely meant.
 * @param name - The name as written
 * @param candidates - Valid names
 * @returns The suggested name, or null when nothing is close
 */
export function suggestTransformName(
  name: string,
  candidates: string[],
): string | null {
  const lower = name.toLowerCase();
  const synonym = SYNONYMS[lower];

  if (synonym != null && candidates.includes(synonym)) {
    return synonym;
  }

  // A unique prefix: `vel` → velocity, `prob` → probability. Shorter ones
  // guess: `G` or `T` is more likely a mistyped pitch than gain or timing.
  const prefixed = candidates.filter((c) => c.toLowerCase().startsWith(lower));

  if (lower.length >= 3 && prefixed.length === 1) {
    return prefixed[0] as string;
  }

  // Short words sit close to everything (`pan` is 2 edits from gain).
  let best: string | null = null;
  let bestDistance = lower.length <= 4 ? 2 : 3;

  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase());

    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}
