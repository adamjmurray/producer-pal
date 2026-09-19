// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_MAX_TOOL_STEPS,
  MAX_TOOL_STEPS_LIMIT,
  MIN_TOOL_STEPS,
} from "#webui/chat/sdk/step-budget";
import { type Provider } from "#webui/types/settings";
import {
  type AllProviderSettings,
  saveAllProviderSettings,
} from "./provider-settings";

/**
 * Loads enabled tools from localStorage
 * @returns {Record<string, boolean>} - Tool enabled states
 */
export function loadEnabledTools(): Record<string, boolean> {
  const saved = localStorage.getItem("producer_pal_enabled_tools");

  if (saved) {
    try {
      return JSON.parse(saved) as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Saves the current provider and enabled tools, then the provider settings.
 * @param {Provider} provider - Current provider
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {AllProviderSettings} allSettings - All provider settings
 * @returns {Promise<void>}
 */
export async function saveCurrentSettings(
  provider: Provider,
  enabledTools: Record<string, boolean>,
  allSettings: AllProviderSettings,
): Promise<void> {
  localStorage.setItem("producer_pal_current_provider", provider);
  localStorage.setItem("producer_pal_settings_configured", "true");
  localStorage.setItem(
    "producer_pal_enabled_tools",
    JSON.stringify(enabledTools),
  );
  await saveAllProviderSettings(allSettings);
}

/**
 * Loads smallModelMode from localStorage
 * @returns {boolean} Whether small model mode is enabled
 */
export function loadSmallModelMode(): boolean {
  return localStorage.getItem("producer_pal_small_model_mode") === "true";
}

/**
 * Saves smallModelMode to localStorage
 * @param {boolean} enabled - Whether small model mode is enabled
 */
export function saveSmallModelMode(enabled: boolean): void {
  localStorage.setItem("producer_pal_small_model_mode", String(enabled));
}

const MAX_TOOL_STEPS_KEY = "producer_pal_max_tool_steps";

/**
 * Loads the per-turn tool-step budget from localStorage, falling back to the
 * shipped default. Anything unparseable or out of range falls back too, so a
 * hand-edited value can't strand a turn at one step or run away.
 * @returns {number} The configured budget, clamped to the supported range
 */
export function loadMaxToolSteps(): number {
  const raw = localStorage.getItem(MAX_TOOL_STEPS_KEY);

  if (raw == null) {
    return DEFAULT_MAX_TOOL_STEPS;
  }

  return clampToolSteps(Number(raw)) ?? DEFAULT_MAX_TOOL_STEPS;
}

/**
 * Saves the per-turn tool-step budget. An out-of-range or non-numeric value
 * clears the key instead of storing it, so the default applies.
 * @param {number} steps - The budget to store
 */
export function saveMaxToolSteps(steps: number): void {
  const valid = clampToolSteps(steps);

  if (valid == null) {
    localStorage.removeItem(MAX_TOOL_STEPS_KEY);

    return;
  }

  localStorage.setItem(MAX_TOOL_STEPS_KEY, String(valid));
}

/**
 * A tool-step budget if it is a whole number in the supported range, else null.
 * @param {number} steps - Candidate budget
 * @returns {number | null} The budget, or null when it isn't usable
 */
function clampToolSteps(steps: number): number | null {
  if (!Number.isInteger(steps)) {
    return null;
  }

  return steps >= MIN_TOOL_STEPS && steps <= MAX_TOOL_STEPS_LIMIT
    ? steps
    : null;
}

const SUBAGENT_PRESET_KEY = "producer_pal_subagent_preset";

/**
 * Loads the "Subagent preset" id from localStorage — the preset a
 * spawned subagent runs under. Null (missing/blank) means "inherit current
 * settings", the shipped phase-1 behavior.
 * @returns {string | null} The saved preset id, or null to inherit
 */
export function loadSubagentPresetId(): string | null {
  // getItem already returns null when unset; saveSubagentPresetId never
  // stores an empty string, and the resolver/selector treat "" as inherit too.
  return localStorage.getItem(SUBAGENT_PRESET_KEY);
}

/**
 * Saves the "Subagent preset" id to localStorage. Null clears it back
 * to "inherit current settings".
 * @param {string | null} presetId - The preset id, or null to inherit
 */
export function saveSubagentPresetId(presetId: string | null): void {
  if (presetId) {
    localStorage.setItem(SUBAGENT_PRESET_KEY, presetId);
  } else {
    localStorage.removeItem(SUBAGENT_PRESET_KEY);
  }
}
