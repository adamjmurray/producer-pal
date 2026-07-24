// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isValidProvider } from "#webui/hooks/settings/settings-helpers";
import { type ChatPreset, type PresetFields } from "#webui/types/settings";

/** localStorage key holding the JSON-serialized ChatPreset[]. */
export const PRESETS_STORAGE_KEY = "producer_pal_presets";

/**
 * Load saved chat presets from localStorage, dropping any malformed entries.
 * Presets carry no API keys (only a provider name), so this is plain sync JSON
 * with no decryption — unlike the encrypted per-provider settings store.
 * @returns The stored presets, or an empty list when absent/corrupt
 */
export function loadPresets(): ChatPreset[] {
  const raw = localStorage.getItem(PRESETS_STORAGE_KEY);

  if (raw == null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isValidPreset);
  } catch {
    return [];
  }
}

/**
 * Persist the full preset list to localStorage.
 * @param presets - The presets to store
 */
export function savePresets(presets: ChatPreset[]): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

/**
 * Generate a stable preset id. Prefers crypto.randomUUID; falls back to a
 * timestamp+random string for environments without it.
 * @returns A unique id string
 */
export function createPresetId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whether a preset's captured settings equal the given live buffer fields —
 * used to flag "unsaved edits" when the buffer has drifted from the selected
 * preset.
 * @param preset - A saved preset
 * @param fields - The live editable settings buffer
 * @returns True when every captured field matches
 */
export function presetMatchesFields(
  preset: ChatPreset,
  fields: PresetFields,
): boolean {
  return (
    preset.provider === fields.provider &&
    preset.model === fields.model &&
    preset.thinking === fields.thinking &&
    preset.temperature === fields.temperature &&
    preset.showThoughts === fields.showThoughts &&
    preset.smallModelMode === fields.smallModelMode
  );
}

/**
 * Type guard for a stored preset record. Rejects entries missing required
 * fields or with an unrecognized provider so a hand-edited/corrupt localStorage
 * value can't crash the picker.
 * @param value - A parsed array element
 * @returns True when value is a well-formed ChatPreset
 */
function isValidPreset(value: unknown): value is ChatPreset {
  if (typeof value !== "object" || value == null) return false;
  const p = value as Record<string, unknown>;

  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.name === "string" &&
    p.name.length > 0 &&
    isValidProvider(p.provider) &&
    typeof p.model === "string" &&
    typeof p.thinking === "string" &&
    typeof p.temperature === "number" &&
    Number.isFinite(p.temperature) &&
    typeof p.showThoughts === "boolean" &&
    typeof p.smallModelMode === "boolean"
  );
}
