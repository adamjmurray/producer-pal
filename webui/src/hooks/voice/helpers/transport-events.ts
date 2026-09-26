// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TransportEvent } from "@openai/agents/realtime";
import {
  beginHalfDuplexMute,
  endHalfDuplexMute,
  type HalfDuplexDeps,
} from "#webui/hooks/voice/helpers/half-duplex-mute";
import {
  DEFAULT_RATE_LIMIT_BACKOFF_SECONDS,
  extractResponseFailure,
  parseRetrySeconds,
} from "#webui/hooks/voice/helpers/response-failure";

/**
 * Dependencies handleTransportEvent needs from the hook: the half-duplex flag,
 * the live session, the mute-tracking refs, and the UI state setters.
 */
export interface TransportEventDeps extends HalfDuplexDeps {
  /** True when barge-in is disabled — run half-duplex (auto-mute per response). */
  halfDuplex: boolean;
  setAssistantThinking: (value: boolean) => void;
  setAssistantSpeaking: (value: boolean) => void;
  setError: (value: string | null) => void;
  setRateLimitedUntil: (value: number | null) => void;
  /** Consecutive-auto-retry counter, reset to 0 on a successful response so the
   *  rate-limit auto-retry budget refreshes (see useRateLimitAutoRetry). */
  autoRetryAttemptsRef: { current: number };
}

/**
 * Drive the UI status flags from a transport event and, in half-duplex mode
 * (barge-in disabled), mute the mic while the assistant is generating *and*
 * speaking, so a user can't interrupt or commit a turn into the live response.
 * @param event - The transport event payload
 * @param deps - Session refs, UI state setters, and the half-duplex flag
 */
export function handleTransportEvent(
  event: TransportEvent,
  deps: TransportEventDeps,
): void {
  if (event.type === "response.created") {
    deps.responseActiveRef.current = true;
    deps.setAssistantThinking(true);
    // A new turn is underway, so any error from a prior response is stale —
    // clear it so the banner doesn't linger over a healthy response. Clear
    // rateLimitedUntil too: the retry UI renders inside the error banner, so
    // leaving it set without an error would orphan an unrenderable countdown.
    deps.setError(null);
    deps.setRateLimitedUntil(null);
    // Only `output_audio_buffer.stopped`/`cleared` clears this flag, and it is
    // half of what lets the auto-mute lift — so one missed event would strand
    // the mic muted for the rest of the session, with the Mute button hidden
    // and no way back. A new response is the safe place to floor it: the
    // buffer that is playing (if any) still emits its own stopped event, and
    // this turn's audio sets it again from `started`.
    deps.audioPlayingRef.current = false;
    beginHalfDuplexMute(deps.session, deps.autoMutedRef, deps.halfDuplex);
  } else if (event.type === "response.done") {
    deps.responseActiveRef.current = false;
    deps.setAssistantThinking(false);
    // No-op while audio is still playing; the buffer event below lifts it.
    endHalfDuplexMute(deps);
    applyResponseFailure(event, deps);
  } else if (event.type === "output_audio_buffer.started") {
    deps.audioPlayingRef.current = true;
    deps.setAssistantSpeaking(true);
  } else if (
    event.type === "output_audio_buffer.stopped" ||
    event.type === "output_audio_buffer.cleared"
  ) {
    deps.audioPlayingRef.current = false;
    deps.setAssistantSpeaking(false);
    endHalfDuplexMute(deps);
  }
}

/**
 * Apply a response.done failure to the UI: surface the message and, for a rate
 * limit, set the retry countdown. Clears the countdown when there is no failure.
 *
 * @param event - The response.done transport event
 * @param deps - The error + rate-limit state setters
 */
function applyResponseFailure(
  event: TransportEvent,
  deps: TransportEventDeps,
): void {
  const failure = extractResponseFailure(event);

  if (!failure) {
    // A clean response (or a benign interruption) ends any rate-limit streak, so
    // refresh the auto-retry budget.
    deps.autoRetryAttemptsRef.current = 0;
    deps.setRateLimitedUntil(null);

    return;
  }

  deps.setError(failure.message);

  // A non-rate-limit failure (failed/max_output_tokens/content_filter) also ends
  // the streak, so the else resets the budget too — otherwise a later streak
  // would start mid-count and give up early.
  if (failure.code === "rate_limit_exceeded") {
    // Always set the window — fall back to a default when the wait can't be
    // parsed — so the retry UI renders and auto-retry arms even for a
    // sub-second/unparseable wait (no dead banner).
    const seconds =
      parseRetrySeconds(failure.message) ?? DEFAULT_RATE_LIMIT_BACKOFF_SECONDS;

    deps.setRateLimitedUntil(Date.now() + seconds * 1000);
  } else {
    deps.autoRetryAttemptsRef.current = 0;
  }
}
