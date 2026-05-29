// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useState } from "preact/hooks";
import { type TabId } from "#webui/components/settings/SettingsTabs";

const VIEW_STATE_KEY = "producer_pal_view_state";

/** Persisted UI view state */
export interface ViewState {
  historyPanelOpen: boolean;
  settingsOpen: boolean;
  settingsTab: TabId;
}

const DEFAULT_VIEW_STATE: ViewState = {
  historyPanelOpen: false,
  settingsOpen: false,
  settingsTab: "connection",
};

/**
 * Persists UI view state (panel visibility, settings tab) to localStorage.
 * @returns View state and a setter that merges partial updates
 */
export function useViewState(): {
  viewState: ViewState;
  setViewState: (partial: Partial<ViewState>) => void;
} {
  const [viewState, setViewStateInternal] = useState<ViewState>(() =>
    loadViewState(),
  );

  const setViewState = useCallback((partial: Partial<ViewState>) => {
    setViewStateInternal((prev) => {
      const next = { ...prev, ...partial };

      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(next));

      return next;
    });
  }, []);

  return { viewState, setViewState };
}

// --- Helpers below main export ---

/**
 * Load view state from localStorage, falling back to defaults.
 * @returns Merged view state
 */
function loadViewState(): ViewState {
  try {
    const stored = localStorage.getItem(VIEW_STATE_KEY);

    if (!stored) return DEFAULT_VIEW_STATE;

    const parsed = JSON.parse(stored) as Partial<ViewState>;
    const merged = { ...DEFAULT_VIEW_STATE, ...parsed };

    // Guard against corrupted settingsTab (e.g. stored as non-string value)
    if (typeof merged.settingsTab !== "string") {
      merged.settingsTab = DEFAULT_VIEW_STATE.settingsTab;
    }

    return merged;
  } catch {
    return DEFAULT_VIEW_STATE;
  }
}
