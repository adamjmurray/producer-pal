// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { type Mock, vi } from "vitest";
import { type VoiceAppProps } from "#webui/components/voice/VoiceApp";
import { DEFAULT_TURN_DETECTION } from "#webui/hooks/settings/turn-detection-helpers";
import { type ConversationSummary } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";

export interface VoiceAppMocks {
  getMcpUrl: Mock;
  useVoiceSession: Mock;
  useGeminiVoiceSession: Mock;
  isFirefox: Mock;
  useUpdateCheck: Mock;
  useVoicePersistence: Mock;
  useConversationTransfer: Mock;
}

/**
 * Wire default return values into the VoiceApp mock bag. Use from `beforeEach`.
 *
 * @param mocks - The hoisted mock bag from the test file
 */
export function installVoiceAppMockDefaults(mocks: VoiceAppMocks): void {
  mocks.getMcpUrl.mockReturnValue("http://localhost:3350/mcp");
  mocks.isFirefox.mockReturnValue(false);
  mocks.useUpdateCheck.mockReturnValue({
    update: null,
    dismissUpdate: vi.fn(),
  });
  mocks.useVoiceSession.mockReturnValue(baseSession());
  mocks.useGeminiVoiceSession.mockReturnValue(baseSession());
  mocks.useVoicePersistence.mockReturnValue(basePersistence());
  mocks.useConversationTransfer.mockReturnValue({
    notification: null,
    dismissNotification: vi.fn(),
    handleExport: vi.fn(),
    handleExportOne: vi.fn(),
    handleImport: vi.fn(),
  });
}

/**
 * Reset every entry in the VoiceApp mock bag. Use from `afterEach`.
 *
 * @param mocks - The hoisted mock bag from the test file
 */
export function resetVoiceAppMocks(mocks: VoiceAppMocks): void {
  mocks.getMcpUrl.mockReset();
  mocks.useVoiceSession.mockReset();
  mocks.useGeminiVoiceSession.mockReset();
  mocks.isFirefox.mockReset();
  mocks.useUpdateCheck.mockReset();
  mocks.useVoicePersistence.mockReset();
  mocks.useConversationTransfer.mockReset();
}

export interface PropOverrides {
  apiKey?: string;
  provider?: "openai" | "anthropic" | "gemini";
  onOpenSettings?: () => void;
  savedRealtimeVoice?: string;
  /** Override the saved/active model (defaults to the OpenAI realtime model). */
  model?: string;
  /** Per-provider keys (defaults derive from apiKey + provider). Set both
   * explicitly to simulate "user has saved both keys, now loading a record
   * from the other provider" for record-aware routing tests. */
  openaiApiKey?: string;
  geminiApiKey?: string;
}

/**
 * Build a full VoiceAppProps bag with sensible defaults for VoiceApp tests.
 * vi.fn() returns a Mock with a Constructable signature that TS refuses to
 * assign to a plain `() => void`, so the result is cast to VoiceAppProps.
 *
 * @param o - Per-test overrides
 * @returns VoiceAppProps ready to spread onto <VoiceApp />
 */
