// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isNotation, type Notation } from "#src/shared/notation";
import { DEFAULT_MAX_TOOL_STEPS } from "#webui/chat/sdk/step-budget";
import {
  type ChatAdapter,
  type ChatClient,
  type MessageOverrides,
  type PendingForkRef,
  type RateLimitState,
} from "#webui/hooks/chat/use-chat-types";
import { resolveSystemInstruction } from "#webui/lib/config";
import { type UIMessage } from "#webui/types/messages";
import { type Provider } from "#webui/types/settings";

/**
 * Generic streaming handler for chat messages.
 * Returns true if completed successfully, false if aborted.
 * @param {AsyncIterable<TMessage[]>} stream - Stream of message arrays
 * @param {(history: TMessage[]) => UIMessage[]} formatter - Function to format messages
 * @param {(messages: UIMessage[]) => void} onUpdate - Callback for message updates
 * @returns {any} - Hook return value
 */
export async function handleMessageStream<TMessage>(
  stream: AsyncIterable<TMessage[]>,
  formatter: (history: TMessage[]) => UIMessage[],
  onUpdate: (messages: UIMessage[]) => void,
): Promise<boolean> {
  try {
    for await (const chatHistory of stream) {
      onUpdate(formatter(chatHistory));
    }

    return true;
  } catch (error) {
    // Abort errors are expected when user cancels - don't treat as error
    if (error instanceof Error && error.name === "AbortError") {
      return false;
    }

    throw error;
  }
}

/**
 * Validates MCP connection status and throws if there's an error.
 * Auto-retries connection if it failed.
 * @param {"connected" | "connecting" | "error"} mcpStatus - MCP connection status
 * @param {string | null} mcpError - MCP error message if any
 * @param {() => Promise<void>} checkMcpConnection - Callback to retry connection
 * @returns {any} - Hook return value
 */
export async function validateMcpConnection(
  mcpStatus: "connected" | "connecting" | "error",
  mcpError: string | null,
  checkMcpConnection: () => Promise<void>,
): Promise<void> {
  if (mcpStatus === "error") {
    await checkMcpConnection();
    throw new Error(`MCP connection failed: ${mcpError}`);
  }
}

/**
 * Connect a freshly built client, publishing the in-flight connect so a turn
 * that adopts the client can await it rather than stream on a client whose MCP
 * connection hasn't landed. The connecting turn owns the ref: it clears the
 * promise once it settles, unless a newer init already replaced it.
 * @param client - The client to connect
 * @param pendingInitRef - Where to publish the in-flight connect
 * @param pendingInitRef.current - The published promise, or null when idle
 */
export async function connectClient<TMessage>(
  client: ChatClient<TMessage>,
  pendingInitRef: { current: Promise<void> | null },
): Promise<void> {
  const connecting = client.initialize();

  pendingInitRef.current = connecting;

  try {
    await connecting;
  } finally {
    if (pendingInitRef.current === connecting) pendingInitRef.current = null;
  }
}

interface ConversationDefaults {
  thinking: string | null;
}

/**
 * Filter per-message overrides to only include fields that differ from
 * conversation defaults. Returns undefined if no fields differ.
 * @param overrides - Raw overrides from the UI (always populated)
 * @param defaults - Conversation-locked defaults
 * @returns Filtered overrides, or undefined if nothing differs
 */
export function filterOverrides(
  overrides: MessageOverrides | undefined,
  defaults: ConversationDefaults,
): MessageOverrides | undefined {
  if (!overrides) return undefined;

  if (overrides.thinking != null && overrides.thinking !== defaults.thinking) {
    return { thinking: overrides.thinking };
  }

  return undefined;
}

/**
 * Show error when API key is not configured, against the conversation the
 * message was sent from. With no client yet, the message is stashed onto that
 * conversation so retry/edit — and the next send, which bootstraps a client from
 * the stash — pick up where the user left off.
 * @param adapter - Chat adapter for formatting
 * @param userMessage - The user's message text
 * @param setMessages - State setter for messages
 * @param clientRef - Ref to the live chat client, or null before one is built
 * @param clientRef.current - The live client, whose history wins when it exists
 * @param pendingHistoryRef - Ref holding the restored-but-not-yet-sent history
 * @param pendingHistoryRef.current - That history, extended by this function
 */
