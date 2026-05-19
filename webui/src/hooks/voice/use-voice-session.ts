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
import { createRealtimeMcpTools } from "#webui/hooks/voice/realtime-mcp-tools";
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
   * the model has prior context. function_call items are silently dropped —
   * the Realtime SDK refuses to re-add them ("Function calls cannot be
   * manually added or updated at the moment.").
   */
  connect: (initialHistory?: RealtimeItem[]) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMute: () => Promise<void>;
  /** Interrupt the current model response (cut audio, keep transcript so far). */
  interrupt: () => void;
  /** Ask the server to generate the next response. Used after a rate-limit retry. */
  retryResponse: () => void;
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
  const { mcpUrl, voiceTokenUrl, openAiKey, enabledTools } = params;

  const sessionRef = useRef<RealtimeSession | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);

  const cleanup = useCallback(async () => {
    // Capture and null refs synchronously so any subsequent await can't race
    // a concurrent caller into double-closing.
    const session = sessionRef.current;
    const mcpClient = mcpClientRef.current;

    sessionRef.current = null;
    mcpClientRef.current = null;

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
  }, []);

  const connect = useCallback(
    async (initialHistory?: RealtimeItem[]) => {
      if (sessionRef.current) return;

      if (!openAiKey) {
        setStatus("error");
        setError(
          "Configure your OpenAI API key in the chat UI settings first.",
        );

        return;
      }

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
        });

        // Construct the transport with no options. The SDK calls
        // getUserMedia({ audio: true }) (default constraints — browser/OS-level
        // AEC is on by default on macOS and modern Chromium/Safari) and creates
        // its own <audio> element for playback. This matches the canonical
        // realtime-next example.
        const transport = new OpenAIRealtimeWebRTC();

        const session = new RealtimeSession(agent, {
          model: OPENAI_REALTIME_MODEL,
          transport,
        });

        session.on("history_updated", (next: RealtimeItem[]) => {
          setHistory([...next]);
        });

        session.on("transport_event", (event: TransportEvent) => {
          // High-frequency stream — log to console (devtools filter "[voice]"),
          // not React state, to avoid re-rendering on every delta.
          console.debug("[voice]", event.type, event);

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
          const inner = err.error;

          setError(inner instanceof Error ? inner.message : String(inner));
        });

        // eslint-disable-next-line require-atomic-updates -- ref is not subject to React batching
        sessionRef.current = session;

        const token = await fetchEphemeralToken(voiceTokenUrl, openAiKey);

        await session.connect({ apiKey: token });

        if (initialHistory && initialHistory.length > 0) {
          // The SDK's resetHistory only echoes "message" items back to the
          // server — function_call/mcp_call items are dropped. Filter to avoid
          // SDK warnings and rely on the saved record for tool-call review.
          const primable = initialHistory.filter((i) => i.type === "message");

          if (primable.length > 0) session.updateHistory(primable);
        }

        setStatus("connected");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        setStatus("error");
        setError(message);
        await cleanup();
      }
    },
    [mcpUrl, voiceTokenUrl, openAiKey, enabledTools, cleanup],
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
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
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
  };
}

/**
 * Fetch an ephemeral `ek_...` token from the backend proxy.
 *
 * @param voiceTokenUrl - URL of the /voice-token endpoint
 * @param openAiKey - User's OpenAI API key (sent in X-OpenAI-Key header)
 * @returns The ephemeral client secret value
 */
async function fetchEphemeralToken(
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

interface ResponseFailure {
  code: string;
  message: string;
}

/**
 * Inspect a transport `response.done` event for a failure status and return
 * the structured error. Returns null for successful responses.
 *
 * @param event - The transport event payload
 * @returns Failure code + message, or null
 */
function extractResponseFailure(event: unknown): ResponseFailure | null {
  const e = event as {
    response?: {
      status?: string;
      status_details?: { error?: { code?: string; message?: string } };
    };
  };

  const response = e.response;

  if (response?.status !== "failed") return null;
  const err = response.status_details?.error;

  return {
    code: err?.code ?? "unknown",
    message: err?.message ?? err?.code ?? "Response failed",
  };
}

/**
 * Parse "...Please try again in 15.796s..." from an OpenAI rate-limit message.
 *
 * @param message - The rate-limit error message
 * @returns Seconds to wait, or null if not parseable
 */
function parseRetrySeconds(message: string): number | null {
  const match = /try again in ([\d.]+)s/i.exec(message);

  if (!match?.[1]) return null;
  const seconds = Number.parseFloat(match[1]);

  return Number.isFinite(seconds) ? seconds : null;
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
