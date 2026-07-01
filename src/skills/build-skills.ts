// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";
import { coreBasic } from "#src/skills/core/core-basic.ts";
import { coreStandard } from "#src/skills/core/core-standard.ts";
import { abstark } from "#src/skills/notation/abstark.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import { barbeatStandard } from "#src/skills/notation/barbeat-standard.ts";
import { midiJson } from "#src/skills/notation/midi-json.ts";
import { stark } from "#src/skills/notation/stark.ts";

const HEADER = "# Producer Pal Skills";

/**
 * Standard-level notation heads, prepended to the shared {@link coreStandard}
 * body. midi-json/stark/abstark reuse a single head across both levels — their
 * notes format has no simplified variant — so the same string appears in
 * {@link NOTATION_BASIC}; only bar|beat has a distinct standard head.
 */
const NOTATION_STANDARD: Record<Notation, string> = {
  barbeat: barbeatStandard,
  "midi-json": midiJson,
  stark,
  abstark,
};

/**
 * Basic (small-model) notation heads, prepended to the shared {@link coreBasic}
 * body. Only bar|beat differs from {@link NOTATION_STANDARD}; the other three
 * share one head (see above).
 */
const NOTATION_BASIC: Record<Notation, string> = {
  barbeat: barbeatBasic,
  "midi-json": midiJson,
  stark,
  abstark,
};

/** Runtime context that selects which skills variant is assembled. */
export interface BuildSkillsOptions {
  /** The global notation setting (defaults to bar|beat). */
  notation?: Notation;
  /** Whether small-model mode is active (selects the basic skills). */
  smallModelMode?: boolean;
}

/**
 * Assemble the Producer Pal Skills string for the active runtime context. The
 * level (standard vs basic) selects the shared core body; the notation selects
 * the head prepended to it. Both are `HEADER + notation head + core`.
 *
 * @param options - Runtime context ({@link BuildSkillsOptions}).
 * @param options.notation - The global notation setting (defaults to bar|beat).
 * @param options.smallModelMode - Whether small-model mode is active.
 * @returns The skills string returned in the ppal-connect tool result.
 */
export function buildSkills({
  notation = DEFAULT_NOTATION,
  smallModelMode = false,
}: BuildSkillsOptions = {}): string {
  const [head, core] = smallModelMode
    ? [NOTATION_BASIC[notation], coreBasic]
    : [NOTATION_STANDARD[notation], coreStandard];

  return `${HEADER}\n\n${head}\n\n${core}`;
}
