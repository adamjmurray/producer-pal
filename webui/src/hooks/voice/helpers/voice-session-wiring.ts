// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Tool } from "@openai/agents";
import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  type RealtimeItem,
  RealtimeSession,
  type TransportEvent,
} from "@openai/agents/realtime";
import { type TurnDetectionSettings } from "#webui/hooks/settings/helpers/turn-detection-helpers";
import { extractErrorMessage } from "#webui/hooks/voice/helpers/response-failure";
import {
  handleTransportEvent,
  type TransportEventDeps,
} from "#webui/hooks/voice/helpers/transport-events";
import { buildSessionOptions } from "#webui/hooks/voice/helpers/voice-session-setup";
import { createPlaybackAudioElement } from "#webui/hooks/voice/helpers/playback-audio-element";
import {
  buildOpenAIVoiceInstructions,
  getVoiceLanguage,
} from "#webui/lib/constants/voice-language";

/** Connect-time settings the session is built from (a subset of the hook's params). */
export interface WiredSessionSettings {
  model?: string;
  voice?: string;
  speed?: number;
  volume?: number;
  thinking?: string;
  turnDetection?: TurnDetectionSettings;
  language?: string;
}

/** The hook-owned pieces the session gets wired to. */
export interface WiredSessionDeps {
  tools: Tool[];
  /** Ref the playback element is stored on for teardown. */
  audioElementRef: { current: HTMLAudioElement | null };
  setHistory: (items: RealtimeItem[]) => void;
  /** True while the hook is tearing down on purpose, so our own close isn't
   * reported as a dropped connection. */
  intentionalCloseRef: { current: boolean };
  cleanup: () => Promise<void>;
  /** Runs after cleanup() when the transport drops unexpectedly. */
  onConnectionLost: () => void;
  /** Everything handleTransportEvent needs beyond the session and the
   * half-duplex flag (both derived here). */
  eventDeps: Omit<TransportEventDeps, "session" | "halfDuplex">;
}

/**
 * Build the agent, transport, and session for one connect attempt, with every
 * listener attached. Extracted from useVoiceSession to keep the hook within its
 * line budget.
 *
 * @param settings - Connect-time settings (voice, model, audio, turn detection)
 * @param deps - Tools, refs, and setters the session is wired to
 * @returns The wired session, not yet connected
 */
export function createWiredSession(
  settings: WiredSessionSettings,
  deps: WiredSessionDeps,
): RealtimeSession {
  const voiceLanguage = getVoiceLanguage(settings.language);
  const agent = new RealtimeAgent({
    name: "Producer Pal Voice",
    instructions: buildOpenAIVoiceInstructions(voiceLanguage),
    tools: deps.tools,
    voice: settings.voice,
  });

  const transport = buildTransport(
    settings.volume,
    deps.audioElementRef,
    () => {
      if (deps.intentionalCloseRef.current) {
        return;
      }

      void deps.cleanup().then(deps.onConnectionLost);
    },
  );

  const session = new RealtimeSession(
    agent,
    buildSessionOptions(transport, {
      turnDetection: settings.turnDetection,
      speed: settings.speed,
      thinking: settings.thinking,
      model: settings.model,
      transcriptionLanguage: voiceLanguage.code,
    }),
  );

  wireSessionEvents(session, deps.setHistory, {
    // Barge-in disabled (interrupt_response off, the default) → run half-duplex:
    // handleTransportEvent mutes the mic for each assistant turn. When
    // turnDetection is undefined, OpenAI's default (barge-in on) applies, so we
    // stay full-duplex. turnDetection is fixed for the session (changes apply on
    // the next Stop → Talk).
    halfDuplex: settings.turnDetection?.interruptResponse === false,
    ...deps.eventDeps,
  });

  return session;
}

/**
 * Build the WebRTC transport with our own <audio> element, so output volume is
 * under our control (the SDK would otherwise create its own, unreachable, one).
 * The SDK still calls getUserMedia({ audio: true }) with default constraints —
 * browser/OS-level AEC is on by default on macOS and modern Chromium/Safari —
 * and sets autoplay + srcObject on the element when the remote track arrives.
 *
 * `onDisconnected` fires on both our own close and a dropped connection
 * (network blip, sleep/wake, tab backgrounding); the session never re-emits it
 * as an error, so without this the UI would stay "connected" — or hang on
 * "Thinking…" if the drop landed mid-response — on a dead session.
 *
 * @param volume - Initial playback volume
 * @param audioElementRef - Ref the created element is stored on for teardown
 * @param onDisconnected - Runs when the transport reports a disconnect
 * @returns The configured transport
 */
export function buildTransport(
  volume: number | undefined,
  audioElementRef: { current: HTMLAudioElement | null },
  onDisconnected: () => void,
): OpenAIRealtimeWebRTC {
  const audioElement = createPlaybackAudioElement(volume);

  audioElementRef.current = audioElement;
  const transport = new OpenAIRealtimeWebRTC({ audioElement });

  transport.on("disconnected", onDisconnected);

  return transport;
}

/**
 * Wire the realtime session's history, transport-event, and error listeners.
 * Extracted from useVoiceSession to keep the hook within its line budget.
 *
 * @param session - The realtime session to attach listeners to
 * @param setHistory - State setter for the transcript history
 * @param transportDeps - The half-duplex flag, mute refs, and UI setters
 *   handleTransportEvent needs (every TransportEventDeps field but `session`)
 */
export function wireSessionEvents(
  session: RealtimeSession,
  setHistory: (items: RealtimeItem[]) => void,
  transportDeps: Omit<TransportEventDeps, "session">,
): void {
  session.on("history_updated", (next: RealtimeItem[]) => {
    setHistory([...next]);
  });

  session.on("transport_event", (event: TransportEvent) =>
    handleTransportEvent(event, { session, ...transportDeps }),
  );

  session.on("error", (err: { type: "error"; error: unknown }) => {
    console.error("RealtimeSession error", err.error);
    transportDeps.setError(extractErrorMessage(err.error));
  });
}