export function showMissingApiKeyError<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(
  adapter: ChatAdapter<TClient, TMessage, TConfig>,
  userMessage: string,
  setMessages: (msgs: UIMessage[]) => void,
  clientRef: { current: TClient | null },
  pendingHistoryRef: { current: TMessage[] | null },
): void {
  const entry = adapter.createUserMessage(userMessage);
  // Keep the conversation this message was sent from. Showing (and stashing)
  // the message alone truncated a restored conversation to it, and the next
  // send bootstrapped a client from that truncation and saved it over the
  // record. Copy the base: createErrorMessage pushes onto the array it is
  // given, and nothing was sent, so the live client's history must not grow.
  const base =
    clientRef.current?.chatHistory ?? pendingHistoryRef.current ?? [];
  const history = [...base, entry];

  // Only when no client exists: a client owns the history once it has one, so
  // the stash would be a stale duplicate. The error rides along, as in
  // recoverFromChatError — it is skipped when building model messages.
  if (!clientRef.current) pendingHistoryRef.current = history;

  setMessages(
    adapter.createErrorMessage(
      new Error("No API key configured. Please add your API key in Settings."),
      history,
    ),
  );
}

/** Dependencies for {@link recoverFromChatError}. */
export interface RecoverFromChatErrorArgs<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  error: unknown;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  clientRef: { current: TClient | null };
  pendingHistoryRef: { current: TMessage[] | null };
  /** The user message stashed before this turn, or null (fork passes none). */
  stashed: TMessage | null;
  setMessages: (msgs: UIMessage[]) => void;
  autoSaveRef?: { current: (() => void) | null };
  pendingForkRef?: PendingForkRef;
}

/**
 * Render a chat turn failure and recover transient state. Surfaces the error in
 * the message list (against the live client history, or the restored-but-not-
 * yet-sent history when init threw before a client existed), stashes a user
 * message that never reached the client for retry/edit, autosaves when a client
 * exists, and otherwise drops any pending-fork signal so it can't linger and
 * mis-branch a later, unrelated save.
 *
 * @param args - Error and the chat refs/adapter needed to recover
 */
export function recoverFromChatError<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(args: RecoverFromChatErrorArgs<TClient, TMessage, TConfig>): void {
  const {
    error,
    adapter,
    clientRef,
    pendingHistoryRef,
    stashed,
    setMessages,
    autoSaveRef,
    pendingForkRef,
  } = args;

  // Fall back to the restored-but-not-yet-sent history when no client was built
  // (init threw early, e.g. MCP down) so a failed fork/send renders the existing
  // conversation instead of an empty view. Copy it — createErrorMessage mutates
  // the array, and a failed fork (which stashes nothing) must leave
  // pendingHistoryRef untouched for a later send to bootstrap from.
  const baseHistory =
    clientRef.current?.chatHistory ??
    (pendingHistoryRef.current ? [...pendingHistoryRef.current] : []);
  // When init fails before client.sendMessage, the user message never reached
  // chatHistory. Surface it in the error UI and stash it for retry/edit so the
  // user isn't stranded if there's no usable client.
  const includeStashed = stashed && !baseHistory.includes(stashed);
  const errorHistory = includeStashed ? [...baseHistory, stashed] : baseHistory;

  if (!clientRef.current && includeStashed) {
    // Keep the conversation the message was sent from. Stashing the message
    // alone truncated a restored conversation to it, and the autosave that
    // follows the failed turn wrote that truncation over the saved record.
    // errorHistory picks up the error below, matching what the client branch
    // persists.
    pendingHistoryRef.current = errorHistory;
  }

  setMessages(adapter.createErrorMessage(error, errorHistory));

  if (clientRef.current) {
    // The includeStashed path built errorHistory as a fresh array
    // ([...chatHistory, stashedUserMessage]) and createErrorMessage then
    // appended the error to it. This is the init-failure case: the client exists
    // but sendMessage never ran, so its chatHistory is still empty and has
    // neither the user message nor the error. Assign the whole array — pushing
    // only the error (the previous behavior) persisted the error without the
    // user message that prompted it, so a reload showed a dangling error.
    // Reassigning is safe: sendMessage and compact() read chatHistory fresh.
    if (errorHistory !== clientRef.current.chatHistory) {
      clientRef.current.chatHistory = errorHistory;
    }

    autoSaveRef?.current?.();
  } else if (pendingForkRef) {
    // No client means init threw before one was built (e.g. MCP down), so the
    // recovery autosave above — the only consumer of a pending fork signal —
    // never runs. Drop the signal here or it lingers and mis-branches the next,
    // unrelated save into a spurious sibling.
    pendingForkRef.current = null;
  }
}

