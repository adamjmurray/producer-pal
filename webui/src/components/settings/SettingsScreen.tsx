// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import { type DisplaySettings } from "#webui/hooks/use-display-settings";
import { CHAT_UI_DOCS_URL } from "#webui/lib/config";
import { type UseSettingsReturn } from "#webui/types/settings";
import { AppearanceTab } from "./AppearanceTab";
import { ConnectionTab } from "./ConnectionTab";
import { ToolToggles } from "./controls/ToolToggles";
import {
  type ConversationLock,
  LockedSettingsNotice,
} from "./LockedSettingsNotice";
import { SettingsFooter } from "./SettingsFooter";
import { type TabId, SettingsTabs } from "./SettingsTabs";

interface SettingsScreenProps {
  settings: UseSettingsReturn;
  display: DisplaySettings;
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
  conversationLock: ConversationLock;
}

const helpLinkClass =
  "w-6 h-6 rounded-full border border-zinc-400 dark:border-zinc-500 text-zinc-500! dark:text-zinc-400! hover:border-zinc-200 hover:text-white! dark:hover:border-zinc-300 dark:hover:text-white! flex items-center justify-center text-sm font-semibold no-underline";

/**
 * Settings screen component with tabs for connection, tools, and appearance
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

  const shakeClass = shake ? " settings-dialog-shake" : "";

  return (
    <div className="flex justify-center min-h-screen p-4 pt-20">
      <div
        className={`max-w-xl w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl p-6 self-start shadow-[8px_20px_60px_rgba(0,0,0,0.15)] dark:shadow-[6px_16px_45px_rgba(255,255,255,0.04)] border border-zinc-300 dark:border-zinc-600${shakeClass}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onShakeEnd}
      >
        <div className="flex items-center justify-between mb-4">
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
        />

        <SettingsTabs activeTab={activeTab} onTabChange={onTabChange}>
          {() => <SettingsTabContent {...props} />}
        </SettingsTabs>

        <SettingsFooter
          settingsConfigured={settings.settingsConfigured}
          saveSettings={saveSettings}
          cancelSettings={cancelSettings}
          pulse={shake}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </div>
    </div>
  );
}

/**
 * Renders the content for the active settings tab
 * @param props - Settings screen props (uses activeTab to determine which tab to render)
 * @returns Tab content element
 */
function SettingsTabContent(props: SettingsScreenProps) {
  const { settings, display, activeTab } = props;
  const providerLabel = getProviderName(settings.provider, "product");

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
        />
      )}

      {activeTab === "tools" && (
        <ToolToggles
          tools={props.mcpTools}
          mcpStatus={props.mcpStatus}
          enabledTools={settings.enabledTools}
          setEnabledTools={settings.setEnabledTools}
        />
      )}

      {activeTab === "display" && (
        <AppearanceTab
          theme={props.theme}
          setTheme={props.setTheme}
          showTimestamps={display.showTimestamps}
          setShowTimestamps={display.setShowTimestamps}
          showHelpLinks={display.showHelpLinks}
          setShowHelpLinks={display.setShowHelpLinks}
        />
      )}
    </div>
  );
}
