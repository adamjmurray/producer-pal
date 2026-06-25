// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeSession } from "@openai/agents/realtime";
import { useCallback, useEffect } from "preact/hooks";
import { extractErrorMessage } from "#webui/hooks/voice/helpers/use-voice-session-helpers";

// Auto-retry timing. Fire a touch past the server-indicated wait (buffer), but
// never spin faster than the floor even when the server reports a sub-second
// wait (or none), so a rate-limit storm can't become a tight retry loop. The
// server's wait — which grows on repeated limits — is the primary throttle.
const AUTO_RETRY_SAFETY_BUFFER_MS = 300;
const AUTO_RETRY_MIN_DELAY_MS = 1000;
// Cap consecutive auto-retries so a persistent rate limit can't loop forever
// (the server's growing wait throttles the rate, but not the count). Resets on a
// successful response or a fresh connect; once hit, the manual "Retry now"
// button stays the escape hatch. Same value as the chat path's MAX_RETRY_ATTEMPTS
// but kept as a separate constant on purpose: the semantics differ (consecutive
// rate-limited responses here vs. per-operation retries there), so the two
// ceilings are free to diverge.
const MAX_AUTO_RETRY_ATTEMPTS = 5;

/** A mutable numeric ref (the consecutive-auto-retry counter). */
interface NumberRef {
  current: number;
}

export interface UseVoiceRetryDeps {
  sessionRef: { current: RealtimeSession | null };
  /** Epoch ms the current rate-limit clears, or null when not rate-limited. */
  rateLimitedUntil: number | null;
  setError: (value: string | null) => void;
  setRateLimitedUntil: (value: number | null) => void;
  /** Consecutive-auto-retry counter, capped here and reset on success/connect. */
  attemptsRef: NumberRef;
  /** True while a response is in progress. A retry nudge is skipped when set so
   *  we never send response.create over an active response — the server would
   *  reject it ("active response in progress"), which on stop→restart surfaced
   *  as a spurious error banner. */
  activeResponseRef: { current: boolean };
}

/**
 * Recovery from a rate-limited voice response: exposes retryResponse() (used by
 * both the manual "Retry now" button and the auto-retry timer) and arms the
 * auto-retry once a rate-limit window elapses.
 * @param deps - Session ref, rate-limit state, and the attempt counter
 * @returns The manual/auto retry handler
 */
export function useVoiceRetry(deps: UseVoiceRetryDeps): {
  retryResponse: () => void;
} {
  const {
    sessionRef,
    rateLimitedUntil,
    setError,
    setRateLimitedUntil,
    attemptsRef,
    activeResponseRef,
  } = deps;

  // Nudge the server to generate the next response. After a rate-limit failure
  // the conversation already has the latest user/tool message; we just tell the
  // API to run another response cycle. No-op (and clears nothing) when idle, or
  // when a response is already in progress — sending response.create over an
  // active response is rejected by the server ("active response in progress"),
  // and a stale auto-retry timer firing into a freshly restarted session is the
  // path that surfaced that rejection as an error banner.
  const retryResponse = useCallback(() => {
    const session = sessionRef.current;

    if (!session || activeResponseRef.current) return;

    try {
      session.transport.sendEvent({ type: "response.create" });
      setError(null);
      setRateLimitedUntil(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [sessionRef, setError, setRateLimitedUntil, activeResponseRef]);

  useRateLimitAutoRetry(rateLimitedUntil, retryResponse, attemptsRef);

  return { retryResponse };
}

/**
 * Auto-retry a rate-limited response once its window elapses. Fires a touch past
 * the server-indicated wait, but never faster than a floor, so a sub-second (or
 * unparseable, fallback) wait can't spin into a tight retry loop — the server's
 * wait, which grows on repeated limits, is the primary throttle. retryResponse()
 * no-ops once the session is torn down, so a timer that outlives the session is
 * harmless (and the effect clears it on unmount / re-arm anyway).
 *
 * Gives up after {@link MAX_AUTO_RETRY_ATTEMPTS} consecutive rate limits so a
 * persistent limit can't loop forever; the manual "Retry now" button (live once
 * the countdown elapses) remains the escape hatch. The counter resets on connect
 * and on any successful response (see handleTransportEvent).
 *
 * @param rateLimitedUntil - Epoch ms the limit clears, or null when not limited
 * @param retryResponse - Nudges the server to generate the next response
 * @param attemptsRef - Consecutive-auto-retry counter, incremented per retry
 */
function useRateLimitAutoRetry(
  rateLimitedUntil: number | null,
  retryResponse: () => void,
  attemptsRef: NumberRef,
): void {
  useEffect(() => {
    if (rateLimitedUntil == null) return;
    if (attemptsRef.current >= MAX_AUTO_RETRY_ATTEMPTS) return;

    const delay = Math.max(
      AUTO_RETRY_MIN_DELAY_MS,
      rateLimitedUntil - Date.now() + AUTO_RETRY_SAFETY_BUFFER_MS,
    );
    const id = setTimeout(() => {
      attemptsRef.current += 1;
      retryResponse();
    }, delay);

    return () => clearTimeout(id);
  }, [rateLimitedUntil, retryResponse, attemptsRef]);
}
