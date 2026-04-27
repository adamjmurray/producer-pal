// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef } from "preact/hooks";
import {
  type ChatAdapter,
  type ChatClient,
  type RateLimitState,
} from "#webui/hooks/chat/use-chat-types";
import {
  calculateRetryDelay,
  detectRateLimit,
  MAX_RETRY_ATTEMPTS,
  shouldRetry,
} from "#webui/lib/rate-limit";
import { type UIMessage } from "#webui/types/messages";
import { handleMessageStream } from "./streaming-helpers";

interface UseExecuteWithRetryDeps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  autoSaveRef?: { current: (() => void) | null };
  abortControllerRef: { current: AbortController | null };
  setMessages: (messages: UIMessage[]) => void;
  setRateLimitState: (state: RateLimitState | null) => void;
}

interface ExecuteWithRetryArgs<TMessage> {
  executeStream: (message: string) => AsyncIterable<TMessage[]>;
  getHistory: () => TMessage[];
  originalMessage: string;
}

/**
 * Hook that wraps a streaming chat call with rate-limit-aware retry logic.
 * Owns the retry AbortController and exposes a way to cancel pending retries.
 * @param deps - Adapter, autoSave ref, parent abort ref, and state setters
 * @returns executeWithRetry function and abortRetry canceler
 */
export function useExecuteWithRetry<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(deps: UseExecuteWithRetryDeps<TClient, TMessage, TConfig>) {
  const { adapter, autoSaveRef, abortControllerRef } = deps;
  const { setMessages, setRateLimitState } = deps;
  const retryAbortRef = useRef<AbortController | null>(null);

  const abortRetry = useCallback(() => {
    retryAbortRef.current?.abort();
  }, []);

  const executeWithRetry = useCallback(
    async ({
      executeStream,
      getHistory,
      originalMessage,
    }: ExecuteWithRetryArgs<TMessage>): Promise<boolean> => {
      let attempt = 0;
      const contentState = {
        hasAssistantContent: false,
        savedUsageCount: 0,
      };

      retryAbortRef.current = new AbortController();

      const onMessageUpdate = (msgs: UIMessage[]) => {
        // Skip updates after abort (e.g. user switched conversations)
        if (abortControllerRef.current?.signal.aborted) return;

        const hadAssistant = contentState.hasAssistantContent;

        if (!hadAssistant && hasAssistantContent(msgs)) {
          contentState.hasAssistantContent = true;
        }

        setMessages(msgs);

        // Save on first assistant content or when a new step completes
        const usageCount = msgs.filter((m) => m.usage).length;
        const becameNonEmpty =
          !hadAssistant && contentState.hasAssistantContent;

        if (becameNonEmpty || usageCount > contentState.savedUsageCount) {
          contentState.savedUsageCount = usageCount;
          autoSaveRef?.current?.();
        }
      };

      while (shouldRetry(attempt)) {
        try {
          const msg = contentState.hasAssistantContent
            ? "continue"
            : originalMessage;

          await handleMessageStream(
            executeStream(msg),
            adapter.formatMessages,
            onMessageUpdate,
          );
          setRateLimitState(null);

          return true;
        } catch (error) {
          if (retryAbortRef.current.signal.aborted) return false;

          const rateLimitInfo = detectRateLimit(error);

          if (!rateLimitInfo.isRateLimited || !shouldRetry(attempt + 1)) {
            setMessages(adapter.createErrorMessage(error, getHistory()));
            setRateLimitState(null);
            autoSaveRef?.current?.();

            return false;
          }

          const delayMs = calculateRetryDelay(
            attempt,
            rateLimitInfo.retryAfterMs,
          );

          setRateLimitState({
            isRetrying: true,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            delayMs,
          });

          // Wait before retrying
          await new Promise<void>((resolve, reject) => {
            const signal = retryAbortRef.current?.signal;
            const timer: { id: ReturnType<typeof setTimeout> | null } = {
              id: null,
            };

            const onAbort = () => {
              if (timer.id != null) clearTimeout(timer.id);
              reject(new Error("Retry cancelled"));
            };

            timer.id = setTimeout(() => {
              signal?.removeEventListener("abort", onAbort);
              resolve();
            }, delayMs);
            signal?.addEventListener("abort", onAbort, { once: true });
          });
          attempt++;
        }
      }

      return false;
    },
    [adapter, autoSaveRef, abortControllerRef, setMessages, setRateLimitState],
  );

  return { executeWithRetry, abortRetry };
}

/**
 * Detect whether the formatted UI history contains real assistant output
 * (text, reasoning, or tool activity). Used to decide whether a 429 retry
 * should resume with "continue" or replay the original message — the user
 * echo alone must not count as content.
 * @param msgs - Formatted UI messages
 * @returns True if any model message has substantive content
 */
function hasAssistantContent(msgs: UIMessage[]): boolean {
  return msgs.some(
    (m) =>
      m.role === "model" &&
      m.parts.some(
        (p) => p.type === "text" || p.type === "thought" || p.type === "tool",
      ),
  );
}