export function makeProps(o: PropOverrides = {}): VoiceAppProps {
  const apiKey = o.apiKey ?? "sk-test";
  const provider = o.provider ?? "openai";
  const model = o.model ?? "gpt-realtime-2.1";
  // Default the per-provider keys to match the current provider's apiKey so
  // pre-existing tests (which only set `apiKey + provider`) behave unchanged.
  // Tests that exercise record-aware routing (both keys saved, current provider
  // is the other one) override openaiApiKey / geminiApiKey directly.
  const openaiApiKey = o.openaiApiKey ?? (provider === "openai" ? apiKey : "");
  const geminiApiKey = o.geminiApiKey ?? (provider === "gemini" ? apiKey : "");

  return {
    settings: {
      provider,
      savedProvider: provider,
      apiKey,
      openaiApiKey,
      geminiApiKey,
      model,
      savedModel: model,
      enabledTools: {},
      savedRealtimeVoice: o.savedRealtimeVoice ?? "marin",
      savedTurnDetection: DEFAULT_TURN_DETECTION,
    } as unknown as UseSettingsReturn,
    display: {
      showTimestamps: false,
      showHelpLinks: false,
      showTokenUsage: false,
      setShowTimestamps: vi.fn(),
      setShowHelpLinks: vi.fn(),
      setShowTokenUsage: vi.fn(),
    },
    viewState: {
      historyPanelOpen: false,
      settingsOpen: false,
      settingsTab: "connection",
    },
    setViewState: vi.fn(),
    mcpStatus: "connected",
    totalToolsCount: 2,
    enabledToolsCount: 2,
    onOpenSettings: o.onOpenSettings ?? vi.fn(),
    onOpenToolsSettings: vi.fn(),
    onOpenConnectionSettings: vi.fn(),
    onForeignRecord: vi.fn(),
    clearViewingMode: vi.fn(),
    setModeContext: vi.fn(),
  } as unknown as VoiceAppProps;
}

export interface VoiceSessionStub {
  status: "idle" | "connecting" | "connected" | "disconnecting" | "error";
  error: string | null;
  history: RealtimeItem[];
  isMuted: boolean;
  assistantSpeaking: boolean;
  assistantThinking: boolean;
  rateLimitedUntil: number | null;
  autoRetryExhausted: boolean;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  toggleMute: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  retryResponse: ReturnType<typeof vi.fn>;
  resetHistory: ReturnType<typeof vi.fn>;
  activeVoice: string | null;
}

/**
 * Build a useVoiceSession return-value stub for VoiceApp tests.
 * @param overrides - Per-test field overrides (e.g. status, history)
 * @returns A VoiceSessionStub with idle defaults
 */
export function baseSession(
  overrides: Partial<VoiceSessionStub> = {},
): VoiceSessionStub {
  return {
    status: "idle",
    error: null,
    history: [],
    isMuted: false,
    assistantSpeaking: false,
    assistantThinking: false,
    rateLimitedUntil: null,
    autoRetryExhausted: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    toggleMute: vi.fn(),
    interrupt: vi.fn(),
    retryResponse: vi.fn(),
    resetHistory: vi.fn(),
    activeVoice: null,
    ...overrides,
  };
}

export interface PersistenceStub {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeRecordModel: string | null;
  activeRecordProvider: string | null;
  savedItems: RealtimeItem[];
  retainPriorHistory: ReturnType<typeof vi.fn>;
  refreshList: ReturnType<typeof vi.fn>;
  switchConversation: ReturnType<typeof vi.fn>;
  startNewConversation: ReturnType<typeof vi.fn>;
  deleteConversation: ReturnType<typeof vi.fn>;
  deleteAllConversations: ReturnType<typeof vi.fn>;
  deleteUnbookmarkedConversations: ReturnType<typeof vi.fn>;
  renameConversation: ReturnType<typeof vi.fn>;
  toggleBookmark: ReturnType<typeof vi.fn>;
}

/**
 * Build a useVoicePersistence return-value stub for VoiceApp tests.
 * @param overrides - Per-test field overrides (e.g. conversations, activeConversationId)
 * @returns A PersistenceStub with empty defaults
 */
export function basePersistence(
  overrides: Partial<PersistenceStub> = {},
): PersistenceStub {
  return {
    conversations: [],
    activeConversationId: null,
    activeRecordModel: null,
    activeRecordProvider: null,
    savedItems: [],
    retainPriorHistory: vi.fn(),
    refreshList: vi.fn(),
    switchConversation: vi.fn(),
    startNewConversation: vi.fn(),
    deleteConversation: vi.fn(),
    deleteAllConversations: vi.fn(),
    deleteUnbookmarkedConversations: vi.fn(),
    renameConversation: vi.fn(),
    toggleBookmark: vi.fn(),
    ...overrides,
  };
}
