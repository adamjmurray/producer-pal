// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import {
  type PresetSelection,
  usePresetSelection,
} from "#webui/hooks/settings/presets/use-preset-selection";
import { useGlobalSettings } from "#webui/hooks/connection/use-global-settings";
import { type PreferencesSettings } from "#webui/hooks/use-preferences-settings";
import { CHAT_UI_DOCS_URL } from "#webui/lib/config";
import { type UseSettingsReturn } from "#webui/types/settings";
import { ConnectionTab } from "./ConnectionTab";
import { ToolToggles } from "./controls/ToolToggles";
import {
  type ConversationLock,
  LockedSettingsNotice,
} from "./LockedSettingsNotice";
import { PreferencesTab } from "./PreferencesTab";
import { PresetsTab } from "./PresetsTab";
import { SettingsFooter } from "./SettingsFooter";
import { type TabId, SettingsTabs } from "./SettingsTabs";

interface SettingsScreenProps {
  settings: UseSettingsReturn;
  display: PreferencesSettings;
  theme: string;
  setTheme: (theme: string) => void;
  mcpTools: McpTool[] | null;
  mcpStatus: McpStatus;
  saveSettings: () => void;
  cancelSettings: () => void;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  shake: boolean;
  onShakeEnd: () => void;
  hasUnsavedChanges: boolean;
  /** Whether the Presets tab's create form is open. Owned by App, which uses
   * it to block the backdrop/Esc dismiss as well as this dialog's Save. */
  presetDraftOpen: boolean;
  onPresetDraftOpenChange: (open: boolean) => void;
  onDeleteAllConversations: () => void;
  onDeleteUnbookmarkedConversations: () => void;
  conversationLock: ConversationLock;
  /** ENABLE_LIVE_API=true forces the server-side Live API flag on; the
   * device toggle is ignored, so the chat UI must mirror that and disable
   * the checkbox. Mirrors the server-side liveApiForcedOn flag. */
  liveApiForcedOn: boolean;
  /** Voice id locked into a live RealtimeSession (null when idle or chat
   * mode). Used by the VoiceSelector to render a pending-change notice when
   * the user edits voice mid-session. */
  activeVoice: string | null;
  /** Opens the context editor from the Tools tab's "Edit Context" shortcut. */
  onEditContext: () => void;
}

const helpLinkClass =
  "w-6 h-6 rounded-full border border-zinc-400 dark:border-zinc-500 text-zinc-500! dark:text-zinc-400! hover:border-zinc-200 hover:text-white! dark:hover:border-zinc-300 dark:hover:text-white! flex items-center justify-center text-sm font-semibold no-underline";

/**
 * Settings screen component with tabs for connection, tools, and preferences
 * @param props - SettingsScreenProps
 * @returns Settings screen element
 */
export function SettingsScreen(props: SettingsScreenProps) {
  const {
    settings,
    display,
    activeTab,
    onTabChange,
    saveSettings,
    cancelSettings,
    shake,
    onShakeEnd,
    hasUnsavedChanges,
  } = props;

  // Owned here, not in the tab: the inactive tab is unmounted, and losing the
  // selection is what sends the user back through Select — which re-applies the
  // preset over the edit they just made. See usePresetSelection.
  const presetSelection = usePresetSelection();
  const shakeClass = shake ? " settings-dialog-shake" : "";

  return (
    <div className="flex min-h-screen justify-center p-4 pt-20">
      <div
        className={`w-full max-w-xl self-start rounded-xl border border-zinc-300 bg-zinc-100 p-6 shadow-[8px_20px_60px_rgba(0,0,0,0.15)] dark:bg-zinc-800 dark:shadow-[6px_16px_45px_rgba(255,255,255,0.04)] dark:border-zinc-600${shakeClass}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onShakeEnd}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Producer Pal Chat Settings</h2>
          {display.showHelpLinks && (
            <a
              href={`${CHAT_UI_DOCS_URL}#${activeTab}`}
              target="_blank"
              rel="noopener noreferrer"
              className={helpLinkClass}
              title="Documentation"
            >
              ?
            </a>
          )}
        </div>

        <LockedSettingsNotice
          conversationLock={props.conversationLock}
          model={settings.model}
          provider={settings.provider}
          smallModelMode={settings.smallModelMode}
          notation={settings.notation}
          enabledTools={settings.enabledTools}
          liveApiEnabled={settings.liveApiEnabled}
        />

        <SettingsTabs activeTab={activeTab} onTabChange={onTabChange}>
          {() => (
            <SettingsTabContent {...props} presetSelection={presetSelection} />
          )}
        </SettingsTabs>

        <SettingsFooter
          settingsConfigured={settings.settingsConfigured}
          saveSettings={saveSettings}
          cancelSettings={cancelSettings}
          pulse={shake}
          hasUnsavedChanges={hasUnsavedChanges}
          saveError={settings.saveError}
          blockedMessage={
            props.presetDraftOpen
              ? "Create or cancel the new preset first."
              : null
          }
        />
      </div>
    </div>
  );
}

