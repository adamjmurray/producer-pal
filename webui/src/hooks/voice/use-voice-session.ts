// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  OpenAIRealtimeWebRTC,
  RealtimeAgent,
  RealtimeSession,
  type RealtimeItem,
  type TransportEvent,
} from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type TurnDetectionSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { createRealtimeMcpTools } from "#webui/hooks/voice/realtime-mcp-tools";
import {
  applyLiveVolume,
  bailIfStale,
  buildSessionOptions,
  createPlaybackAudioElement,
  extractErrorMessage,
  fetchEphemeralToken,
  handleTransportEvent,
  seedInitialHistory,
  teardownAudioElement,
  type TransportEventDeps,
} from "#webui/hooks/voice/use-voice-session-helpers";
import {
  createVoiceAudioGraph,
  teardownVoiceAudioGraph,
  type VoiceAudioGraph,
} from "#webui/hooks/voice/voice-audio-graph";
import {
  buildOpenAIVoiceInstructions,
  getVoiceLanguage,
} from "#webui/lib/constants/voice-language";

// Auto-retry timing. Fire a touch past the server-indicated wait (buffer), but
// never spin faster than the floor even when the server reports a sub-second
// wait (or none), so a rate-limit storm can't become a tight retry loop. The
// server's wait — which grows on repeated limits — is the primary throttle.
const AUTO_RETRY_SAFETY_BUFFER_MS = 300;
const AUTO_RETRY_MIN_DELAY_MS = 1000;

export type VoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

interface UseVoiceSessionParams {
  mcpUrl: string;
  voiceTokenUrl: string;
  openAiKey: string | null;
  /** Realtime model id for the session + ephemeral token. Defaults to
   * OPENAI_REALTIME_MODEL when undefined. */
  model?: string;
  enabledTools?: Record<string, boolean>;
  /** Voice id baked into the RealtimeAgent at connect time. The session locks
   * the voice once the model emits audio; if undefined, OpenAI picks a default. */
  voice?: string;
  /** Output playback speed (audio.output.speed). Defaults to 1.0 when undefined. */
  speed?: number;
  /** Output playback volume (0.0–1.25, 1.0 = unity) applied via a Web Audio
   * GainNode (so it can boost above unity). Unlike speed, this is live: changing
   * it updates the active session's loudness immediately. Defaults to 1.0 when
   * undefined. */
  volume?: number;
  /** Thinking UI level ("Default" | "Max" | "Off"). Mapped to
   * reasoning.effort at connect time. */
  thinking?: string;
  /** Turn-detection (VAD) settings, applied to audio.input.turnDetection at
   * connect time. When undefined, the server uses its default endpointing. */
  turnDetection?: TurnDetectionSettings;
  /** Locked voice language (ISO-639-1 code). Drives the agent instructions and
   * the ASR transcription language. Defaults to English when undefined. Locked
   * at connect time (applied on the next Stop → Talk). */
  language?: string;
}

export interface UseVoiceSessionReturn {
  status: VoiceStatus;
  error: string | null;
  history: RealtimeItem[];
  isMuted: boolean;
  /** True while the model is producing audio output (UI indicator only). */
  assistantSpeaking: boolean;
  /** True between response.created and response.done (UI indicator only). */
  assistantThinking: boolean;
  /** Epoch ms when the current rate-limit clears, or null if not rate-limited. */
  rateLimitedUntil: number | null;
  /**
   * Open the realtime connection. If `initialHistory` is provided, message
   * items from it are seeded onto the server's conversation after connect so
   * the model has prior context. Audio content (`input_audio` / `output_audio`)
   * is converted to text content (`input_text` / `output_text`) using the
   * stored transcript — the Realtime server rejects audio items with no audio
   * bytes. function_call items are silently dropped because the SDK refuses to
   * re-add them ("Function calls cannot be manually added or updated at the
   * moment.").
   */
  connect: (initialHistory?: RealtimeItem[]) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMute: () => Promise<void>;
  /** Interrupt the current model response (cut audio, keep transcript so far). */
  interrupt: () => void;
  /** Ask the server to generate the next response. Used after a rate-limit retry. */
  retryResponse: () => void;
  /** Clear the local transcript buffer. Called when the user navigates away
   * from the current conversation (New, Select different) so the prior
   * session's items don't bleed into the next view. */
  resetHistory: () => void;
  /** Voice id the live session was constructed with, or null when idle.
   * Diverges from the user's saved preference when they edit voice in
   * settings mid-session — the change applies on the next Stop → Talk. */
  activeVoice: string | null;
}

