// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { vi } from "vitest";
import { type VoiceAppProps } from "#webui/components/voice/VoiceApp";
import { type ConversationSummary } from "#webui/lib/conversation-db";
import { type UseSettingsReturn } from "#webui/types/settings";

export interface PropOverrides {
  apiKey?: string;
  provider?: "openai" | "anthropic";
  onOpenSettings?: () => void;
  savedRealtimeVoice?: string;
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

  return {
    settings: {
      provider,
      savedProvider: provider,
      apiKey,
      model: "gpt-realtime-2",
      savedModel: "gpt-realtime-2",
      enabledTools: {},
      savedRealtimeVoice: o.savedRealtimeVoice ?? "marin",
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
  savedItems: RealtimeItem[];
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
    savedItems: [],
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
