// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type RealtimeItem,
  type RealtimeMessageItem,
  type RealtimeSession,
  type TransportEvent,
} from "@openai/agents/realtime";
import {
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/settings-helpers";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";

/**
 * Fetch an ephemeral `ek_...` token from the backend proxy.
 *
 * @param voiceTokenUrl - URL of the /voice-token endpoint
 * @param openAiKey - User's OpenAI API key (sent in X-OpenAI-Key header)
 * @returns The ephemeral client secret value
 */
export async function fetchEphemeralToken(
  voiceTokenUrl: string,
  openAiKey: string,
): Promise<string> {
  const response = await fetch(voiceTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenAI-Key": openAiKey,
    },
    body: JSON.stringify({ model: OPENAI_REALTIME_MODEL }),
  });

  if (!response.ok) {
    const detail = await safeJson(response);

    throw new Error(
      `Voice token request failed: ${response.status} ${response.statusText}${
        detail ? ` — ${JSON.stringify(detail)}` : ""
      }`,
    );
  }

  const json = (await response.json()) as { value?: string };

  if (!json.value) {
    throw new Error("Voice token response missing 'value' field");
  }

  return json.value;
}

export interface ResponseFailure {
  code: string;
  message: string;
}

// User-facing messages for the `incomplete` reasons worth surfacing. Reasons
// not listed here (e.g. turn_detected / client_cancelled — a normal barge-in or
// interruption) are intentionally ignored so they don't flash an error banner.
const INCOMPLETE_MESSAGES: Record<string, string> = {
  max_output_tokens: "Response cut off — it reached the maximum length.",
  content_filter: "Response stopped by the content filter.",
};

/**
 * Inspect a transport `response.done` event and return a structured failure to
 * surface, or null. Covers `failed` responses (server error) and the
 * `incomplete` reasons worth flagging (max length, content filter); a benign
 * incomplete reason such as an interruption returns null.
 *
 * @param event - The transport event payload
 * @returns Failure code + message, or null
 */
export function extractResponseFailure(event: unknown): ResponseFailure | null {
  const e = event as {
    response?: {
      status?: string;
      status_details?: {
        error?: { code?: string; message?: string };
        reason?: string;
      };
    };
  };

  const response = e.response;

  if (response?.status === "failed") {
    const err = response.status_details?.error;

    return {
      code: err?.code ?? "unknown",
      message: err?.message ?? err?.code ?? "Response failed",
    };
  }

  if (response?.status === "incomplete") {
    const reason = response.status_details?.reason;

    if (reason == null) return null;
    const message = INCOMPLETE_MESSAGES[reason];

    return message == null ? null : { code: reason, message };
  }

  return null;
}

/**
 * Parse "...Please try again in 15.796s..." from an OpenAI rate-limit message.
 *
 * @param message - The rate-limit error message
 * @returns Seconds to wait, or null if not parseable
 */
export function parseRetrySeconds(message: string): number | null {
  const match = /try again in ([\d.]+)s/i.exec(message);

  if (!match?.[1]) return null;
  const seconds = Number.parseFloat(match[1]);

  return Number.isFinite(seconds) ? seconds : null;
}

/** Minimal session surface the transport helpers need (mic mute control). */
type MutableSession = Pick<RealtimeSession, "mute">;

/** Preact ref holder, narrowed to the boolean refs the helpers receive. */
interface BooleanRef {
  current: boolean;
}

/**
 * Dependencies handleTransportEvent needs from the hook: the half-duplex flag,
 * the live session, the mute-tracking refs, and the UI state setters.
 */
export interface TransportEventDeps {
  /** True when barge-in is disabled — run half-duplex (auto-mute per response). */
  halfDuplex: boolean;
  session: MutableSession;
  /** Flags an active half-duplex auto-mute so response.done can lift it. */
  autoMutedRef: BooleanRef;
  /** Mirrors the user's manual mute, restored when a half-duplex mute lifts. */
  isMutedRef: BooleanRef;
  setAssistantThinking: (value: boolean) => void;
  setAssistantSpeaking: (value: boolean) => void;
  setError: (value: string | null) => void;
  setRateLimitedUntil: (value: number | null) => void;
}

