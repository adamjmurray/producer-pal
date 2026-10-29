// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useEffect } from "preact/hooks";
import {
  isTabId,
  type TabId,
} from "#webui/components/settings/helpers/settings-tab-ids";

/** The URL parameter that opens settings, e.g. `/chat?settings=installation`. */
const SETTINGS_PARAM = "settings";

/**
 * Open the settings on the tab named by `?settings=<tab>` when the page loads
 * (the device's "Finish installation" button links here). The parameter is
 * removed once read, so a reload doesn't reopen settings. The hash holds the
 * conversation id and is left alone. With no usable tab name, falls back to
 * `fallbackTab` (the Connection tab on a visit before chat is set up), or
 * leaves settings closed when that is null.
 * @param openSettings - Opens the settings on a tab
 * @param fallbackTab - Tab to open when the URL names none, or null for none
 */
export function useSettingsDeepLink(
  openSettings: (tab: TabId) => void,
  fallbackTab: TabId | null = null,
): void {
  useEffect(() => {
    const url = new URL(window.location.href);
    const tab = url.searchParams.get(SETTINGS_PARAM);

    if (tab != null) {
      url.searchParams.delete(SETTINGS_PARAM);
      window.history.replaceState(window.history.state, "", url);
    }

    if (tab != null && isTabId(tab)) {
      openSettings(tab);
    } else if (fallbackTab != null) {
      openSettings(fallbackTab);
    }
  }, [openSettings, fallbackTab]);
}