interface RunChatTurnDeps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  clientRef: { current: TClient | null };
  pendingHistoryRef: { current: TMessage[] | null };
  abortControllerRef: { current: AbortController | null };
  autoSaveRef?: { current: (() => void) | null };
  pendingForkRef?: PendingForkRef;
  /** Ticket dispenser: bumped per turn, so a late turn knows it was superseded. */
  turnIdRef: { current: number };
  /** Bumped when the loaded conversation is torn down (switch, new chat). */
  conversationGenRef: { current: number };
  pendingUserMessageRef: { current: TMessage | null };
  setMessages: (msgs: UIMessage[]) => void;
  setIsAssistantResponding: (responding: boolean) => void;
  setToolLimitReached: (reached: boolean) => void;
  setRateLimitState: (state: RateLimitState | null) => void;
}

/**
 * Run one chat turn, owning the state shared across turns: the responding flag,
 * the abort controller, the rate-limit notice, the tool-limit notice, and the
 * user message stashed for retry/edit.
 *
 * Turns can OVERLAP. Stop re-enables the composer immediately, but the stopped
 * turn keeps unwinding — its stream waits on any subagent still finishing an MCP
 * call, which takes no abort signal — so a send inside that window starts the
 * next turn while the old one is still settling. Each turn therefore takes a
 * ticket on the way in and only touches the shared state while it still holds
 * the current one. Without that, the late turn nulls the new turn's abort
 * controller (its Stop then silently no-ops), clears its responding flag
 * mid-stream, and drops its retry stash.
 *
 * The ticket is dispensed HERE and handed to `fn` as `stillCurrent`, so the
 * turn's own setup (client init, then streaming) is measured against the ticket
 * it started with. Reading the dispenser again later would hand a superseded
 * turn the NEWER turn's ticket, making its guard vacuously true.
 *
 * @param fn - The turn to run; receives this turn's currency check
 * @param userMessage - Message to stash for retry/edit, if this turn sends one
 * @param deps - Adapter, the chat refs, and the per-turn state setters
 * @returns What the turn returned, or undefined when it failed
 */
export async function runChatTurn<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
  T,
>(
  fn: (stillCurrent: () => boolean) => Promise<T>,
  userMessage: TMessage | undefined,
  deps: RunChatTurnDeps<TClient, TMessage, TConfig>,
): Promise<T | undefined> {
  const { turnIdRef, conversationGenRef, pendingUserMessageRef } = deps;
  const turnId = ++turnIdRef.current;
  const stillCurrent = () => turnId === turnIdRef.current;
  const conversationGen = conversationGenRef.current;

  deps.setIsAssistantResponding(true);
  // A new request clears any prior tool-limit notice before streaming.
  deps.setToolLimitReached(false);
  pendingUserMessageRef.current = userMessage ?? null;

  try {
    const result = await fn(stillCurrent);

    if (stillCurrent()) {
      pendingUserMessageRef.current = null;
      deps.setToolLimitReached(
        deps.clientRef.current?.toolLimitReached ?? false,
      );
    }

    return result;
  } catch (error) {
    // Reachable while superseded when the failure comes from the turn's SETUP
    // rather than its stream — a client init that was still connecting when the
    // user stopped and re-sent. recoverFromChatError renders the error, can
    // reassign the shared client's chatHistory, and autosaves, so a stale one
    // would corrupt the turn now streaming.
    if (!stillCurrent()) return undefined;

    // The user switched conversations while this turn's setup was in flight.
    // Recovery reads the shared refs, which now hold the conversation they
    // switched TO, so it would render this turn's stray message and error there
    // — and the autosave that follows would persist them under it. A switch
    // sends nothing, so it never bumps the ticket above; this check is what
    // stops it.
    if (conversationGen !== conversationGenRef.current) return undefined;

    recoverFromChatError({
      ...deps,
      error,
      stashed: pendingUserMessageRef.current,
    });

    return undefined;
  } finally {
    if (stillCurrent()) {
      pendingUserMessageRef.current = null;
      deps.abortControllerRef.current = null;
      deps.setIsAssistantResponding(false);
      deps.setRateLimitState(null);
    }
  }
}

