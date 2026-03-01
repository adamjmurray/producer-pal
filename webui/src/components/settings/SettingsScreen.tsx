// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "preact/hooks";
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

/**
 * Gets a display label for the provider
 * @param {string} provider - The provider identifier
 * @returns {string} Display label for the provider
 */
function getProviderLabel(provider: string): string {
  switch (provider) {
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    case "mistral":
      return "Mistral";
    case "openrouter":
      return "OpenRouter";
    case "lmstudio":
      return "LM Studio";
    case "ollama":
      return "Ollama";
    default:
      return "Custom";
  }
}

/**
 * Settings screen component
 * @param {object} props - Component props
 * @param {Provider} props.provider - Selected provider
 * @param {Function} props.setProvider - Function to update provider
 * @param {string} props.apiKey - API key for the provider
 * @param {Function} props.setApiKey - Function to update API key
 * @param {string} props.baseUrl - Base URL for custom and local providers
 * @param {Function} props.setBaseUrl - Function to update base URL
 * @param {string} props.model - Selected model
 * @param {Function} props.setModel - Function to update model
 * @param {string} props.thinking - Thinking mode setting
 * @param {Function} props.setThinking - Function to update thinking mode
 * @param {number} props.temperature - Temperature/randomness setting
 * @param {Function} props.setTemperature - Function to update temperature
 * @param {boolean} props.showThoughts - Whether to show thought blocks
 * @param {Function} props.setShowThoughts - Function to toggle thought display
 * @param {string} props.theme - UI theme setting
 * @param {Function} props.setTheme - Function to update theme
 * @param {object} props.enabledTools - Map of enabled/disabled tools
 * @param {Function} props.setEnabledTools - Function to update enabled tools
 * @param {McpTool[] | null} props.mcpTools - Available tools from MCP server
 * @param {McpStatus} props.mcpStatus - MCP connection status
 * @param {boolean} props.smallModelMode - Whether small model mode is enabled
 * @param {Function} props.setSmallModelMode - Function to toggle small model mode
 * @param {Function} props.resetBehaviorToDefaults - Function to reset behavior settings
 * @param {Function} props.saveSettings - Function to save settings
 * @param {Function} props.cancelSettings - Function to cancel settings changes
 * @param {boolean} props.settingsConfigured - Whether settings have been configured
 * @returns {JSX.Element} Settings screen component
 */
export function SettingsScreen({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  baseUrl,
  setBaseUrl,
  model,
  setModel,
  thinking,
  setThinking,
  temperature,
  setTemperature,
  showThoughts,
  setShowThoughts,
  theme,
  setTheme,
  enabledTools,
  setEnabledTools,
  mcpTools,
  mcpStatus,
  smallModelMode,
  setSmallModelMode,
  resetBehaviorToDefaults,
  saveSettings,
  cancelSettings,
  settingsConfigured,
}: SettingsScreenProps) {
  const providerLabel = getProviderLabel(provider);
  const [activeTab, setActiveTab] = useState<TabId>("connection");

  return (
    <div className="flex justify-center min-h-screen p-4 pt-20">
      <div className="max-w-lg w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-6 self-start">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Producer Pal Chat Settings</h2>
          <a
            href={`${CHAT_UI_DOCS_URL}#${activeTab}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-6 h-6 rounded-full border border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 flex items-center justify-center text-sm font-semibold"
            title="Help"
          >
            ?
          </a>
        </div>

        <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab}>
          {() => (
            <div className="space-y-4">
              {/* Connection Tab */}
              {activeTab === "connection" && (
                <ConnectionTab
                  provider={provider}
                  setProvider={setProvider}
                  apiKey={apiKey}
                  setApiKey={setApiKey}
                  baseUrl={baseUrl}
                  setBaseUrl={setBaseUrl}
                  model={model}
                  setModel={setModel}
                  providerLabel={providerLabel}
                  smallModelMode={smallModelMode}
                  setSmallModelMode={setSmallModelMode}
                />
              )}

              {/* Behavior Tab */}
              {activeTab === "behavior" && (
                <BehaviorTab
                  provider={provider}
                  model={model}
                  thinking={thinking}
                  setThinking={setThinking}
                  temperature={temperature}
                  setTemperature={setTemperature}
                  showThoughts={showThoughts}
                  setShowThoughts={setShowThoughts}
                  resetBehaviorToDefaults={resetBehaviorToDefaults}
                />
              )}

              {/* Tools Tab */}
              {activeTab === "tools" && (
                <ToolToggles
                  tools={mcpTools}
                  mcpStatus={mcpStatus}
                  enabledTools={enabledTools}
                  setEnabledTools={setEnabledTools}
                />
              )}

              {/* Appearance Tab */}
              {activeTab === "appearance" && (
                <AppearanceTab theme={theme} setTheme={setTheme} />
              )}
            </div>
          )}
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
