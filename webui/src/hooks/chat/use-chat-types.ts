// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation } from "#src/shared/notation";
import { type QueuedMessage } from "#webui/hooks/chat/use-message-queue";
import { type UIMessage } from "#webui/types/messages";
import { type Provider } from "#webui/types/settings";

/** Per-message overrides for thinking */
export interface MessageOverrides {
  thinking?: string;
}

/** Chat client interface that all providers must implement */
export interface ChatClient<TMessage> {
  chatHistory: TMessage[];
  /**
   * True when the last stream stopped because it hit the tool-call step limit
   * while the model still wanted to call more tools. Optional: clients that do
   * not support multi-step tool calling may omit it.
   */
  toolLimitReached?: boolean;
  initialize: () => Promise<void>;
  sendMessage: (
    message: string,
    signal: AbortSignal,
    overrides?: MessageOverrides,
    shouldInterrupt?: () => boolean,
  ) => AsyncIterable<TMessage[]>;
  /**
   * Re-stream the current turn after a rate limit WITHOUT re-sending the user's
   * message, which is already in chatHistory. The client owns whether the resume
   * needs a synthetic user turn to be a valid request — that depends on the wire
   * shape, which only it knows.
   */
  resumeStream: (
    signal: AbortSignal,
    overrides?: MessageOverrides,
    shouldInterrupt?: () => boolean,
  ) => AsyncIterable<TMessage[]>;
  /**
   * Summarize a slice of history into a compaction summary string. Optional:
   * clients that don't support compaction may omit it.
   */
  summarize?: (history: TMessage[]) => Promise<string>;
  /**
   * Release any resources held by the client (e.g. an open MCP connection).
   * Called by useChat whenever the client is discarded. Optional and must be
   * idempotent: clients that hold no resources may omit it.
   */
  dispose?: () => void;
}

/**
 * Provider-specific adapter interface
 */
export interface ChatAdapter<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  /** Create a new client instance */
  createClient: (apiKey: string, config: TConfig) => TClient;

  /** Build provider-specific configuration */
  buildConfig: (
    model: string,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: TMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ) => TConfig;

  /** Format messages for UI display */
  formatMessages: (messages: TMessage[]) => UIMessage[];

  /** Create error message in provider's format */
  createErrorMessage: (error: unknown, chatHistory: TMessage[]) => UIMessage[];

  /** Extract user message text from a message for retry */
  extractUserMessage: (message: TMessage) => string | undefined;

  /** Create initial user message for error display */
  createUserMessage: (text: string) => TMessage;

  /** Create a synthetic compaction summary message */
  createCompactionSummary: (summary: string) => TMessage;
}

/** Model/provider/behavior settings persisted with a conversation */
export interface ConversationLockedSettings {
  model: string | null;
  provider: Provider | null;
  thinking: string | null;
  smallModelMode: boolean | null;
  /**
   * The resolved system instruction the conversation runs with. Locked like the
   * other settings so continuing a restored chat keeps sending what it started
   * with, even after the global override changes. Null for legacy records.
   */
  systemInstruction: string | null;
  /**
   * The notation the conversation runs with, sent per-request so it is this
   * chat's notation rather than the device global. Hard-locked like the system
   * instruction rather than re-read per init: notation decides how clip notes are
   * PARSED, so a transcript written in one notation must keep being read in it —
   * swapping mid-conversation would hand the model note strings it was never
   * taught. Null for legacy records and for a chat that has yet to lock one.
   */
  notation: Notation | null;
  /**
   * The tool selection the conversation last connected with. Reported, not
   * enforced: continuing a restored chat reconnects with whatever is enabled
   * now, because a tool the user just turned on to keep working on an old
   * conversation has to be reachable. Kept so the settings notice can say the
   * toolset moved. Null for legacy records.
   */
  enabledTools: Record<string, boolean> | null;
}

/**
 * Signal that the next conversation save should branch (fork) into a new record
 * instead of overwriting the active one. Set by the fork action right before it
 * streams the new turn, and consumed by the conversation save. Lives in a ref
 * shared across hooks because the fork action (in useChat) and the save (in
 * useConversations) are otherwise decoupled.
 */
export interface PendingFork {
  /** UI message index the fork diverges at (where the ‹ n/m › arrows anchor). */
  anchorIndex: number;
}

/** Mutable ref carrying the pending-fork signal (null when no fork is pending). */
export type PendingForkRef = { current: PendingFork | null };

/** Rate limit retry state for UI display */
export interface RateLimitState {
  isRetrying: boolean;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

export interface UseChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeSmallModelMode: boolean | null;
  /** The resolved system instruction locked for the active conversation. */
  activeSystemInstruction: string | null;
  /** The notation locked for the active conversation. */
  activeNotation: Notation | null;
  /** The tool selection the active conversation last connected with. */
  activeEnabledTools: Record<string, boolean> | null;
  rateLimitState: RateLimitState | null;
  queuedMessages: QueuedMessage[];
  enqueueMessage: (text: string, overrides?: MessageOverrides) => void;
  removeMessage: (id: number) => void;
  /** True when the last response stopped at the tool-call step limit */
  toolLimitReached: boolean;
  /** True while a compaction summary is being generated */
  isCompacting: boolean;
  /** True when the most recent compaction can still be undone (in-memory) */
  canUndoCompaction: boolean;
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  handleEdit: (mergedMessageIndex: number, newMessage: string) => Promise<void>;
  /**
   * Compact the conversation: summarize the full visible history into a single
   * appended summary marker. Prior turns stay visible but drop out of the model
   * payload. The index only validates the trigger (the gating UI message), not a
   * cut point.
   */
  compact: (mergedMessageIndex: number) => Promise<void>;
  /** Restore the pre-compaction history (while still available) */
  undoCompaction: () => void;
  clearConversation: () => void;
  stopResponse: () => void;
  getChatHistory: () => unknown[];
  restoreChatHistory: (
    chatHistory: unknown[],
    lockedSettings?: ConversationLockedSettings,
  ) => void;
}

export interface UseChatProps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  provider: Provider;
  apiKey: string;
  model: string;
  thinking: string;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  smallModelMode: boolean;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  /**
   * Resolve the connection (key + base URL) for a given provider from the
   * user's *current* settings. Used at client-init time so a restored
   * conversation locked to provider X reconnects with the current X credentials,
   * rather than the currently-selected provider's. Returns the same values as
   * the top-level `apiKey`/`extraParams.baseUrl` when asked for the active
   * provider, so new conversations are unaffected.
   */
  resolveConnection: (provider: Provider) => {
    apiKey: string;
    baseUrl?: string;
  };
  extraParams?: Record<string, unknown>;
  autoSaveRef?: { current: (() => void) | null };
  /** Shared signal set when an edit/retry should branch the conversation. */
  pendingForkRef?: PendingForkRef;
}
