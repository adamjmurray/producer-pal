// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { ChatApp } from "#webui/components/ChatApp";
import {
  DEFAULT_MODE_CONTEXT,
  type ModeContext,
} from "#webui/components/mode-context";
import { VoiceApp } from "#webui/components/voice/VoiceApp";
import { ToolNamesContext } from "#webui/hooks/connection/tool-names-context";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSyncLiveApiEnabled } from "#webui/hooks/connection/use-sync-live-api-enabled";
import { useHasUnsavedChanges } from "#webui/hooks/settings/use-has-unsaved-changes";
import { useSaveSettingsHandler } from "#webui/hooks/settings/use-save-settings-handler";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useSettingsClose } from "#webui/hooks/settings/use-settings-close";
import { useSettingsDismiss } from "#webui/hooks/settings/use-settings-dismiss";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { usePreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { useViewState } from "#webui/hooks/view-state/use-view-state";
import { isRealtimeSelection } from "#webui/lib/constants/models";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import { SettingsScreen } from "./settings/SettingsScreen";
import { type TabId } from "./settings/SettingsTabs";

/**
 * Root component. Owns shared chrome (settings hook, theme, view state, MCP
 * connection, settings modal) and routes the body to either the chat or voice
 * mode based on the current settings.model. Each mode component owns its own
 * conversation/session hooks and reports its delete handlers + conversation
 * lock back here so the shared SettingsScreen can act on the active mode.
 *
 * @returns App element with mode-routed body and shared settings modal
 */
export function App() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const { viewState, setViewState } = useViewState();
  const display = usePreferencesSettings();
  const openSettings = useCallback(
    (settingsTab?: TabId) =>
      setViewState(
        settingsTab
          ? { settingsOpen: true, settingsTab }
          : { settingsOpen: true },
      ),
    [setViewState],
  );
  const { mcpStatus, mcpError, mcpTools, checkMcpConnection } =
    useMcpConnection();
  const toolNamesMap = useMemo(
    () => Object.fromEntries(mcpTools?.map((t) => [t.id, t.name]) ?? []),
    [mcpTools],
  );
  const remoteConfig = useRemoteConfig(mcpStatus);
  const totalToolsCount = mcpTools?.length ?? 0;
  const enabledToolsCount = mcpTools
    ? mcpTools.filter((t) => settings.enabledTools[t.id] !== false).length
    : 0;

  const showSettings = viewState.settingsOpen || !settings.settingsConfigured;
  const { settingsClosing, closeSettings } = useSettingsClose(setViewState);

  useSyncLiveApiEnabled(
    remoteConfig.serverLiveApiEnabled,
    settings.liveApiEnabledDirty,
    settings.seedLiveApiEnabled,
  );

  // Track original appearance settings when settings opened (for cancel)
  const originalThemeRef = useRef(theme);
  const originalDisplayRef = useRef(display);
  const prevShowSettingsRef = useRef(showSettings);

  useEffect(() => {
    if (showSettings && !prevShowSettingsRef.current) {
      originalThemeRef.current = theme;
      originalDisplayRef.current = { ...display };
    }

    prevShowSettingsRef.current = showSettings;
  }, [showSettings, theme, display]);

  const appearance = {
    theme,
    showTimestamps: display.showTimestamps,
    showHelpLinks: display.showHelpLinks,
    showTokenUsage: display.showTokenUsage,
  };
  const hasUnsavedChanges = useHasUnsavedChanges(
    settings,
    appearance,
    showSettings,
  );

  const handleSaveSettings = useSaveSettingsHandler({
    settings,
    display,
    remoteConfig,
    checkMcpConnection,
    closeSettings,
  });

  const handleCancelSettings = useCallback(() => {
    closeSettings(() => {
      settings.cancelSettings();
      setTheme(originalThemeRef.current);
      const orig = originalDisplayRef.current;

      display.setShowTimestamps(orig.showTimestamps);
      display.setShowHelpLinks(orig.showHelpLinks);
      display.setShowTokenUsage(orig.showTokenUsage);
    });
  }, [closeSettings, settings, setTheme, display]);

  const { shake, clearShake, handleSettingsDismiss } = useSettingsDismiss({
    showSettings,
    settingsConfigured: settings.settingsConfigured,
    settingsClosing,
    hasUnsavedChanges,
    handleCancelSettings,
  });

  // The active mode reports its conversation lock + delete handlers here via
  // setModeContext so the shared SettingsScreen renders them.
  const [modeContext, setModeContext] =
    useState<ModeContext>(DEFAULT_MODE_CONTEXT);

  // Override the mode-routing decision so a foreign-mode conversation (e.g. a
  // voice record opened while saved is a chat model) renders in its native UI
  // without mutating the user's saved settings. null = follow savedModel.
  // Cleared by "New conversation" so the next fresh session uses savedModel.
  const [viewingMode, setViewingMode] = useState<"chat" | "voice" | null>(null);
  const onForeignRecord = useCallback((record: ConversationRecord) => {
    setViewingMode(record.sessionType === "voice" ? "voice" : "chat");
  }, []);
  const clearViewingMode = useCallback(() => {
    setViewingMode(null);
  }, []);

  // Mode is derived from the saved provider+model (only updates on save), not
  // the in-modal `provider`/`model`. This prevents the underlying chat or voice
  // screen from re-mounting mid-modal whenever the user explores the dropdowns.
  // Pairing the saved provider with the saved model also keeps voice routing to
  // providers that actually have a voice backend (OpenAI today): a foreign
  // provider reusing a realtime model id stays in chat. viewingMode overrides
  // the route while a foreign-mode conversation is being viewed.
  const isVoiceMode =
    viewingMode != null
      ? viewingMode === "voice"
      : isRealtimeSelection(settings.savedProvider, settings.savedModel);

  const sharedModeProps = {
    settings,
    display,
    viewState,
    setViewState,
    mcpStatus,
    totalToolsCount,
    enabledToolsCount,
    onOpenSettings: () => openSettings(),
    /* v8 ignore start -- inline settings tab navigation */
    onOpenToolsSettings: () => openSettings("tools"),
    onOpenConnectionSettings: () => openSettings("connection"),
    /* v8 ignore stop */
    onForeignRecord,
    clearViewingMode,
    setModeContext,
  };

  return (
    <ToolNamesContext.Provider value={toolNamesMap}>
      <div
        className={
          showSettings
            ? `pointer-events-none ${settingsClosing ? "settings-blur-out" : "settings-blur"}`
            : ""
        }
      >
        {isVoiceMode ? (
          <VoiceApp {...sharedModeProps} />
        ) : (
          <ChatApp
            {...sharedModeProps}
            mcpError={mcpError}
            checkMcpConnection={checkMcpConnection}
            remoteConfig={remoteConfig}
          />
        )}
      </div>
      {showSettings && (
        <div
          className={`settings-overlay ${settingsClosing ? "settings-closing" : ""}`}
          onClick={handleSettingsDismiss}
        >
          <SettingsScreen
            settings={settings}
            display={display}
            theme={theme}
            setTheme={setTheme}
            mcpTools={mcpTools}
            mcpStatus={mcpStatus}
            saveSettings={handleSaveSettings}
            cancelSettings={handleCancelSettings}
            activeTab={viewState.settingsTab}
            onTabChange={(tab: TabId) => setViewState({ settingsTab: tab })}
            shake={shake}
            onShakeEnd={clearShake}
            hasUnsavedChanges={hasUnsavedChanges}
            onDeleteAllConversations={modeContext.onDeleteAllConversations}
            onDeleteUnbookmarkedConversations={
              modeContext.onDeleteUnbookmarkedConversations
            }
            conversationLock={modeContext.conversationLock}
            liveApiForcedOn={remoteConfig.serverLiveApiForcedOn}
            activeVoice={modeContext.activeVoice}
          />
        </div>
      )}
    </ToolNamesContext.Provider>
  );
}
