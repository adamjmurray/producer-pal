// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type UseRemoteConfigReturn } from "#webui/hooks/connection/use-remote-config";
import {
  type PreferencesSettings,
  savePreferencesSettings,
} from "#webui/hooks/use-preferences-settings";
import { type UseSettingsReturn } from "#webui/types/settings";

interface UseSaveSettingsHandlerArgs {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  remoteConfig: UseRemoteConfigReturn;
  checkMcpConnection: () => Promise<void>;
  closeSettings: (afterClose: () => void) => void;
}

/**
 * Builds the Save-button handler. Persists local settings, posts updates to
 * the MCP server, and refreshes the MCP tool list when liveApiEnabled flipped
 * (the server only exposes ppal-live-api when the flag is on, so listTools
 * must run after the POST completes).
 * @param args - Dependencies
 * @returns Save handler
 */
export function useSaveSettingsHandler(
  args: UseSaveSettingsHandlerArgs,
): () => void {
  const { settings, display, remoteConfig, checkMcpConnection, closeSettings } =
    args;

  return useCallback(() => {
    const liveApiChanged =
      settings.liveApiEnabled !== remoteConfig.serverLiveApiEnabled;

    closeSettings(() => {
      settings.saveSettings();
      remoteConfig.postSmallModelMode(settings.smallModelMode);
      savePreferencesSettings(display);

      if (liveApiChanged) {
        void remoteConfig
          .postLiveApiEnabled(settings.liveApiEnabled)
          .then(checkMcpConnection);
      }
    });
  }, [settings, display, remoteConfig, checkMcpConnection, closeSettings]);
}
