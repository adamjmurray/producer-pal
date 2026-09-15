// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { recoverFromChatError } from "#webui/hooks/chat/helpers/streaming/chat-error-recovery";
import {
  type ChatAdapter,
  type ChatClient,
  type PendingForkRef,
  type RateLimitState,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

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
    if (!stillCurrent()) {
      return undefined;
    }

    // The user switched conversations while this turn's setup was in flight.
    // Recovery reads the shared refs, which now hold the conversation they
    // switched TO, so it would render this turn's stray message and error there
    // — and the autosave that follows would persist them under it. A switch
    // sends nothing, so it never bumps the ticket above; this check is what
    // stops it.
    if (conversationGen !== conversationGenRef.current) {
      return undefined;
    }

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
