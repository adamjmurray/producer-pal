// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The per-turn tool-step budgets, and the one setting they all derive from.
 *
 * A step is one model generation, so the budget bounds how much tool work a
 * single turn can do before the run stops and hands control back. Too low and
 * a real arrangement task dies half-finished; too high and a looping model
 * burns tokens unattended. Where that line sits depends on the model and the
 * user's patience, which is why it is a setting rather than a constant.
 *
 * One knob, not three. The orchestrator and worker budgets are derived, so
 * raising the base raises them with it and the relationship the defaults were
 * chosen with (orchestrator > worker > base) holds at any setting. Exposing
 * each separately would let a user invert them and quietly starve the
 * orchestrator of the spawns its own budget is supposed to fit.
 */

/** Shipped default, and what an unset or unusable stored value falls back to. */
export const DEFAULT_MAX_TOOL_STEPS = 25;

/** Floor. Below a handful of steps almost nothing multi-tool completes. */
export const MIN_TOOL_STEPS = 5;

/** Ceiling. A runaway turn is the failure this bounds; it is not a quality dial. */
export const MAX_TOOL_STEPS_LIMIT = 100;

/**
 * The orchestrator's budget for a given base: wider, because context-gathering
 * steps and each SEQUENTIAL spawn share it (a spawn costs one step; N parallel
 * spawns in one turn cost just one). MAX_SPAWNS separately bounds how many
 * workers a turn may start at all.
 *
 * @param baseSteps - The user's configured per-turn budget
 * @returns The orchestrator's step budget
 */
export function orchestratorSteps(baseSteps: number): number {
  return Math.round(baseSteps * 1.6);
}

/**
 * A worker's budget for a given base: above the base so a delegated subtask can
 * read what it needs and still finish the edit, below the orchestrator's so the
 * turn that spawned it keeps the wider allowance.
 *
 * @param baseSteps - The user's configured per-turn budget
 * @returns A subagent worker's step budget
 */
export function workerSteps(baseSteps: number): number {
  return Math.round(baseSteps * 1.2);
}
