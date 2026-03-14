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

  // Escape key handler
  useEffect(() => {
    if (!showSettings) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSettingsDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSettings, handleSettingsDismiss]);

  return { shake, clearShake, handleSettingsDismiss };
}
