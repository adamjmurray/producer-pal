// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type OpenAIRealtimeWebRTC,
  type RealtimeItem,
  type RealtimeMessageItem,
  type RealtimeSession,
} from "@openai/agents/realtime";
import {
  mapThinkingToRealtimeEffort,
  mapTurnDetectionToConfig,
} from "#webui/hooks/settings/config-builders";
import { type TurnDetectionSettings } from "#webui/hooks/settings/helpers/turn-detection-settings";
import { VOICE_SPEED_DEFAULT } from "#webui/hooks/settings/helpers/voice-settings-storage";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
import {
  DEFAULT_VOICE_LANGUAGE,
  OPENAI_TRANSCRIPTION_MODEL,
} from "#webui/lib/constants/voice-language";

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
    if (item.type !== "message") {
      continue;
    }

    const seeded = messageToTextOnly(item);

    if (seeded) {
      out.push(seeded);
    }
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
  if (item.role === "system") {
    return item;
  }

  if (item.role === "user") {
    const content = item.content.flatMap((c) => {
      if (c.type === "input_text") {
        return [c];
      }

      if (c.transcript) {
        return [{ type: "input_text" as const, text: c.transcript }];
      }

      return [];
    });

    if (content.length === 0) {
      return null;
    }

    return { ...item, content };
  }

  const content = item.content.flatMap((c) => {
    if (c.type === "output_text") {
      return [c];
    }

    if (c.transcript) {
      return [{ type: "output_text" as const, text: c.transcript }];
    }

    return [];
  });

  if (content.length === 0) {
    return null;
  }

  return { ...item, content };
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
 * @param opts.transcriptionLanguage - ISO-639-1 code for the ASR side-channel
 *   (defaults to English)
 * @returns The RealtimeSession constructor options
 */
export function buildSessionOptions(
  transport: OpenAIRealtimeWebRTC,
  opts: {
    turnDetection?: TurnDetectionSettings;
    speed?: number;
    thinking?: string;
    model?: string;
    transcriptionLanguage?: string;
  },
): ConstructorParameters<typeof RealtimeSession>[1] {
  const reasoningEffort = mapThinkingToRealtimeEffort(opts.thinking ?? "");

  return {
    model: opts.model ?? OPENAI_REALTIME_MODEL,
    transport,
    config: {
      audio: {
        // ASR side channel for user-facing transcripts, logs, and other
        // text-based features. The Realtime model understands the input audio
        // natively; this transcript is generated separately and may not exactly
        // match the model's interpretation.
        input: {
          transcription: {
            model: OPENAI_TRANSCRIPTION_MODEL,
            language: opts.transcriptionLanguage ?? DEFAULT_VOICE_LANGUAGE,
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
  if (!isStale) {
    return false;
  }

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
  if (!initialHistory || initialHistory.length === 0) {
    return;
  }

  const primable = toSeedableHistory(initialHistory);

  if (primable.length > 0) {
    session.updateHistory(primable);
  }
}
