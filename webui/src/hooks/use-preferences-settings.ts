// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";

export interface PreferencesSettings {
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
  showTokenUsage: boolean;
  setShowTokenUsage: (show: boolean) => void;
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

  if (stored == null) {
    return defaultValue;
  }

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
  const [showTokenUsage, setShowTokenUsage] = useState(() =>
    readBool("show_token_usage", false),
  );

  return {
    showTimestamps,
    setShowTimestamps,
    showHelpLinks,
    setShowHelpLinks,
    showTokenUsage,
    setShowTokenUsage,
  };
}

/**
 * Saves preferences settings to localStorage
 * @param display - Preferences settings to persist
 */
export function savePreferencesSettings(display: PreferencesSettings): void {
  saveFlag("show_timestamps", display.showTimestamps);
  saveFlag("show_help_links", display.showHelpLinks);
  saveFlag("show_token_usage", display.showTokenUsage);
}

/**
 * Saves one boolean preference to localStorage
 * @param key - Key without the prefix
 * @param value - Value to store
 */
function saveFlag(key: string, value: boolean): void {
  localStorage.setItem(`${KEY_PREFIX}${key}`, String(value));
}
