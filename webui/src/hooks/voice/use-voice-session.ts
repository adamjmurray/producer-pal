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
import { mapThinkingToRealtimeEffort } from "#webui/hooks/settings/config-builders";
import { VOICE_SPEED_DEFAULT } from "#webui/hooks/settings/settings-helpers";
import { createRealtimeMcpTools } from "#webui/hooks/voice/realtime-mcp-tools";
import {
  extractErrorMessage,
  extractResponseFailure,
  fetchEphemeralToken,
  parseRetrySeconds,
  toSeedableHistory,
} from "#webui/hooks/voice/use-voice-session-helpers";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";

const AGENT_INSTRUCTIONS = [
  "You are Producer Pal, an AI music production assistant working with the user in Ableton Live.",
  "Always speak and respond in English. Interpret all user audio as English, even if a short utterance sounds ambiguous.",
  "Before responding to the user's first request, call the ppal-connect tool to load the latest Producer Pal skills and current project context.",
  "Keep voice responses brief and conversational. When tool calls take a moment, you may narrate what you are doing so the user knows you are working.",
].join(" ");

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
  enabledTools?: Record<string, boolean>;
  /** Voice id baked into the RealtimeAgent at connect time. The session locks
   * the voice once the model emits audio; if undefined, OpenAI picks a default. */
  voice?: string;
  /** Output playback speed (audio.output.speed). Defaults to 1.0 when undefined. */
  speed?: number;
  /** Thinking UI level ("Default" | "Max" | "Off"). Mapped to
   * reasoning.effort at connect time. */
  thinking?: string;
}

interface UseVoiceSessionReturn {
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
 * bridge, WebRTC connect, history/event subscriptions. Mirrors the canonical
 * realtime-next example — no half-duplex auto-mute, no AEC constraints, no
 * audio-buffer tail timeouts. Browser/OS handles echo cancellation natively.
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
    enabledTools,
    voice,
    speed,
    thinking,
  } = params;

  const sessionRef = useRef<RealtimeSession | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  // Set synchronously at the start of connect() so a second call during the
  // await window (token fetch, MCP-tool setup) can't create a second session +
  // MCP client. sessionRef alone is insufficient — it isn't assigned until
  // after those awaits. Cleared in cleanup() (error/disconnect); after a
  // successful connect, sessionRef takes over as the reentrancy guard.
  const connectingRef = useRef(false);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [activeVoice, setActiveVoice] = useState<string | null>(null);

  const cleanup = useCallback(async () => {
    // Capture and null refs synchronously so any subsequent await can't race
    // a concurrent caller into double-closing.
    const session = sessionRef.current;
    const mcpClient = mcpClientRef.current;

    sessionRef.current = null;
    mcpClientRef.current = null;
    connectingRef.current = false;

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
      setStatus("connecting");
      setError(null);
      setHistory([]);

      try {
        const { tools, mcpClient } = await createRealtimeMcpTools(
          mcpUrl,
          enabledTools,
        );

        mcpClientRef.current = mcpClient;

        const agent = new RealtimeAgent({
          name: "Producer Pal Voice",
          instructions: AGENT_INSTRUCTIONS,
          tools,
          voice,
        });

        // Construct the transport with no options. The SDK calls
        // getUserMedia({ audio: true }) (default constraints — browser/OS-level
        // AEC is on by default on macOS and modern Chromium/Safari) and creates
        // its own <audio> element for playback. This matches the canonical
        // realtime-next example.
        const transport = new OpenAIRealtimeWebRTC();

        const reasoningEffort = mapThinkingToRealtimeEffort(thinking ?? "");
        const session = new RealtimeSession(agent, {
          model: OPENAI_REALTIME_MODEL,
          transport,
          config: {
            audio: { output: { speed: speed ?? VOICE_SPEED_DEFAULT } },
            ...(reasoningEffort
              ? { reasoning: { effort: reasoningEffort } }
              : {}),
          },
        });

        session.on("history_updated", (next: RealtimeItem[]) => {
          setHistory([...next]);
        });

        session.on("transport_event", (event: TransportEvent) => {
          // These flags drive the UI status pill only. They do NOT touch the
          // mic — the canonical example doesn't auto-mute and we follow suit.
          if (event.type === "response.created") {
            setAssistantThinking(true);
          } else if (event.type === "response.done") {
            setAssistantThinking(false);
            const failure = extractResponseFailure(event);

            if (failure) {
              setError(failure.message);

              if (failure.code === "rate_limit_exceeded") {
                const seconds = parseRetrySeconds(failure.message);

                if (seconds != null) {
                  setRateLimitedUntil(Date.now() + seconds * 1000);
                }
              }
            } else {
              setRateLimitedUntil(null);
            }
          } else if (event.type === "output_audio_buffer.started") {
            setAssistantSpeaking(true);
          } else if (
            event.type === "output_audio_buffer.stopped" ||
            event.type === "output_audio_buffer.cleared"
          ) {
            setAssistantSpeaking(false);
          }
        });

        session.on("error", (err: { type: "error"; error: unknown }) => {
          console.error("RealtimeSession error", err.error);
          setError(extractErrorMessage(err.error));
        });

        // eslint-disable-next-line require-atomic-updates -- ref is not subject to React batching
        sessionRef.current = session;

        const token = await fetchEphemeralToken(voiceTokenUrl, openAiKey);

        await session.connect({ apiKey: token });

        setActiveVoice(voice ?? null);

        if (initialHistory && initialHistory.length > 0) {
          // The SDK's resetHistory only echoes "message" items back to the
          // server — function_call/mcp_call items are dropped. Audio items are
          // also rejected server-side without real audio bytes, so we replace
          // them with text content carrying the saved transcript.
          const primable = toSeedableHistory(initialHistory);

          if (primable.length > 0) session.updateHistory(primable);
        }

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
      enabledTools,
      voice,
      speed,
      thinking,
      cleanup,
    ],
  );

  const disconnect = useCallback(async () => {
    setStatus("disconnecting");
    await cleanup();
    setStatus("idle");
    setIsMuted(false);
  }, [cleanup]);

  const toggleMute = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) return;
    const next = !isMuted;

    try {
      session.mute(next);
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

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

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