/**
 * Take the turn's abort controller and its liveness check, BEFORE the turn's
 * setup rather than after it.
 *
 * Installing the controller up front is what makes Stop reach a turn parked in
 * its MCP connect. Install it after the connect instead and a stopped turn wakes
 * with nothing aborted, builds a fresh controller and streams as if Stop never
 * happened — tokens spent and tool calls run against the Live Set while the
 * composer reads idle. The ticket can't cover that on its own: Stop with no
 * follow-up send never bumps it, and neither does a conversation switch.
 *
 * `stillLive` is the check every resume point wants — not superseded by a newer
 * turn AND not stopped — as opposed to the ticket-only `stillCurrent`, which
 * still guards the paths where a stopped turn should finish what it was doing
 * (rendering and persisting its own failure, say).
 *
 * @param abortControllerRef - Shared ref the newest turn's controller lives in
 * @param abortControllerRef.current - The installed controller, or null when idle
 * @param stillCurrent - This turn's ticket check from runChatTurn
 * @returns The turn's controller and its liveness check
 */
export function beginTurn(
  abortControllerRef: { current: AbortController | null },
  stillCurrent: () => boolean,
): { controller: AbortController; stillLive: () => boolean } {
  const controller = new AbortController();

  abortControllerRef.current = controller;

  return {
    controller,
    stillLive: () => stillCurrent() && !controller.signal.aborted,
  };
}

/** Effective connection used to (re)build a chat client at init time. */
export interface InitConnection {
  provider: Provider;
  model: string;
  apiKey: string;
  extraParams: Record<string, unknown>;
  /** The resolved system instruction to lock and send for this init. */
  systemInstruction: string;
  /**
   * The notation to lock and send for this init, or null when the caller has no
   * notation of its own (voice mode, tests) and the request should fall through
   * to the device global.
   */
  notation: Notation | null;
  /** The small-model mode to lock and send for this init. */
  smallModelMode: boolean;
  /** The toolset to lock and connect with for this init. */
  enabledTools: Record<string, boolean>;
  /** The per-turn tool-step budget to lock for this init. */
  maxToolSteps: number;
}

/**
 * Resolve the provider/model/connection to (re)build a client with.
 *
 * Honors the conversation's locked provider+model when continuing a restored
 * conversation (locked values are non-null), falling back to current settings
 * for a brand-new conversation. The key + base URL always come from the user's
 * *current* settings for the effective provider — no API key is ever persisted
 * with the conversation.
 *
 * A restored conversation also carries its locked system instruction through as
 * `lockedSystemInstruction`, so the adapter sends what the conversation started
 * with rather than the current global override. Null (brand-new conversation)
 * lets the adapter fall back to resolving the current override. Its locked
 * notation and small-model mode ride along the same way, as `lockedNotation` and
 * `lockedSmallModelMode`.
 *
 * The toolset resolves the same way but NOT through `extraParams` — no adapter
 * reads it; it is passed to the client builder directly.
 *
 * @param locked - Conversation's locked provider/model/system-instruction/notation/small-model mode/toolset (null fields if unset)
 * @param locked.activeProvider - Locked provider, or null when not locked
 * @param locked.activeModel - Locked model, or null when not locked
 * @param locked.activeSystemInstruction - Locked system instruction, or null when not locked
 * @param locked.activeNotation - Locked notation, or null when not locked
 * @param locked.activeSmallModelMode - Locked small-model mode, or null when not locked
 * @param locked.activeEnabledTools - Locked toolset, or null when not locked
 * @param fallback - Current-settings provider/model/toolset (used when not locked)
 * @param fallback.provider - Current-settings provider
 * @param fallback.model - Current-settings model
 * @param fallback.enabledTools - Current-settings toolset
 * @param resolveConnection - Resolves a provider's current key + base URL
 * @param extraParams - Base extra params to merge the connection into
 * @returns Effective provider, model, key, toolset, and merged extra params
 */