/**
 * Drive the UI status flags from a transport event and, in half-duplex mode
 * (barge-in disabled), mute the mic for the duration of each response so the
 * user can't interrupt the assistant or have speech committed as a phantom turn
 * (which would collide with the active response). Extracted from useVoiceSession
 * to keep the hook within its size limits.
 *
 * @param event - The transport event payload
 * @param deps - Session refs, UI state setters, and the half-duplex flag
 */
export function handleTransportEvent(
  event: TransportEvent,
  deps: TransportEventDeps,
): void {
  if (event.type === "response.created") {
    deps.setAssistantThinking(true);
    // A new turn is underway, so any error from a prior response is stale —
    // clear it so the banner doesn't linger over a healthy response. Clear
    // rateLimitedUntil too: the retry UI renders inside the error banner, so
    // leaving it set without an error would orphan an unrenderable countdown.
    deps.setError(null);
    deps.setRateLimitedUntil(null);
    beginHalfDuplexMute(deps.session, deps.autoMutedRef, deps.halfDuplex);
  } else if (event.type === "response.done") {
    deps.setAssistantThinking(false);
    endHalfDuplexMute(deps.session, deps.autoMutedRef, deps.isMutedRef);
    applyResponseFailure(event, deps);
  } else if (event.type === "output_audio_buffer.started") {
    deps.setAssistantSpeaking(true);
  } else if (
    event.type === "output_audio_buffer.stopped" ||
    event.type === "output_audio_buffer.cleared"
  ) {
    deps.setAssistantSpeaking(false);
  }
}

/**
 * Mute the mic at the start of a half-duplex (barge-in disabled) response and
 * record the auto-mute so response.done can lift it. No-op when barge-in is
 * enabled. Best-effort: a mute() throw is swallowed (the UI is unaffected).
 *
 * @param session - The live realtime session
 * @param autoMutedRef - Ref flagging an active half-duplex auto-mute
 * @param halfDuplex - Whether barge-in is disabled
 */
export function beginHalfDuplexMute(
  session: MutableSession,
  autoMutedRef: BooleanRef,
  halfDuplex: boolean,
): void {
  if (!halfDuplex) return;
  autoMutedRef.current = true;

  try {
    session.mute(true);
  } catch {
    // best-effort; the UI status pill is unaffected
  }
}

/**
 * Lift a half-duplex auto-mute when a response ends, restoring the user's
 * manual mute intent. No-op when no auto-mute is active.
 *
 * @param session - The live realtime session
 * @param autoMutedRef - Ref flagging an active half-duplex auto-mute
 * @param isMutedRef - Ref mirroring the user's manual mute state
 */
