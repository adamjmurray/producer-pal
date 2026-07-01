// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";
import { coreStandard } from "#src/skills/core/core-standard.ts";
import { barbeatBasic } from "#src/skills/notation/barbeat-basic.ts";
import { barbeatStandardNotation } from "#src/skills/notation/barbeat-standard.ts";
import { starkBasic } from "#src/skills/notation/stark-basic.ts";

const HEADER = "# Producer Pal Skills";

/**
 * Standard-level notation heads. Each is prepended to the shared
 * {@link coreStandard} body. Notations without a dedicated head fall back to
 * bar|beat (today's standard default) — a zero-regression fallback until the
 * remaining heads are authored.
 */
const STANDARD_NOTATION: Partial<Record<Notation, string>> = {
  barbeat: barbeatStandardNotation,
};

/**
 * Basic (small-model) skills are self-contained per notation. Notations without
 * a dedicated basic doc fall back to Stark (today's basic/small-model default).
 */
const BASIC: Partial<Record<Notation, string>> = {
  barbeat: barbeatBasic,
  stark: starkBasic,
};

/** Runtime context that selects which skills variant is assembled. */
export interface BuildSkillsOptions {
  /** The global notation setting (defaults to bar|beat). */
  notation?: Notation;
  /** Whether small-model mode is active (selects the basic skills). */
  smallModelMode?: boolean;
}

/**
 * Assemble the Producer Pal Skills string for the active runtime context. Picks
 * the skills matching the current `notation` and level (standard vs basic),
 * falling back to today's per-level default for notations not yet authored.
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
  if (smallModelMode) {
    return BASIC[notation] ?? starkBasic;
  }

  const head = STANDARD_NOTATION[notation] ?? barbeatStandardNotation;

  return `${HEADER}\n\n${head}\n\n${coreStandard}`;
}
