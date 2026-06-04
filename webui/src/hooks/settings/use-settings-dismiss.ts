// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";

interface UseSettingsDismissOptions {
  showSettings: boolean;
  settingsConfigured: boolean;
  settingsClosing: boolean;
  hasUnsavedChanges: boolean;
  handleCancelSettings: () => void;
  /**
   * When true, the Esc-key handler in this hook is suppressed so a higher-
   * priority overlay (e.g. the project context overlay) can claim the
   * keystroke. The click-outside dismiss path is unaffected.
   */
  blockEscape?: boolean;
}

interface UseSettingsDismissReturn {
  shake: boolean;
  clearShake: () => void;
  handleSettingsDismiss: () => void;
}

/**
 * Hook for managing settings modal dismiss behavior (click-outside and Escape key).
 * Dismisses when no unsaved changes, shakes dialog when there are changes.
 * @param {UseSettingsDismissOptions} options - Dismiss behavior configuration
 * @returns {UseSettingsDismissReturn} Dismiss state and handlers
 */
export function useSettingsDismiss({
  showSettings,
  settingsConfigured,
  settingsClosing,
  hasUnsavedChanges,
  handleCancelSettings,
  blockEscape = false,
}: UseSettingsDismissOptions): UseSettingsDismissReturn {
  const [shake, setShake] = useState(false);
  const clearShake = useCallback(() => setShake(false), []);

  const handleSettingsDismiss = useCallback(() => {
    if (!settingsConfigured || settingsClosing) return;

    if (hasUnsavedChanges) {
      setShake(true);
    } else {
      handleCancelSettings();
    }
  }, [
    settingsConfigured,
    settingsClosing,
    hasUnsavedChanges,
    handleCancelSettings,
  ]);

  // Escape key handler. When `blockEscape` is set, Esc is ceded to whichever
  // overlay has priority (e.g. Context, which renders on top in the DOM) so
  // both overlays don't dismiss simultaneously when the user reloads with
  // contextOpen=true and !settingsConfigured.
  useEffect(() => {
    if (!showSettings) return;
    if (blockEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSettingsDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSettings, handleSettingsDismiss, blockEscape]);

  return { shake, clearShake, handleSettingsDismiss };
}