export function endHalfDuplexMute(
  session: MutableSession,
  autoMutedRef: BooleanRef,
  isMutedRef: BooleanRef,
): void {
  if (!autoMutedRef.current) return;
  autoMutedRef.current = false;

  try {
    session.mute(isMutedRef.current);
  } catch {
    // best-effort
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
  deps: Pick<TransportEventDeps, "setError" | "setRateLimitedUntil">,
): void {
  const failure = extractResponseFailure(event);

  if (!failure) {
    deps.setRateLimitedUntil(null);

    return;
  }

  deps.setError(failure.message);

  if (failure.code === "rate_limit_exceeded") {
    const seconds = parseRetrySeconds(failure.message);

    if (seconds != null) {
      deps.setRateLimitedUntil(Date.now() + seconds * 1000);
    }
  }
}

/**
 * Best-effort JSON read; returns null on failure.
 *
 * @param response - Fetch response
 * @returns Parsed JSON or null
 */
async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Convert a saved voice history into items the Realtime server will accept via
 * `conversation.item.create`. Drops non-message items (function/MCP calls are
 * not re-seedable) and rewrites audio content to text content carrying the
 * saved transcript. Items left with no usable content are dropped.
 *
 * @param history - Saved voice history items
 * @returns Text-only message items in original order
 */
export function toSeedableHistory(
  history: RealtimeItem[],
): RealtimeMessageItem[] {
  const out: RealtimeMessageItem[] = [];

  for (const item of history) {
    if (item.type !== "message") continue;
    const seeded = messageToTextOnly(item);

    if (seeded) out.push(seeded);
  }

  return out;
}

/**
 * Rewrite a single message item so its content is text-only. Returns null when
 * nothing useful remains (e.g. an audio item whose transcript is still null).
 *
 * @param item - The message item to rewrite
 * @returns The text-only message, or null if empty after filtering
 */
function messageToTextOnly(
  item: RealtimeMessageItem,
): RealtimeMessageItem | null {
  if (item.role === "system") return item;

  if (item.role === "user") {
    const content = item.content.flatMap((c) => {
      if (c.type === "input_text") return [c];

      if (c.transcript) {
        return [{ type: "input_text" as const, text: c.transcript }];
      }

      return [];
    });

    if (content.length === 0) return null;

    return { ...item, content };
  }

  const content = item.content.flatMap((c) => {
    if (c.type === "output_text") return [c];

    if (c.transcript) {
      return [{ type: "output_text" as const, text: c.transcript }];
    }

    return [];
  });

  if (content.length === 0) return null;

  return { ...item, content };
}

/**
 * Extract a human-readable message from an unknown error value. Handles Error
 * instances, plain strings, and the common `{ message: ... }` /
 * `{ error: { message: ... } }` server-error shapes. Falls back to
 * `JSON.stringify` so an opaque object doesn't surface as "[object Object]".
 *
 * @param value - The error value
 * @returns A non-empty string suitable for display
 */
export function extractErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;

    if (typeof obj.message === "string" && obj.message) return obj.message;

    if (obj.error && typeof obj.error === "object") {
      const nested = (obj.error as Record<string, unknown>).message;

      if (typeof nested === "string" && nested) return nested;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Clamp a volume to the element-playback range, defaulting an undefined/invalid
 * value to unity.
 *
 * @param volume - Desired volume (0.0–1.0), or undefined
 * @returns A finite volume in [VOICE_VOLUME_MIN, VOICE_VOLUME_MAX]
 */
function clampVolume(volume: number | undefined): number {
  if (volume == null || !Number.isFinite(volume)) return VOICE_VOLUME_DEFAULT;

  return Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, volume));
}

/**
 * Create the `<audio>` element the WebRTC transport plays remote audio through.
 * Supplying our own (instead of letting the SDK create one) lets us control
 * output volume. The SDK sets autoplay + srcObject on it when the remote track
 * arrives; setting volume here makes the initial level take effect immediately.
 *
 * @param volume - Initial output volume (0.0–1.0)
 * @returns A configured, detached audio element
 */
export function createPlaybackAudioElement(
  volume: number | undefined,
): HTMLAudioElement {
  const audioElement = document.createElement("audio");

  audioElement.autoplay = true;
  audioElement.volume = clampVolume(volume);

  return audioElement;
}

/**
 * Apply a live volume change to the active playback element. No-op when there is
 * no element (idle session), letting the slider adjust loudness mid-session.
 *
 * @param audioElement - The active playback element, or null
 * @param volume - Desired volume (0.0–1.0)
 */
export function setAudioVolume(
  audioElement: HTMLAudioElement | null,
  volume: number | undefined,
): void {
  if (audioElement != null) audioElement.volume = clampVolume(volume);
}

/**
 * Stop and detach the playback element on teardown so a closed session leaves no
 * element holding the (now-ended) remote stream.
 *
 * @param audioElement - The playback element to tear down, or null
 */
export function teardownAudioElement(
  audioElement: HTMLAudioElement | null,
): void {
  if (audioElement == null) return;
  audioElement.pause();
  audioElement.srcObject = null;
}
