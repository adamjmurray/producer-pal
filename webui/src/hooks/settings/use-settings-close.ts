// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";

export const SETTINGS_ANIMATION_MS = 150;

/**
 * Hook for managing settings close animation state
 * @param {Function} setViewState - Function to update view state
 * @returns {object} Close animation state and handlers
 */
export function useSettingsClose(
  setViewState: (state: { settingsOpen: boolean }) => void,
): {
  settingsClosing: boolean;
  closeSettings: (afterClose: () => void) => void;
} {
  const [settingsClosing, setSettingsClosing] = useState(false);

  const closeSettings = useCallback(
    (afterClose: () => void) => {
      setSettingsClosing(true);
      setTimeout(() => {
        afterClose();
        setSettingsClosing(false);
        setViewState({ settingsOpen: false });
      }, SETTINGS_ANIMATION_MS);
    },
    [setViewState],
  );

  return { settingsClosing, closeSettings };
}
