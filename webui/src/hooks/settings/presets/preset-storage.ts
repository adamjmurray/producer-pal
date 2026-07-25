// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isNotation } from "#src/shared/notation";
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
 * preset. A preset with no captured toolset or notation (legacy / "inherit")
 * never counts that field toward the comparison, so it isn't perpetually
 * "modified".
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
    preset.smallModelMode === fields.smallModelMode &&
    (preset.enabledTools == null ||
      enabledToolsEqual(preset.enabledTools, fields.enabledTools)) &&
    (preset.notation == null || preset.notation === fields.notation)
  );
}

/**
 * Order-independent equality for two tool-enablement maps. Absent maps are
 * treated as empty. This is exact key/value equality (a missing key differs
 * from an explicit true/false) — sufficient because applyPreset copies the
 * preset's map into the buffer verbatim, so a matched preset and its buffer
 * carry identical keys.
 * @param a - First tool map (or undefined)
 * @param b - Second tool map (or undefined)
 * @returns True when both maps enable exactly the same tools
 */
export function enabledToolsEqual(
  a: Record<string, boolean> = {},
  b: Record<string, boolean> = {},
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }

  return true;
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
    typeof p.smallModelMode === "boolean" &&
    // The additive fields are all optional; reject only a present-but-wrong-
    // typed value so a hand-edited entry can't crash the picker.
    (p.description === undefined || typeof p.description === "string") &&
    (p.enabledTools === undefined || isBooleanMap(p.enabledTools)) &&
    (p.notation === undefined || isNotation(p.notation))
  );
}

/**
 * Type guard for a plain object whose every value is a boolean — the shape of a
 * captured toolset map.
 * @param value - A parsed value
 * @returns True when value is a Record<string, boolean>
 */
function isBooleanMap(value: unknown): value is Record<string, boolean> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((v) => typeof v === "boolean");
}