/**
 * Owns the OpenAI Realtime voice session lifecycle: token fetch, MCP-tool
 * bridge, WebRTC connect, history/event subscriptions. Full-duplex when
 * barge-in is enabled (no AEC constraints, no audio-buffer tail timeouts;
 * browser/OS handles echo cancellation natively). When barge-in is disabled
 * (turn_detection.interrupt_response off — the default), it falls back to
 * half-duplex by muting the mic for the duration of each response, so the
 * user's speech can't interrupt the assistant or be committed as a phantom
 * turn (which would also collide with the active response).
 *
 * @param params - hook parameters
 * @param params.mcpUrl - URL of the Producer Pal MCP server
 * @param params.voiceTokenUrl - URL of the /voice-token proxy endpoint
 * @param params.openAiKey - User's OpenAI API key from localStorage
 * @param params.enabledTools - Optional map of tool names to enabled state
 * @returns Voice session state and controls
 */
export function useVoiceSession(
  params: UseVoiceSessionParams,
): UseVoiceSessionReturn {
  const {
    mcpUrl,
    voiceTokenUrl,
    openAiKey,
    model,
    enabledTools,
    voice,
    speed,
    volume,
    thinking,
    turnDetection,
    language,
  } = params;

  const sessionRef = useRef<RealtimeSession | null>(null);
  // Our own playback element (we supply it to the WebRTC transport) so output
  // volume is under our control. Null while idle.
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  // Web Audio graph (source → gain → destination) built from the element's
  // remote stream after connect, so volume can boost above unity. Null until
  // built (or when Web Audio is unavailable — then we fall back to element
  // .volume, capped at 1.0).
  const audioGraphRef = useRef<VoiceAudioGraph | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  // Set synchronously at the start of connect() so a second call during the
  // await window (token fetch, MCP-tool setup) can't create a second session +
  // MCP client. sessionRef alone is insufficient — it isn't assigned until
  // after those awaits. Cleared in cleanup() (error/disconnect); after a
  // successful connect, sessionRef takes over as the reentrancy guard.
  const connectingRef = useRef(false);
  // Bumped by cleanup() so a connect() resumed after a teardown that landed
  // during one of its awaits (most reachably the component unmounting while
  // "Connecting…") detects it has gone stale and bails — instead of
  // re-populating the refs and opening a WebRTC peer connection + mic that
  // nothing is left to close. connectingRef alone can't catch this: the
  // teardown resets it, then the resumed connect() runs to completion.
  const connectGenRef = useRef(0);
  // True while we are intentionally tearing the session down, so the transport's
  // "disconnected" event (which fires for both our own close and a network drop)
  // is recognized as expected here and not surfaced as a lost connection.
  const intentionalCloseRef = useRef(false);
  // Mirrors isMuted so the transport-event handlers (which close over
  // connect-time state) can restore the user's manual mute intent after lifting
  // a half-duplex auto-mute.
  const isMutedRef = useRef(false);
  // True while a half-duplex (barge-in disabled) response has the mic
  // auto-muted, so response.done knows to lift it back to the manual state.
  const autoMutedRef = useRef(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [activeVoice, setActiveVoice] = useState<string | null>(null);

  const cleanup = useCallback(async () => {
    // Mark this as an expected close so the transport's "disconnected" event
    // (triggered by session.close() below) isn't mistaken for a network drop.
    intentionalCloseRef.current = true;
    // Capture and null refs synchronously so any subsequent await can't race
    // a concurrent caller into double-closing.
    const session = sessionRef.current;
    const mcpClient = mcpClientRef.current;

    sessionRef.current = null;
    mcpClientRef.current = null;
    connectingRef.current = false;
    // Tear the Web Audio graph down before the element so no AudioContext or
    // audio routing lingers after Stop / a reconnect.
    teardownVoiceAudioGraph(audioGraphRef.current);
    audioGraphRef.current = null;
    teardownAudioElement(audioElementRef.current);
    audioElementRef.current = null;
    // Invalidate any connect() still suspended on an await: when it resumes it
    // will see a changed generation and abort.
    connectGenRef.current++;

    if (session) {
      try {
        session.close();
      } catch {
        // swallow — best-effort teardown
      }
    }

    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch {
        // swallow
      }
    }

    setAssistantSpeaking(false);
    setAssistantThinking(false);
    setActiveVoice(null);
    // Reset mute here (not just in disconnect()) so a dropped connection — which
    // routes through cleanup(), not disconnect() — doesn't leave the next session
    // showing "Muted" in the UI while its mic is actually live.
    setIsMuted(false);
    isMutedRef.current = false;
    autoMutedRef.current = false;
  }, []);

  const connect = useCallback(
    async (initialHistory?: RealtimeItem[]) => {
      if (sessionRef.current || connectingRef.current) return;

      if (!openAiKey) {
        setStatus("error");
        setError(
          "Configure your OpenAI API key in the chat UI settings first.",
        );

        return;
      }

      connectingRef.current = true;
      const myGen = connectGenRef.current;

      intentionalCloseRef.current = false;
      setStatus("connecting");
      setError(null);
      setRateLimitedUntil(null);
      setHistory([]);

      try {
        const { tools, mcpClient } = await createRealtimeMcpTools(
          mcpUrl,
          enabledTools,
        );

        mcpClientRef.current = mcpClient;

        // Torn down during MCP setup (e.g. unmounted while "Connecting…")? Bail
        // before building the session so we never open a peer connection + mic.
        if (await bailIfStale(connectGenRef.current !== myGen, cleanup)) return;

        const voiceLanguage = getVoiceLanguage(language);
        const agent = new RealtimeAgent({
          name: "Producer Pal Voice",
          instructions: buildOpenAIVoiceInstructions(voiceLanguage),
          tools,
          voice,
        });

        // Construct the transport supplying our own <audio> element so we
        // control output volume (the SDK would otherwise create its own,
        // unreachable, element). The SDK still calls getUserMedia({ audio: true })
        // (default constraints — browser/OS-level AEC is on by default on macOS
        // and modern Chromium/Safari) and sets autoplay + srcObject on our
        // element when the remote track arrives.
        const audioElement = createPlaybackAudioElement(volume);

        audioElementRef.current = audioElement;
        const transport = new OpenAIRealtimeWebRTC({ audioElement });

        // Surface a dropped connection (network blip, sleep/wake, tab
        // backgrounding): the SDK closes the transport and emits "disconnected",
        // but the session never re-emits it as an error, so the UI would
        // otherwise stay "connected" — or hang on "Thinking…" if the drop landed
        // mid-response — on a dead session. cleanup() closes the dead session and
        // resets the latched indicators; we then prompt a reconnect. Our own
        // teardowns set intentionalCloseRef first, so they are ignored here.
        transport.on("disconnected", () => {
          if (intentionalCloseRef.current) return;

          void cleanup().then(() => {
            setStatus("error");
            setError("Connection lost. Press Talk to reconnect.");
          });
        });

        const session = new RealtimeSession(
          agent,
          buildSessionOptions(transport, {
            turnDetection,
            speed,
            thinking,
            model,
            transcriptionLanguage: voiceLanguage.code,
          }),
        );

        // Barge-in disabled (interrupt_response off, the default) → run
        // half-duplex: handleTransportEvent mutes the mic for the duration of
        // each response. When turnDetection is undefined, OpenAI's default
        // (barge-in on) applies, so we stay full-duplex. turnDetection is fixed
        // for the session (changes apply on the next Stop → Talk).
        const halfDuplex = turnDetection?.interruptResponse === false;

        wireSessionEvents(session, setHistory, {
          halfDuplex,
          autoMutedRef,
          isMutedRef,
          setAssistantThinking,
          setAssistantSpeaking,
          setError,
          setRateLimitedUntil,
        });

        // eslint-disable-next-line require-atomic-updates -- ref is not subject to React batching
        sessionRef.current = session;

        const token = await fetchEphemeralToken(
          voiceTokenUrl,
          openAiKey,
          model,
        );

        // Torn down during the token fetch? Bail before session.connect() opens
        // the mic (cleanup() already closed the stored session).
        if (await bailIfStale(connectGenRef.current !== myGen, cleanup)) return;

        await session.connect({ apiKey: token });

        // Torn down during the WebRTC handshake itself? session.connect() can
        // resolve — opening the peer connection + mic — *after* a teardown's
        // cleanup() already closed the stored ref (that close may have been a
        // no-op before the handshake finished). Close this just-opened session
        // directly and bail before publishing "connected"/history that nothing
        // is left to manage. The two checks above can't cover this window: they
        // run before the peer connection exists.
        if (
          await bailIfStale(connectGenRef.current !== myGen, cleanup, session)
        )
          return;

        // The WebRTC transport has attached the remote stream to our element by
        // now; route it through a GainNode so volume can boost above unity. Null
        // (no Web Audio / no stream yet) falls back to element .volume (capped).
        const graph = createVoiceAudioGraph(audioElementRef.current, volume);

        audioGraphRef.current = graph;
        setActiveVoice(voice ?? null);
        seedInitialHistory(session, initialHistory);
        setStatus("connected");
      } catch (err) {
        setStatus("error");
        setError(extractErrorMessage(err));
        await cleanup();
      }
    },
    [
      mcpUrl,
      voiceTokenUrl,
      openAiKey,
      model,
      enabledTools,
      voice,
      speed,
      volume,
      thinking,
      turnDetection,
      language,
      cleanup,
    ],
  );

  const disconnect = useCallback(async () => {
    setStatus("disconnecting");
    await cleanup();
    setStatus("idle");
  }, [cleanup]);

  const toggleMute = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) return;
    const next = !isMuted;

    try {
      session.mute(next);
      isMutedRef.current = next;
      setIsMuted(next);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [isMuted]);

  /**
   * Cut off the model's current response. The SDK truncates the assistant
   * audio at what's actually been played and leaves the transcript so far in
   * history.
   */
  const interrupt = useCallback(() => {
    const session = sessionRef.current;

    if (!session) return;

    try {
      session.interrupt();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  /**
   * Nudge the server to generate the next response. After a rate-limit
   * failure the conversation already has the latest user/tool message; we
   * just need to tell the API to run another response cycle.
   */
  const retryResponse = useCallback(() => {
    const session = sessionRef.current;

    if (!session) return;

    try {
      session.transport.sendEvent({ type: "response.create" });
      setError(null);
      setRateLimitedUntil(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  // Auto-nudge the model to continue once a rate-limit window elapses, so
  // hands-free voice recovers without a manual click or the user speaking again.
  useRateLimitAutoRetry(rateLimitedUntil, retryResponse);

  // Push live volume changes mid-session (no Stop → Talk needed, unlike speed):
  // drive the GainNode (active path, can boost above unity) and keep element
  // .volume in sync for the no-Web-Audio fallback (capped at 1.0).
  useEffect(
    () =>
      applyLiveVolume(audioGraphRef.current, audioElementRef.current, volume),
    [volume],
  );

  useEffect(() => () => void cleanup(), [cleanup]);

  return {
    status,
    error,
    history,
    isMuted,
    assistantSpeaking,
    assistantThinking,
    rateLimitedUntil,
    connect,
    disconnect,
    toggleMute,
    interrupt,
    retryResponse,
    resetHistory: () => setHistory([]),
    activeVoice,
  };
}

/**
 * Auto-retry a rate-limited response once its window elapses. Fires a touch past
 * the server-indicated wait, but never faster than a floor, so a sub-second (or
 * unparseable, fallback) wait can't spin into a tight retry loop — the server's
 * wait, which grows on repeated limits, is the primary throttle. retryResponse()
 * no-ops once the session is torn down, so a timer that outlives the session is
 * harmless (and the effect clears it on unmount / re-arm anyway).
 *
 * @param rateLimitedUntil - Epoch ms the limit clears, or null when not limited
 * @param retryResponse - Nudges the server to generate the next response
 */
function useRateLimitAutoRetry(
  rateLimitedUntil: number | null,
  retryResponse: () => void,
): void {
  useEffect(() => {
    if (rateLimitedUntil == null) return;

    const delay = Math.max(
      AUTO_RETRY_MIN_DELAY_MS,
      rateLimitedUntil - Date.now() + AUTO_RETRY_SAFETY_BUFFER_MS,
    );
    const id = setTimeout(() => retryResponse(), delay);

    return () => clearTimeout(id);
  }, [rateLimitedUntil, retryResponse]);
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
function wireSessionEvents(
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
