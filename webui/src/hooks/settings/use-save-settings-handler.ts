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
import { isRealtimeSelection } from "#webui/lib/constants/models";
import { type UseSettingsReturn } from "#webui/types/settings";

interface UseSaveSettingsHandlerArgs {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  remoteConfig: UseRemoteConfigReturn;
  checkMcpConnection: () => Promise<void>;
  closeSettings: (afterClose: () => void) => void;
  /** App.tsx's foreign-record view override. Non-null means a record from the
   * other mode is pinned on screen; the hash must survive a mode-flip save. */
  viewingMode: "chat" | "voice" | null;
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
  const {
    settings,
    display,
    remoteConfig,
    checkMcpConnection,
    closeSettings,
    viewingMode,
  } = args;

  return useCallback(() => {
    // Only POST liveApiEnabled when the user actually toggled it in the
    // modal. Comparing local vs server value here would clobber device-side
    // changes that arrived mid-modal, or post the default `false` if the
    // server fetch hadn't resolved by the time the user opened settings.
    const liveApiChanged = settings.liveApiEnabledDirty;
    const notationChanged = settings.notationDirty;
    // If saving flips voice ↔ chat mode, the URL hash (which points to the
    // previous mode's conversation) becomes a "foreign" record. Without
    // clearing it, the new mode's mount handler would bounce the user right
    // back into the old mode via onForeignRecord. Clear it synchronously so
    // the new mode mounts with no active conversation.
    //
    // This intentionally does NOT touch App.tsx's `viewingMode`. If the user
    // opened a record from the other mode and is viewing it, saving leaves them
    // on that record (cleared only by "New conversation") — the new default
    // takes effect on the next conversation, matching how chat model/provider
    // changes apply going forward rather than retroactively.
    //
    // But when a foreign record IS pinned (viewingMode != null), the screen
    // does NOT remount on save — viewingMode keeps driving the route — so the
    // hash still points at the record on display. Clearing it then would wipe
    // the only pointer to that conversation and lose it on reload. Only clear
    // the hash when nothing foreign is pinned and the new mode mounts fresh.
    const modeWillChange =
      isRealtimeSelection(settings.savedProvider, settings.savedModel) !==
      isRealtimeSelection(settings.provider, settings.model);

    // Persist BEFORE closing the modal: a failed encryption/IndexedDB write
    // keeps the modal open so the user sees saveError and can retry instead
    // of the modal closing with silent data loss. Post-save effects (URL hash
    // mode-flip, preferences write, liveApi POST + tool re-list, smallModelMode
    // POST) only fire on durable success — running them against an unpersisted
    // state would route the app off settings that aren't actually saved.
    void settings.saveSettings().then((ok) => {
      if (!ok) return;
      closeSettings(() => {
        if (modeWillChange && viewingMode == null) {
          history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }

        remoteConfig.postSmallModelMode(settings.smallModelMode);
        savePreferencesSettings(display);

        if (liveApiChanged) {
          void remoteConfig
            .postLiveApiEnabled(settings.liveApiEnabled)
            .then(checkMcpConnection);
        }

        // Notation only changes how clips are read/written — no tool list
        // changes — so unlike liveApiEnabled it needs no MCP reconnect.
        if (notationChanged) {
          remoteConfig.postNotation(settings.notation);
        }
      });
    });
  }, [
    settings,
    display,
    remoteConfig,
    checkMcpConnection,
    closeSettings,
    viewingMode,
  ]);
}
