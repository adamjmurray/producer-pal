// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Session } from "@google/genai";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type GeminiVadSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { createGeminiMcpTools } from "#webui/hooks/voice/gemini/gemini-mcp-tools";
import { GeminiMicCapture } from "#webui/hooks/voice/gemini/gemini-mic-capture";
import { GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import { GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { fetchGeminiToken } from "#webui/hooks/voice/gemini/gemini-voice-token";
import {
  buildGeminiConfig,
  createGenAIClient,
  GEMINI_INPUT_MIME_TYPE,
  type GeminiMessageDeps,
  handleGeminiMessage,
  seedGeminiContext,
} from "#webui/hooks/voice/gemini/use-gemini-voice-session-helpers";
import {
  type UseVoiceSessionReturn,
  type VoiceStatus,
} from "#webui/hooks/voice/use-voice-session";
import { extractErrorMessage } from "#webui/hooks/voice/use-voice-session-helpers";

export interface UseGeminiVoiceSessionParams {
  mcpUrl: string;
  /** URL of the /gemini-voice-token proxy endpoint. */
  voiceTokenUrl: string;
  geminiKey: string | null;
  /** Gemini Live model id for the session. */
  model: string;
  enabledTools?: Record<string, boolean>;
  /** Prebuilt Gemini voice name; locked at connect (applied on next Stop → Talk). */
  voice?: string;
  /** Output playback volume (live; applied to the GainNode immediately). */
  volume?: number;
  /** Gemini VAD/turn-detection settings; read at connect (next Stop → Talk). */
  turnDetection?: GeminiVadSettings;
}

/**
 * Gemini Live counterpart to useVoiceSession (OpenAI). Returns the identical
 * UseVoiceSessionReturn contract so use-voice-mode-state can drive either
 * backend interchangeably. Where the OpenAI hook leans on @openai/agents
 * (RealtimeSession owns audio, history, and the tool loop), this drives a raw
 * WebSocket: GeminiMicCapture streams 16 kHz PCM in, GeminiPcmPlayer schedules
 * 24 kHz PCM out gaplessly, GeminiHistoryBuilder synthesizes the transcript, and
 * the MCP tool loop is explicit. Reentrancy is guarded the same way (a
 * connecting flag plus a generation counter that a teardown bumps so a connect()
 * resumed after teardown bails instead of leaking a socket + mic).
 *
 * @param params - Hook parameters
 * @returns Voice session state and controls
 */
export function useGeminiVoiceSession(
  params: UseGeminiVoiceSessionParams,
): UseVoiceSessionReturn {
  const {
    mcpUrl,
    voiceTokenUrl,
    geminiKey,
    model,
    enabledTools,
    voice,
    volume,
    turnDetection,
  } = params;

  const sessionRef = useRef<Session | null>(null);
  const micRef = useRef<GeminiMicCapture | null>(null);
  const playerRef = useRef<GeminiPcmPlayer | null>(null);
  const mcpClientRef = useRef<Client | null>(null);
  const builderRef = useRef<GeminiHistoryBuilder | null>(null);
  const connectingRef = useRef(false);
  const connectGenRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const isMutedRef = useRef(false);

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RealtimeItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [activeVoice, setActiveVoice] = useState<string | null>(null);

  const cleanup = useCallback(async () => {
    intentionalCloseRef.current = true;
    const session = sessionRef.current;
    const mcp = mcpClientRef.current;
    const mic = micRef.current;
    const player = playerRef.current;

    sessionRef.current = null;
    mcpClientRef.current = null;
    micRef.current = null;
    playerRef.current = null;
    builderRef.current = null;
    connectingRef.current = false;
    // Invalidate any connect() suspended on an await so it bails on resume.
    connectGenRef.current++;

    await mic?.stop();
    await player?.close();

    try {
      session?.close();
    } catch {
      // best-effort
    }

    try {
      await mcp?.close();
    } catch {
      // best-effort
    }

    setAssistantSpeaking(false);
    setAssistantThinking(false);
    setActiveVoice(null);
    setIsMuted(false);
    isMutedRef.current = false;
  }, []);

  const connect = useCallback(
    async (initialHistory?: RealtimeItem[]) => {
      // connectingRef alone guards reentrancy: it's set true here and only
      // cleared by cleanup() (disconnect/error), so it stays true while
      // connected too. Deliberately NOT reading sessionRef.current here —
      // reading it before the awaits and assigning it after would trip the
      // require-atomic-updates rule (which the OpenAI hook suppresses; we avoid
      // needing a suppression instead).
      if (connectingRef.current) return;

      if (!geminiKey) {
        setStatus("error");
        setError(
          "Configure your Gemini API key in the chat UI settings first.",
        );

        return;
      }

      connectingRef.current = true;
      const myGen = connectGenRef.current;
      const stale = (): boolean => connectGenRef.current !== myGen;

      intentionalCloseRef.current = false;
      setStatus("connecting");
      setError(null);
      setHistory([]);
      const builder = new GeminiHistoryBuilder();

      builderRef.current = builder;

      try {
        const { functionDeclarations, executeTool, mcpClient } =
          await createGeminiMcpTools(mcpUrl, enabledTools);

        mcpClientRef.current = mcpClient;
        if (stale()) return void (await cleanup());

        const credential = await fetchGeminiToken(
          voiceTokenUrl,
          geminiKey,
          model,
        );

        if (stale()) return void (await cleanup());

        const player = new GeminiPcmPlayer();

        player.setVolume(volume ?? 1);
        await player.resume();
        playerRef.current = player;

        const deps: GeminiMessageDeps = {
          builder,
          player,
          getSession: () => sessionRef.current,
          executeTool,
          publishHistory: () => {
            if (builderRef.current === builder)
              setHistory(builder.toRealtimeItems());
          },
          setAssistantSpeaking,
          setAssistantThinking,
          setError,
        };

        const handleDrop = (message: string): void => {
          if (intentionalCloseRef.current) return;
          void cleanup().then(() => {
            setStatus("error");
            setError(message);
          });
        };

        const ai = createGenAIClient(credential);

        const session = await ai.live.connect({
          model,
          callbacks: {
            onopen: () => {},
            onmessage: (m) => void handleGeminiMessage(m, deps),
            onerror: (e) =>
              handleDrop(extractErrorMessage(e) || "Voice connection error."),
            onclose: () =>
              handleDrop("Connection lost. Press Talk to reconnect."),
          },
          config: buildGeminiConfig({
            voice,
            functionDeclarations,
            vad: turnDetection,
          }),
        });

        if (stale()) {
          try {
            session.close();
          } catch {
            // best-effort
          }

          return void (await cleanup());
        }

        sessionRef.current = session;

        const mic = new GeminiMicCapture();

        micRef.current = mic;
        mic.setMuted(isMutedRef.current);
        await mic.start({
          onChunk: (data) => {
            try {
              sessionRef.current?.sendRealtimeInput({
                audio: { data, mimeType: GEMINI_INPUT_MIME_TYPE },
              });
            } catch {
              // a chunk racing teardown — drop it
            }
          },
        });

        if (stale()) return void (await cleanup());

        seedGeminiContext(session, initialHistory);
        setActiveVoice(voice ?? null);
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
      geminiKey,
      model,
      enabledTools,
      voice,
      volume,
      turnDetection,
      cleanup,
    ],
  );

  const disconnect = useCallback(async () => {
    setStatus("disconnecting");
    await cleanup();
    setStatus("idle");
  }, [cleanup]);

  const toggleMute = useCallback(async () => {
    const mic = micRef.current;

    if (!mic) return;
    const next = !isMuted;

    mic.setMuted(next);
    isMutedRef.current = next;
    setIsMuted(next);
  }, [isMuted]);

  // Manual interrupt: flush local playback and close the open model turn. (Gemini
  // also auto-interrupts on barge-in via server VAD; this is the explicit button.)
  const interrupt = useCallback(() => {
    playerRef.current?.flush();

    if (builderRef.current) {
      builderRef.current.completeTurn();
      setHistory(builderRef.current.toRealtimeItems());
    }

    setAssistantSpeaking(false);
  }, []);

  // Gemini responds automatically and has no OpenAI-style rate-limit retry, so
  // this just clears any error banner to satisfy the shared contract.
  const retryResponse = useCallback(() => setError(null), []);

  const resetHistory = useCallback(() => {
    builderRef.current = sessionRef.current ? new GeminiHistoryBuilder() : null;
    setHistory([]);
  }, []);

  useEffect(() => {
    playerRef.current?.setVolume(volume ?? 1);
  }, [volume]);

  useEffect(() => () => void cleanup(), [cleanup]);

  return {
    status,
    error,
    history,
    isMuted,
    assistantSpeaking,
    assistantThinking,
    rateLimitedUntil: null,
    connect,
    disconnect,
    toggleMute,
    interrupt,
    retryResponse,
    resetHistory,
    activeVoice,
  };
}
