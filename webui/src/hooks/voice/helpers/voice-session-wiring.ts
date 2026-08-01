// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  OpenAIRealtimeWebRTC,
  type RealtimeItem,
  type RealtimeSession,
  type TransportEvent,
} from "@openai/agents/realtime";
import {
  createPlaybackAudioElement,
  extractErrorMessage,
  handleTransportEvent,
  type TransportEventDeps,
} from "#webui/hooks/voice/helpers/use-voice-session-helpers";

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
