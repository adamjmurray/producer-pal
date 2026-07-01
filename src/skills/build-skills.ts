// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";
import {
  activeSkillSlots,
  SKILL_SLOTS,
  type SkillSlotName,
} from "#src/skills/skill-slots.ts";

const HEADER = "# Producer Pal Skills";

/** Runtime context that selects which skills variant is assembled. */
export interface BuildSkillsOptions {
  /** The global notation setting (defaults to bar|beat). */
  notation?: Notation;
  /** Whether small-model mode is active (selects the basic skills). */
  smallModelMode?: boolean;
}

/**
 * Per-slot user overrides (~/.producer-pal skills overrides). A present entry
 * replaces that built-in fragment; an absent one tracks the release default.
 */
export type SkillOverrides = Partial<Record<SkillSlotName, string>>;

/**
 * Assemble the Producer Pal Skills string for the active runtime context. The
 * level (standard vs basic) selects the shared core body; the notation selects
 * the head prepended to it — both resolved to slots by {@link activeSkillSlots}.
 * Each slot uses the user's override when present, else the release-tuned
 * built-in. The result is `HEADER + notation head + core`.
 *
 * @param options - Runtime context ({@link BuildSkillsOptions}).
 * @param options.notation - The global notation setting (defaults to bar|beat).
 * @param options.smallModelMode - Whether small-model mode is active.
 * @param overrides - Per-slot user overrides (empty by default).
 * @returns The skills string returned in the ppal-connect tool result.
 */
export function buildSkills(
  {
    notation = DEFAULT_NOTATION,
    smallModelMode = false,
  }: BuildSkillsOptions = {},
  overrides: SkillOverrides = {},
): string {
  const { head, core } = activeSkillSlots(notation, smallModelMode);

  return `${HEADER}\n\n${resolveSlot(head, overrides)}\n\n${resolveSlot(
    core,
    overrides,
  )}`;
}

// --- Helpers below main export ---

/**
 * The active fragment for a slot: the user override when present, else the
 * built-in default.
 *
 * @param slot - The slot name to resolve
 * @param overrides - Per-slot user overrides
 * @returns The fragment string to emit for this slot
 */
function resolveSlot(slot: SkillSlotName, overrides: SkillOverrides): string {
  return overrides[slot] ?? SKILL_SLOTS[slot].builtIn;
}