/**
 * Renders the content for the active settings tab
 * @param props - Settings screen props plus the preset selection state
 * @returns Tab content element
 */
function SettingsTabContent(
  props: SettingsScreenProps & { presetSelection: PresetSelection },
) {
  const { settings, display, activeTab } = props;
  const providerLabel = getProviderName(settings.provider, "product");
  // Machine-global settings, read fresh each time the modal opens so a
  // device-side change shows up.
  const globalSettings = useGlobalSettings();

  return (
    <div className="space-y-4">
      {activeTab === "connection" && (
        <ConnectionTab
          provider={settings.provider}
          setProvider={settings.setProvider}
          apiKey={settings.apiKey}
          setApiKey={settings.setApiKey}
          baseUrl={settings.baseUrl}
          setBaseUrl={settings.setBaseUrl}
          model={settings.model}
          setModel={settings.setModel}
          providerLabel={providerLabel}
          thinking={settings.thinking}
          setThinking={settings.setThinking}
          smallModelMode={settings.smallModelMode}
          setSmallModelMode={settings.setSmallModelMode}
          realtimeVoice={settings.realtimeVoice}
          setRealtimeVoice={settings.setRealtimeVoice}
          voiceLanguage={settings.voiceLanguage}
          setVoiceLanguage={settings.setVoiceLanguage}
          voiceVolume={settings.voiceVolume}
          setVoiceVolume={settings.setVoiceVolume}
          voiceSpeed={settings.voiceSpeed}
          setVoiceSpeed={settings.setVoiceSpeed}
          turnDetection={settings.turnDetection}
          setTurnDetection={settings.setTurnDetection}
          activeVoice={props.activeVoice}
        />
      )}

      {activeTab === "presets" && (
        <PresetsTab
          settings={settings}
          selection={props.presetSelection}
          onDraftOpenChange={props.onPresetDraftOpenChange}
        />
      )}

      {activeTab === "tools" && (
        <ToolToggles
          tools={props.mcpTools}
          mcpStatus={props.mcpStatus}
          enabledTools={settings.enabledTools}
          setEnabledTools={settings.setEnabledTools}
          liveApiEnabled={settings.liveApiEnabled}
          setLiveApiEnabled={settings.setLiveApiEnabled}
          liveApiForcedOn={props.liveApiForcedOn}
          notation={settings.notation}
          setNotation={settings.setNotation}
          onEditContext={props.onEditContext}
          settingsConfigured={settings.settingsConfigured}
        />
      )}

      {activeTab === "preferences" && (
        <PreferencesTab
          theme={props.theme}
          setTheme={props.setTheme}
          showTimestamps={display.showTimestamps}
          setShowTimestamps={display.setShowTimestamps}
          showHelpLinks={display.showHelpLinks}
          setShowHelpLinks={display.setShowHelpLinks}
          showTokenUsage={display.showTokenUsage}
          setShowTokenUsage={display.setShowTokenUsage}
          autoUpdateCheck={globalSettings.autoUpdateCheck}
          setAutoUpdateCheck={globalSettings.setAutoUpdateCheck}
          onDeleteAllConversations={props.onDeleteAllConversations}
          onDeleteUnbookmarkedConversations={
            props.onDeleteUnbookmarkedConversations
          }
        />
      )}
    </div>
  );
}
