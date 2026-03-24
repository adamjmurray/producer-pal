// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState } from "preact/hooks";
import { type UseSettingsReturn } from "#webui/types/settings";

export interface AppearanceSettings {
  theme: string;
  showTimestamps: boolean;
  showHelpLinks: boolean;
  showTokenUsage: boolean;
}

/**
 * Build a serializable snapshot string from settings and appearance values
 * @param {UseSettingsReturn} s - Settings hook return value
 * @param {AppearanceSettings} a - Appearance settings
 * @returns {string} JSON snapshot for comparison
 */
function serialize(s: UseSettingsReturn, a: AppearanceSettings): string {
  return JSON.stringify({
    provider: s.provider,
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    thinking: s.thinking,
    temperature: s.temperature,
    showThoughts: s.showThoughts,
    enabledTools: s.enabledTools,
    smallModelMode: s.smallModelMode,
    ...a,
  });
}

/**
 * Hook that detects unsaved changes in settings by comparing current values
 * against a snapshot captured when the settings modal opens.
 * @param {UseSettingsReturn} settings - Current settings from useSettings hook
 * @param {AppearanceSettings} appearance - Current appearance settings
 * @param {boolean} settingsOpen - Whether the settings modal is open
 * @returns {boolean} True if any settings have changed since the modal opened
 */
export function useHasUnsavedChanges(
  settings: UseSettingsReturn,
  appearance: AppearanceSettings,
  settingsOpen: boolean,
): boolean {
  const [snapshot, setSnapshot] = useState("");
  const [wasOpen, setWasOpen] = useState(settingsOpen);

  // Capture snapshot when settings transitions from closed to open
  useEffect(() => {
    if (settingsOpen && !wasOpen) {
      setSnapshot(serialize(settings, appearance));
    }

    setWasOpen(settingsOpen);
  }, [settingsOpen, settings, appearance, wasOpen]);

  if (!settingsOpen || snapshot === "") return false;

  return serialize(settings, appearance) !== snapshot;
}
