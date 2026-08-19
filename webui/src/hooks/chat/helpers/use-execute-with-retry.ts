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
import { abortableSleep } from "#webui/lib/utils/abortable-sleep";
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
  /** Runs the turn's FIRST attempt, sending the user's message. */
  executeStream: () => AsyncIterable<TMessage[]>;
  /**
   * Re-runs the turn after a rate limit, resuming from history rather than
   * re-sending the message — which is already in it. Whether the resume needs a
   * synthetic "continue" turn to be a valid request is the client's call.
   */
  resumeStream: () => AsyncIterable<TMessage[]>;
  getHistory: () => TMessage[];
  /**
   * Whether the turn that started this still holds the current ticket —
   * runChatTurn dispenses it and hands it down through the turn's setup.
   *
   * Stop re-enables the composer while the stopped turn is still unwinding, so a
   * newer turn can take the shared refs below — the abort controller AND
   * retryAbortRef — out from under this one. Once that happens the
   * aborted-signal checks are reading the NEW turn's controllers and stop
   * protecting anything, so everything that paints or persists checks the ticket
   * instead.
   */
  stillCurrent: () => boolean;
  /**
   * Whether the turn is still current AND hasn't been stopped — beginTurn's
   * check, closed over this turn's own controller rather than the shared ref.
   *
   * Stop doesn't throw: the SDK answers an aborted signal by emitting an `abort`
   * part and closing the stream, so a stopped turn ends the loop below normally.
   * This is the only thing that tells the success return apart from a real
   * completion, and the caller drains its queued follow-ups on success.
   */
  stillLive: () => boolean;
}

/**
 * Hook that wraps a streaming chat call with rate-limit-aware retry logic.
 * Owns the retry AbortController and exposes a way to cancel pending retries.
 *
 * NOTE: subagent workers stream below this hook (inside the spawn tool's
 * execute), so they carry their own copy of this strategy in
 * chat/sdk/subagent/subagent-rate-limit.ts. A change to the budget or the delay
 * schedule has to be made in both. The resume rule is NOT duplicated — both
 * layers hand that to the client, which is the only place that knows whether the
 * conversation is already a valid request to resume from.
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
      resumeStream,
      getHistory,
      stillCurrent,
      stillLive,
    }: ExecuteWithRetryArgs<TMessage>): Promise<boolean> => {
      let attempt = 0;
      const contentState = {
        hasAssistantContent: false,
        savedUsageCount: 0,
      };

      retryAbortRef.current = new AbortController();

      const onMessageUpdate = (msgs: UIMessage[]) => {
        // Skip updates after abort (e.g. user switched conversations), and once
        // a newer turn owns the transcript.
        if (!stillCurrent() || abortControllerRef.current?.signal.aborted)
          return;

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
          // Only the first attempt sends the user's message. A retry resumes the
          // same turn from history, so the message is never replayed — replaying
          // it duplicated the instruction in the transcript AND on the wire,
          // since consecutive user turns are concatenated for the model.
          const completed = await handleMessageStream(
            attempt === 0 ? executeStream() : resumeStream(),
            adapter.formatMessages,
            onMessageUpdate,
          );

          setRateLimitState(null);

          // A stream that ends cleanly is not necessarily a turn that finished
          // — Stop closes it the same way. Both checks earn their keep: an abort
          // that races the read throws instead (false from handleMessageStream),
          // and one raised outside this turn's controller leaves stillLive true.
          return completed && stillLive();
        } catch (error) {
          // Checked before the abort signal, which by now may belong to the
          // newer turn: a superseded turn's failure is stale, and rendering it
          // would drop an error into the turn currently streaming (and autosave
          // it there).
          if (!stillCurrent()) return false;

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

          // Wait before retrying. Rejecting on abort is load-bearing: the
          // rejection propagates out of executeWithRetry so the canceled turn is
          // recorded as a failure upstream.
          await abortableSleep(
            delayMs,
            retryAbortRef.current.signal,
            "Retry cancelled",
          );
          // Clear the indicator now that the wait is over. If the next attempt
          // also rate-limits, the catch block above will re-set it. Without
          // this, the indicator stays visible during the entire retry response
          // (thinking, tool calls, streaming) until the stream fully completes.
          setRateLimitState(null);
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
 * (text, reasoning, or tool activity). Drives WHEN the first autosave fires: the
 * turn is persisted as soon as the model says something, rather than waiting for
 * the stream to finish. The user echo alone must not count — saving on it would
 * persist a turn with no response in it.
 *
 * It no longer has anything to do with retries. Choosing between resuming and
 * re-asking used to hinge on this, which was wrong twice over: it reads the whole
 * formatted history rather than this turn's output, so on any turn after the
 * first it was already true from the PREVIOUS turn's response. A retry now
 * resumes unconditionally — see resumeStream.
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