export function resolveInitConnection(
  locked: {
    activeProvider: Provider | null;
    activeModel: string | null;
    activeSystemInstruction: string | null;
    activeNotation: Notation | null;
    activeSmallModelMode: boolean | null;
    activeEnabledTools: Record<string, boolean> | null;
  },
  fallback: {
    provider: Provider;
    model: string;
    enabledTools: Record<string, boolean>;
  },
  resolveConnection: (provider: Provider) => {
    apiKey: string;
    baseUrl?: string;
  },
  extraParams?: Record<string, unknown>,
): InitConnection {
  const provider = locked.activeProvider ?? fallback.provider;
  const model = locked.activeModel ?? fallback.model;
  const { apiKey, baseUrl } = resolveConnection(provider);
  const mergedExtraParams = {
    ...extraParams,
    provider,
    apiKey,
    baseUrl,
    lockedSystemInstruction: locked.activeSystemInstruction,
    lockedNotation: locked.activeNotation,
    lockedSmallModelMode: locked.activeSmallModelMode,
  };

  return {
    provider,
    model,
    apiKey,
    extraParams: mergedExtraParams,
    systemInstruction: resolveLockedSystemInstruction(mergedExtraParams),
    notation: resolveLockedNotation(mergedExtraParams),
    smallModelMode: resolveLockedSmallModelMode(mergedExtraParams),
    enabledTools: locked.activeEnabledTools ?? fallback.enabledTools,
    maxToolSteps: resolveMaxToolSteps(mergedExtraParams),
  };
}

/**
 * The per-turn tool-step budget for an init. Unlike the other locked values
 * there is no saved snapshot to prefer: the budget doesn't change what the model
 * is told, only how long a turn runs, so a restored conversation takes whatever
 * is set now. It is still pinned once the client exists — client.maxSteps is
 * derived in initialize() — which is what the settings notice reports.
 *
 * @param extraParams - The init's extra params
 * @returns The effective step budget
 */
export function resolveMaxToolSteps(
  extraParams: Record<string, unknown>,
): number {
  return (
    (extraParams.maxToolSteps as number | undefined) ?? DEFAULT_MAX_TOOL_STEPS
  );
}

/**
 * The system instruction to lock for an init: the conversation's locked snapshot
 * when continuing a restored chat, else the resolved current override for a
 * brand-new one. Mirrors the adapter's resolution so the locked value equals
 * what was sent.
 * @param extraParams - The init's extra params (locked snapshot + current override)
 * @returns The effective system instruction to lock and send
 */
export function resolveLockedSystemInstruction(
  extraParams: Record<string, unknown>,
): string {
  return (
    (extraParams.lockedSystemInstruction as string | null) ??
    resolveSystemInstruction(
      extraParams.systemInstructionOverride as string | undefined,
    )
  );
}

/**
 * The notation to lock and send for an init: the conversation's locked snapshot
 * when continuing a restored chat, else the caller's current notation for a
 * brand-new one. Mirrors the adapter's resolution so the locked value equals
 * what was sent. Null when neither is present — a caller with no notation of its
 * own (voice mode, tests) sends no header and gets the device global, the same
 * contract external MCP clients have.
 * @param extraParams - The init's extra params (locked snapshot + current setting)
 * @returns The effective notation, or null to fall through to the device global
 */
export function resolveLockedNotation(
  extraParams: Record<string, unknown>,
): Notation | null {
  const locked = extraParams.lockedNotation;

  if (isNotation(locked)) return locked;

  return isNotation(extraParams.notation) ? extraParams.notation : null;
}

/**
 * The small-model mode to lock and send for an init: the conversation's locked
 * snapshot when continuing a restored chat, else the current setting for a
 * brand-new one. Mirrors the adapter's resolution so the locked value equals
 * what was sent — the tool schemas and skills variant a restored conversation
 * gets must not flip when the Settings toggle moves under it.
 * @param extraParams - The init's extra params (locked snapshot + current setting)
 * @returns The effective small-model mode
 */
export function resolveLockedSmallModelMode(
  extraParams: Record<string, unknown>,
): boolean {
  const locked = extraParams.lockedSmallModelMode;

  if (typeof locked === "boolean") return locked;

  return Boolean(extraParams.smallModelMode);
}
