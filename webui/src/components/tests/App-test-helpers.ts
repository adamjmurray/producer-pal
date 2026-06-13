// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { useChat } from "#webui/hooks/chat/use-chat";
import { useConversations } from "#webui/hooks/chat/use-conversations";
import { useMcpConnection } from "#webui/hooks/connection/use-mcp-connection";
import { useRemoteConfig } from "#webui/hooks/connection/use-remote-config";
import { DEFAULT_TURN_DETECTION } from "#webui/hooks/settings/turn-detection-helpers";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { useTheme } from "#webui/hooks/theme/use-theme";
import { useViewState } from "#webui/hooks/view-state/use-view-state";

export const mockChatHook = {
  messages: [],
  isAssistantResponding: false,
  handleSend: vi.fn(),
  handleRetry: vi.fn(),
  clearConversation: vi.fn(),
  stopResponse: vi.fn(),
  activeModel: "test-model",
  activeThinking: null,
  activeTemperature: 1.0,
  activeSmallModelMode: null,
  queuedMessages: [],
  enqueueMessage: vi.fn(),
  removeMessage: vi.fn(),
};

export const mockSettingsHook = {
  provider: "gemini" as const,
  setProvider: vi.fn(),

  apiKey: "test-key",
  setApiKey: vi.fn(),
  openaiApiKey: "",
  geminiApiKey: "",
  getProviderConnection: vi.fn(() => ({
    apiKey: "test-key",
    baseUrl: undefined as string | undefined,
  })),
  baseUrl: "",
  setBaseUrl: vi.fn(),
  model: "gemini-1.5-flash",
  setModel: vi.fn(),
  savedModel: "gemini-1.5-flash",
  savedProvider: "gemini" as const,
  thinking: "default" as const,
  setThinking: vi.fn(),
  temperature: 1.0,
  setTemperature: vi.fn(),
  showThoughts: false,
  setShowThoughts: vi.fn(),

  enabledTools: {},
  setEnabledTools: vi.fn(),
  resetBehaviorToDefaults: vi.fn(),

  saveSettings: vi.fn().mockResolvedValue(true),
  cancelSettings: vi.fn(),
  settingsConfigured: true,
  saveError: null,

  smallModelMode: false,
  setSmallModelMode: vi.fn(),

  liveApiEnabled: false,
  liveApiEnabledDirty: false,
  setLiveApiEnabled: vi.fn(),
  seedLiveApiEnabled: vi.fn(),

  savedTurnDetection: DEFAULT_TURN_DETECTION,
};

/**
 * Set up default mock return values for all App hooks.
 * Call in beforeEach after vi.clearAllMocks().
 */
export function setupDefaultMocks(): void {
  (useSettings as ReturnType<typeof vi.fn>).mockReturnValue(mockSettingsHook);
  (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
    theme: "light",
    setTheme: vi.fn(),
  });
  (useMcpConnection as ReturnType<typeof vi.fn>).mockReturnValue({
    mcpStatus: "connected",
    mcpError: null,
    mcpTools: [
      { id: "ppal-connect", name: "Connect to Ableton" },
      { id: "ppal-read-live-set", name: "Read Live Set" },
    ],
    checkMcpConnection: vi.fn(),
  });
  (useChat as ReturnType<typeof vi.fn>).mockReturnValue(mockChatHook);
  (useConversations as ReturnType<typeof vi.fn>).mockReturnValue({
    conversations: [],
    activeConversationId: null,
    saveCurrentConversation: vi.fn().mockResolvedValue(undefined),
    switchConversation: vi.fn().mockResolvedValue(undefined),
    startNewConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    renameConversation: vi.fn().mockResolvedValue(undefined),
    toggleBookmark: vi.fn().mockResolvedValue(undefined),
  });
  (useViewState as ReturnType<typeof vi.fn>).mockReturnValue({
    viewState: {
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection",
    },
    setViewState: vi.fn(),
  });
  (useRemoteConfig as ReturnType<typeof vi.fn>).mockReturnValue({
    serverSmallModelMode: false,
    serverLiveApiEnabled: false,
    serverLiveApiForcedOn: false,
    postSmallModelMode: vi.fn(),
    postLiveApiEnabled: vi.fn().mockResolvedValue(undefined),
  });
}
