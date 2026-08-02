// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useState } from "preact/hooks";
import { useBackdropClick } from "#webui/hooks/use-backdrop-click";

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
  /**
   * When true, dismissing shakes instead of closing even with no unsaved
   * settings — a sub-form inside the dialog (the Presets tab's create form)
   * holds work that closing would throw away.
   */
  blockDismiss?: boolean;
}

interface UseSettingsDismissReturn {
  shake: boolean;
  clearShake: () => void;
  handleSettingsDismiss: () => void;
  handleOverlayMouseDown: (e: MouseEvent) => void;
  handleOverlayClick: (e: MouseEvent) => void;
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
  blockDismiss = false,
}: UseSettingsDismissOptions): UseSettingsDismissReturn {
  const [shake, setShake] = useState(false);
  const clearShake = useCallback(() => setShake(false), []);

  const handleSettingsDismiss = useCallback(() => {
    if (!settingsConfigured || settingsClosing) return;

    if (hasUnsavedChanges || blockDismiss) {
      setShake(true);
    } else {
      handleCancelSettings();
    }
  }, [
    settingsConfigured,
    settingsClosing,
    hasUnsavedChanges,
    blockDismiss,
    handleCancelSettings,
  ]);

  const { onMouseDown: handleOverlayMouseDown, onClick: handleOverlayClick } =
    useBackdropClick(handleSettingsDismiss);

  // Escape key handler. When `blockEscape` is set, Esc is ceded to whichever
  // overlay has priority (e.g. Context, which renders on top in the DOM) so
  // both overlays don't dismiss simultaneously when the user reloads with
  // contextOpen=true and !settingsConfigured.
  useEffect(() => {
    if (!showSettings) return undefined;
    if (blockEscape) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleSettingsDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSettings, handleSettingsDismiss, blockEscape]);

  return {
    shake,
    clearShake,
    handleSettingsDismiss,
    handleOverlayMouseDown,
    handleOverlayClick,
  };
}
