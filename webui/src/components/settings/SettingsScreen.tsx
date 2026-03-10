// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getProviderName } from "#webui/components/chat/controls/header/header-helpers";
import {
  type McpStatus,
  type McpTool,
} from "#webui/hooks/connection/use-mcp-connection";
import { CHAT_UI_DOCS_URL } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";
import { AppearanceTab } from "./AppearanceTab";
import { BehaviorTab } from "./BehaviorTab";
import { ConnectionTab } from "./ConnectionTab";
import { ToolToggles } from "./controls/ToolToggles";
import { SettingsFooter } from "./SettingsFooter";
import { type TabId, SettingsTabs } from "./SettingsTabs";

interface SettingsScreenProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  provider: Provider;
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl?: string;
  setBaseUrl?: (url: string) => void;
  model: string;
  setModel: (model: string) => void;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;

  theme: string;
  setTheme: (theme: string) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
  showMessageSettings: boolean;
  setShowMessageSettings: (show: boolean) => void;

  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  mcpTools: McpTool[] | null;
  mcpStatus: McpStatus;
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
  resetBehaviorToDefaults: () => void;
  saveSettings: () => void;
  cancelSettings: () => void;
  settingsConfigured: boolean;
}

const helpLinkClass =
  "w-6 h-6 rounded-full border border-zinc-400 dark:border-zinc-500 text-zinc-500! dark:text-zinc-400! hover:border-zinc-200 hover:text-white! dark:hover:border-zinc-300 dark:hover:text-white! flex items-center justify-center text-sm font-semibold no-underline";

/**
 * Settings screen component with tabs for connection, behavior, tools, and appearance
 * @param props - Component props
 * @param props.activeTab - Currently active settings tab
 * @param props.onTabChange - Callback when settings tab changes
 * @param props.provider - Selected provider
 * @param props.setProvider - Function to update provider
 * @param props.apiKey - API key for the provider
 * @param props.setApiKey - Function to update API key
 * @param props.baseUrl - Base URL for custom and local providers
 * @param props.setBaseUrl - Function to update base URL
 * @param props.model - Selected model
 * @param props.setModel - Function to update model
 * @param props.thinking - Thinking mode setting
 * @param props.setThinking - Function to update thinking mode
 * @param props.temperature - Temperature/randomness setting
 * @param props.setTemperature - Function to update temperature
 * @param props.showThoughts - Whether to show thought blocks
 * @param props.setShowThoughts - Function to toggle thought display
 * @param props.theme - UI theme setting
 * @param props.setTheme - Function to update theme
 * @param props.showTimestamps - Whether to show message timestamps
 * @param props.setShowTimestamps - Function to toggle timestamps
 * @param props.showHelpLinks - Whether to show help link buttons
 * @param props.setShowHelpLinks - Function to toggle help links
 * @param props.showMessageSettings - Whether to show per-message behavior settings
 * @param props.setShowMessageSettings - Function to toggle message settings
 * @param props.enabledTools - Map of enabled/disabled tools
 * @param props.setEnabledTools - Function to update enabled tools
 * @param props.mcpTools - Available tools from MCP server
 * @param props.mcpStatus - MCP connection status
 * @param props.smallModelMode - Whether small model mode is enabled
 * @param props.setSmallModelMode - Function to toggle small model mode
 * @param props.resetBehaviorToDefaults - Function to reset behavior settings
 * @param props.saveSettings - Function to save settings
 * @param props.cancelSettings - Function to cancel settings changes
 * @param props.settingsConfigured - Whether settings have been configured
 * @returns Settings screen element
 */
export function SettingsScreen(props: SettingsScreenProps) {
  const {
    activeTab,
    onTabChange,
    showHelpLinks,
    saveSettings,
    cancelSettings,
    settingsConfigured,
  } = props;

  return (
    <div className="flex justify-center min-h-screen p-4 pt-20">
      <div className="max-w-xl w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl p-6 self-start shadow-[8px_20px_60px_rgba(0,0,0,0.15)] dark:shadow-[6px_16px_45px_rgba(255,255,255,0.04)] border border-zinc-300 dark:border-zinc-600">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Producer Pal Chat Settings</h2>
          {showHelpLinks && (
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

        <SettingsTabs activeTab={activeTab} onTabChange={onTabChange}>
          {() => <SettingsTabContent {...props} />}
        </SettingsTabs>

        <SettingsFooter
          settingsConfigured={settingsConfigured}
          saveSettings={saveSettings}
          cancelSettings={cancelSettings}
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
  const { activeTab, provider } = props;
  const providerLabel = getProviderName(provider, "product");

  return (
    <div className="space-y-4">
      {activeTab === "connection" && (
        <ConnectionTab
          provider={props.provider}
          setProvider={props.setProvider}
          apiKey={props.apiKey}
          setApiKey={props.setApiKey}
          baseUrl={props.baseUrl}
          setBaseUrl={props.setBaseUrl}
          model={props.model}
          setModel={props.setModel}
          providerLabel={providerLabel}
          smallModelMode={props.smallModelMode}
          setSmallModelMode={props.setSmallModelMode}
        />
      )}

      {activeTab === "behavior" && (
        <BehaviorTab
          provider={props.provider}
          model={props.model}
          thinking={props.thinking}
          setThinking={props.setThinking}
          temperature={props.temperature}
          setTemperature={props.setTemperature}
          showThoughts={props.showThoughts}
          setShowThoughts={props.setShowThoughts}
          showMessageSettings={props.showMessageSettings}
          setShowMessageSettings={props.setShowMessageSettings}
          resetBehaviorToDefaults={props.resetBehaviorToDefaults}
        />
      )}

      {activeTab === "tools" && (
        <ToolToggles
          tools={props.mcpTools}
          mcpStatus={props.mcpStatus}
          enabledTools={props.enabledTools}
          setEnabledTools={props.setEnabledTools}
        />
      )}

      {activeTab === "appearance" && (
        <AppearanceTab
          theme={props.theme}
          setTheme={props.setTheme}
          showTimestamps={props.showTimestamps}
          setShowTimestamps={props.setShowTimestamps}
          showHelpLinks={props.showHelpLinks}
          setShowHelpLinks={props.setShowHelpLinks}
        />
      )}
    </div>
  );
}
