// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type OpenAIRealtimeWebRTC,
  type RealtimeItem,
  type RealtimeMessageItem,
  type RealtimeSession,
  type TransportEvent,
} from "@openai/agents/realtime";
import {
  mapThinkingToRealtimeEffort,
  mapTurnDetectionToConfig,
} from "#webui/hooks/settings/config-builders";
import {
  VOICE_SPEED_DEFAULT,
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/settings-helpers";
import { type TurnDetectionSettings } from "#webui/hooks/settings/turn-detection-helpers";
import {
  setGraphGain,
  type VoiceAudioGraph,
} from "#webui/hooks/voice/voice-audio-graph";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
import {
  OPENAI_TRANSCRIPTION_MODEL,
  VOICE_LANGUAGE_ISO,
} from "#webui/lib/constants/voice-language";

// The <audio> element's .volume is hard-capped at unity by the HTML spec — it
// can attenuate but not boost. Boost above unity goes through the Web Audio
// GainNode (see voice-audio-graph.ts), so this element-only clamp stays at 1.0
// even though the slider/GainNode range extends to VOICE_VOLUME_MAX (1.25).
const ELEMENT_VOLUME_MAX = 1;

/**
 * Fetch an ephemeral `ek_...` token from the backend proxy.
 *
 * @param voiceTokenUrl - URL of the /voice-token endpoint
 * @param openAiKey - User's OpenAI API key (sent in X-OpenAI-Key header)
 * @param model - Realtime model id to mint the token for (defaults to
 *   OPENAI_REALTIME_MODEL)
 * @returns The ephemeral client secret value
 */
export async function fetchEphemeralToken(
  voiceTokenUrl: string,
  openAiKey: string,
  model: string = OPENAI_REALTIME_MODEL,
): Promise<string> {
  const response = await fetch(voiceTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenAI-Key": openAiKey,
    },
    body: JSON.stringify({ model }),
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
 * value to unity. Capped at unity (ELEMENT_VOLUME_MAX) because element .volume
 * can't boost; values above unity are realized by the GainNode, not here.
 *
 * @param volume - Desired volume (0.0–1.25), or undefined
 * @returns A finite volume in [VOICE_VOLUME_MIN, ELEMENT_VOLUME_MAX]
 */
function clampVolume(volume: number | undefined): number {
  if (volume == null || !Number.isFinite(volume)) return VOICE_VOLUME_DEFAULT;

  return Math.min(ELEMENT_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, volume));
}

/**
 * Create the `<audio>` element the WebRTC transport plays remote audio through.
 * Supplying our own (instead of letting the SDK create one) lets us reach the
 * remote stream for the Web Audio GainNode. The SDK sets autoplay + srcObject on
 * it when the remote track arrives. Once the gain graph is built the element is
 * muted; the initial .volume set here is the fallback used when Web Audio is
 * unavailable (capped at unity).
 *
 * @param volume - Initial output volume (0.0–1.25; element clamps to 1.0)
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
 * Apply a live volume change to the playback element (the no-Web-Audio fallback
 * path; capped at unity). No-op when there is no element (idle session). The
 * GainNode is the primary live-volume path — see setGraphGain.
 *
 * @param audioElement - The active playback element, or null
 * @param volume - Desired volume (0.0–1.25; element clamps to 1.0)
 */
export function setAudioVolume(
  audioElement: HTMLAudioElement | null,
  volume: number | undefined,
): void {
  if (audioElement != null) audioElement.volume = clampVolume(volume);
}

/**
 * Apply a live volume change to both paths: the GainNode (the active path, can
 * boost above unity) and the element .volume (the no-Web-Audio fallback, capped
 * at unity). Either may be null when idle or when the graph wasn't built.
 *
 * @param graph - The active Web Audio graph, or null
 * @param audioElement - The active playback element, or null
 * @param volume - Desired volume (0.0–1.25)
 */
export function applyLiveVolume(
  graph: VoiceAudioGraph | null,
  audioElement: HTMLAudioElement | null,
  volume: number | undefined,
): void {
  setGraphGain(graph, volume);
  setAudioVolume(audioElement, volume);
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

/**
 * Build the RealtimeSession options (model, transport, audio + reasoning config)
 * from the user's settings. Extracted so the hook's connect() stays focused; the
 * mapping is covered by use-voice-session-config tests.
 *
 * @param transport - The WebRTC transport instance
 * @param opts - Session-shaping settings
 * @param opts.turnDetection - VAD settings, or undefined for server default
 * @param opts.speed - Output playback speed (defaults to VOICE_SPEED_DEFAULT)
 * @param opts.thinking - Thinking UI level, mapped to reasoning.effort
 * @param opts.model - Realtime model id (defaults to OPENAI_REALTIME_MODEL)
 * @returns The RealtimeSession constructor options
 */
export function buildSessionOptions(
  transport: OpenAIRealtimeWebRTC,
  opts: {
    turnDetection?: TurnDetectionSettings;
    speed?: number;
    thinking?: string;
    model?: string;
  },
): ConstructorParameters<typeof RealtimeSession>[1] {
  const reasoningEffort = mapThinkingToRealtimeEffort(opts.thinking ?? "");

  return {
    model: opts.model ?? OPENAI_REALTIME_MODEL,
    transport,
    config: {
      audio: {
        // Pin the ASR side-channel language so short/noisy utterances aren't
        // misclassified. This shapes the transcript text only (UI/logs/tool-call
        // inputs); output language is locked separately via agent instructions.
        input: {
          transcription: {
            model: OPENAI_TRANSCRIPTION_MODEL,
            language: VOICE_LANGUAGE_ISO,
          },
          ...(opts.turnDetection
            ? { turnDetection: mapTurnDetectionToConfig(opts.turnDetection) }
            : {}),
        },
        output: { speed: opts.speed ?? VOICE_SPEED_DEFAULT },
      },
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    },
  };
}

/**
 * Abort a connect() that went stale across one of its awaits — cleanup() bumped
 * the generation, so this attempt's resources must not be published or opened.
 * cleanup() closes whatever's been stored on the refs; the caller returns before
 * opening (or after re-populating) the session + mic.
 *
 * @param isStale - Whether cleanup() ran since this connect() started
 * @param cleanup - Tears down the stored session + MCP client
 * @param session - The just-opened session, if the await being guarded was
 *   session.connect(). The stale teardown's cleanup() closed the stored ref,
 *   but that close may have been a no-op before the handshake completed, so we
 *   close this resolved session directly to avoid leaking a live peer
 *   connection + mic. Omitted for checks that run before any connection exists.
 * @returns True if stale (caller should return); false to continue
 */
export async function bailIfStale(
  isStale: boolean,
  cleanup: () => Promise<void>,
  session?: RealtimeSession,
): Promise<boolean> {
  if (!isStale) return false;

  if (session) {
    try {
      session.close();
    } catch {
      // swallow — best-effort teardown
    }
  }

  await cleanup();

  return true;
}

/**
 * Seed prior conversation context onto a freshly connected session. The SDK's
 * updateHistory only echoes "message" items back to the server (function/MCP
 * calls are dropped) and rejects audio items without bytes, so the history is
 * first rewritten to text-only via toSeedableHistory. No-op for an empty/omitted
 * history or when nothing seedable remains.
 *
 * @param session - The connected realtime session
 * @param initialHistory - Saved history to seed, or undefined
 */
export function seedInitialHistory(
  session: Pick<RealtimeSession, "updateHistory">,
  initialHistory: RealtimeItem[] | undefined,
): void {
  if (!initialHistory || initialHistory.length === 0) return;
  const primable = toSeedableHistory(initialHistory);

  if (primable.length > 0) session.updateHistory(primable);
}
