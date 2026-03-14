// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";

export interface PreferencesSettings {
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
}

const KEY_PREFIX = "producer_pal_";

/**
 * Reads a boolean from localStorage
 * @param key - localStorage key suffix
 * @param defaultValue - Value when key is absent
 * @returns Stored boolean value
 */
function readBool(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(`${KEY_PREFIX}${key}`);

  if (stored == null) return defaultValue;

  return stored === "true";
}

/**
 * Hook for preferences settings stored in localStorage
 * @returns Preferences settings state and setters
 */
export function usePreferencesSettings(): PreferencesSettings {
  const [showTimestamps, setShowTimestamps] = useState(() =>
    readBool("show_timestamps", false),
  );
  const [showHelpLinks, setShowHelpLinks] = useState(() =>
    readBool("show_help_links", true),
  );

  return {
    showTimestamps,
    setShowTimestamps,
    showHelpLinks,
    setShowHelpLinks,
  };
}

/**
 * Saves preferences settings to localStorage
 * @param display - Preferences settings to persist
 */
export function savePreferencesSettings(display: PreferencesSettings): void {
  const s = (key: string, value: boolean) =>
    localStorage.setItem(`${KEY_PREFIX}${key}`, String(value));

  s("show_timestamps", display.showTimestamps);
  s("show_help_links", display.showHelpLinks);
}
