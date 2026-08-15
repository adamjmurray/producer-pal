// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The per-turn tool-step budget.
 *
 * A step is one model generation, so the budget bounds how much tool work a
 * single turn can do before the run stops and hands control back. Too low and
 * a real arrangement task dies half-finished; too high and a looping model
 * burns tokens unattended. Where that line sits depends on the model and the
 * user's patience, which is why it is a setting rather than a constant.
 *
 * One number, applied everywhere: a plain chat turn, a subagent orchestrator's
 * turn, and each worker's nested run all get exactly what the user set. Don't
 * reintroduce a multiplier for the orchestrator or the worker — the setting is
 * how a user says where their line is, and a turn that stops early can be
 * continued (the Continue button, or `resumeFrom` for a worker).
 */

/** Shipped default, and what an unset or unusable stored value falls back to. */
export const DEFAULT_MAX_TOOL_STEPS = 25;

/** Floor. Below a handful of steps almost nothing multi-tool completes. */
export const MIN_TOOL_STEPS = 5;

/** Ceiling. A runaway turn is the failure this bounds; it is not a quality dial. */
export const MAX_TOOL_STEPS_LIMIT = 100;
