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
import {
  type McpTool,
  useMcpConnection,
} from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { useSyncServerSetting } from "#webui/hooks/connection/use-sync-server-setting";
import { useHasUnsavedChanges } from "#webui/hooks/settings/use-has-unsaved-changes";
import { useSaveSettingsHandler } from "#webui/hooks/settings/use-save-settings-handler";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useSettingsClose } from "#webui/hooks/settings/use-settings-close";
import { useSettingsDismiss } from "#webui/hooks/settings/use-settings-dismiss";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { usePreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { useBackdropClick } from "#webui/hooks/use-backdrop-click";
import { useViewState } from "#webui/hooks/view-state/use-view-state";
import { isRealtimeSelection } from "#webui/lib/constants/models";
import { type ConversationRecord } from "#webui/lib/conversation-db";
import {
  enabledToolsDiverge as toolsetsDiffer,
  withLiveApiTool,
} from "#webui/lib/utils/enabled-tools";
import { ContextTabs } from "./context/ContextTabs";
import { SettingsScreen } from "./settings/SettingsScreen";
import { type TabId } from "./settings/SettingsTabs";

const CONTEXT_ANIMATION_MS = 150;

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

  const showSettings = viewState.settingsOpen || !settings.settingsConfigured;
  const { settingsClosing, closeSettings } = useSettingsClose(setViewState);
  // The Presets tab's create form is a sub-form inside the settings dialog:
  // saving or dismissing would close the modal over an unfinished preset, so
  // while it's open both paths are blocked. Lives here because the dismiss
  // handlers (backdrop, Esc) do too.
  const [presetDraftOpen, setPresetDraftOpen] = useState(false);

  useSyncServerSetting(
    remoteConfig.serverLiveApiEnabled,
    settings.liveApiEnabledDirty,
    settings.seedLiveApiEnabled,
  );
  useSyncServerSetting(
    remoteConfig.serverNotation,
    settings.notationDirty,
    settings.seedNotation,
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

  const handleSaveSettings = useSaveSettingsHandler({
    settings,
    display,
    remoteConfig,
    checkMcpConnection,
    closeSettings,
    viewingMode,
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

  // Context overlay (project + global tabs; sibling to Settings). Animation timing mirrors
  // useSettingsClose; auto-save makes a confirm-on-close flow unnecessary.
  // Transient session state, intentionally not persisted: a refresh or a fresh
  // tab opened from the Max device lands on chat, not the context editor.
  const [contextOpen, setContextOpen] = useState(false);
  const { shake, clearShake, overlayHandlers } = useSettingsDismiss({
    showSettings,
    settingsConfigured: settings.settingsConfigured,
    settingsClosing,
    hasUnsavedChanges,
    handleCancelSettings,
    // Defer Esc to the Context overlay when both are open. Settings renders
    // above Context in the DOM, but the Context overlay is the one with an
    // unconditional Esc-dismiss path (Settings won't dismiss when
    // !settingsConfigured) — without this, both handlers fire and either
    // Settings refuses to close OR both close at once.
    blockEscape: contextOpen,
    blockDismiss: presetDraftOpen,
  });

  const [contextClosing, setContextClosing] = useState(false);
  const openContext = useCallback(() => setContextOpen(true), []);
  const closeContext = useCallback(() => {
    setContextClosing(true);
    setTimeout(() => {
      setContextClosing(false);
      setContextOpen(false);
    }, CONTEXT_ANIMATION_MS);
  }, []);

  // The context editor's leave guard lives inside ContextTabs (which also mounts
  // standalone on /context, so the guard can't move up here). ContextTabs
  // publishes its confirmLeave into this ref so the overlay's Escape and
  // backdrop-click paths — which close from OUTSIDE that subtree — honor an
  // unsaved new-entry draft instead of silently discarding it. The header close
  // button is already guarded inside ContextTabs.
  const contextConfirmLeaveRef = useRef<(() => boolean) | null>(null);
  const attemptCloseContext = useCallback(() => {
    const confirmLeave = contextConfirmLeaveRef.current;

    if (confirmLeave == null || confirmLeave()) closeContext();
  }, [closeContext]);

  const contextBackdrop = useBackdropClick(
    useCallback(
      (e: MouseEvent) => {
        // Existing entries autosave, so a backdrop click is safe for them;
        // an unsaved new-entry draft is guarded (confirm before discard).
        // Only close on backdrop hits, not clicks inside the editor.
        if (e.target === e.currentTarget) attemptCloseContext();
      },
      [attemptCloseContext],
    ),
  );

  // Jump from the Settings "Edit Context" shortcut straight into the context
  // editor. Settings and Context are sibling overlays with Settings stacked on
  // top, so leaving Settings open would hide the editor behind it — close
  // Settings first (its exit animation runs), then open Context.
  const handleEditContext = useCallback(() => {
    closeSettings(() => openContext());
  }, [closeSettings, openContext]);

  // Escape closes the context overlay (consistent with native modal idioms),
  // honoring the editor's leave guard for an unsaved draft.
  useEffect(() => {
    if (!contextOpen) return undefined;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") attemptCloseContext();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [contextOpen, attemptCloseContext]);

  // The active mode reports its conversation lock + delete handlers here via
  // setModeContext so the shared SettingsScreen renders them.
  const [modeContext, setModeContext] =
    useState<ModeContext>(DEFAULT_MODE_CONTEXT);

  const toolIndicator = toolIndicatorState(
    mcpTools,
    modeContext.conversationLock.activeEnabledTools,
    settings.enabledTools,
    remoteConfig.serverLiveApiEnabled,
  );

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
    ...toolIndicator,
    onOpenSettings: () => openSettings(),
    /* v8 ignore start -- inline settings tab navigation */
    onOpenToolsSettings: () => openSettings("tools"),
    onOpenConnectionSettings: () => openSettings("connection"),
    /* v8 ignore stop */
    onOpenContext: openContext,
    onForeignRecord,
    clearViewingMode,
    setModeContext,
  };

  // Blur+disable interaction beneath any modal overlay (settings or context).
  const overlayOpen = showSettings || contextOpen;
  const overlayClosing = settingsClosing || contextClosing;

  return (
    <ToolNamesContext.Provider value={toolNamesMap}>
      <div
        className={
          overlayOpen
            ? `pointer-events-none ${overlayClosing ? "settings-blur-out" : "settings-blur"}`
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
      {contextOpen && (
        <div
          className={`settings-overlay ${contextClosing ? "settings-closing" : ""}`}
          {...contextBackdrop}
        >
          {/* Stable panel wrapper. The overlay's fade-in/out animation targets
              `.settings-overlay > *` (see main.css), and ContextTabs remounts
              its screen root on every tab switch — doc tabs are keyed, Skills and
              Memory are different components. Without this wrapper each switch
              re-ran the opacity 0→1 fade and flashed the blurred chat UI through
              the panel. The wrapper stays mounted across tab switches, so the
              panel fades once on open (matching the Settings overlay). */}
          <div>
            <ContextTabs
              onClose={closeContext}
              confirmLeaveRef={contextConfirmLeaveRef}
            />
          </div>
        </div>
      )}
      {showSettings && (
        <div
          className={`settings-overlay ${settingsClosing ? "settings-closing" : ""}`}
          {...overlayHandlers}
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
            presetDraftOpen={presetDraftOpen}
            onPresetDraftOpenChange={setPresetDraftOpen}
            onDeleteAllConversations={modeContext.onDeleteAllConversations}
            onDeleteUnbookmarkedConversations={
              modeContext.onDeleteUnbookmarkedConversations
            }
            conversationLock={modeContext.conversationLock}
            liveApiForcedOn={remoteConfig.serverLiveApiForcedOn}
            activeVoice={modeContext.activeVoice}
            onEditContext={handleEditContext}
          />
        </div>
      )}
    </ToolNamesContext.Provider>
  );
}

// --- Helpers below main export ---

/**
 * What the header's tools indicator shows: the size of the toolset the active
 * conversation is PINNED to, and whether the current setting has moved past it.
 *
 * Counting the pinned map rather than the setting is what keeps the header
 * honest — a restored conversation reconnects on the tools it ran with, so the
 * setting can say 1/21 while the conversation is really running 21/21. Null
 * before the first send (and in voice, which pins nothing): there the setting is
 * what the next client will use, and nothing has diverged from it yet.
 *
 * The setting's own count rides along so the locked tooltip can name what the
 * default moved to, the way the model display does.
 *
 * Both maps get the Direct Live API flag stamped in the same way (see
 * withLiveApiTool), so the comparison is between two toolsets described alike —
 * stamping only one side would report a divergence on every conversation.
 *
 * @param mcpTools - The server's tool catalog, or null before it loads
 * @param lockedTools - The conversation's pinned toolset, or null when unpinned
 * @param settingsTools - The current Tools-tab selection
 * @param liveApiEnabled - The device's current Direct Live API flag
 * @returns The counts to display and whether to flag the display as locked
 */
function toolIndicatorState(
  mcpTools: McpTool[] | null,
  lockedTools: Record<string, boolean> | null,
  settingsTools: Record<string, boolean>,
  liveApiEnabled: boolean,
): {
  enabledToolsCount: number;
  defaultToolsCount: number;
  enabledToolsDiverge: boolean;
} {
  const count = (tools: Record<string, boolean>): number =>
    mcpTools ? mcpTools.filter((tool) => tools[tool.id] !== false).length : 0;
  const settings = withLiveApiTool(settingsTools, liveApiEnabled);
  const locked =
    lockedTools == null ? null : withLiveApiTool(lockedTools, liveApiEnabled);

  return {
    enabledToolsCount: count(locked ?? settings),
    defaultToolsCount: count(settings),
    enabledToolsDiverge: locked != null && toolsetsDiffer(locked, settings),
  };
}
