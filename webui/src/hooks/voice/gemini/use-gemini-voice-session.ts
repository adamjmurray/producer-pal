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
import { buildGeminiMessageDeps } from "#webui/hooks/voice/gemini/gemini-message-handler";
import { GeminiMicCapture } from "#webui/hooks/voice/gemini/gemini-mic-capture";
import { GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import { GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { fetchGeminiToken } from "#webui/hooks/voice/gemini/gemini-voice-token";
import {
  closeQuietly,
  createGenAIClient,
  GEMINI_INPUT_MIME_TYPE,
  openResumableGeminiSession,
  type ResumeState,
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
 * resumed after teardown bails instead of leaking a socket + mic). The Live API
 * caps a connection at ~10–15 min; session resumption (in
 * openResumableGeminiSession) reconnects with the server-issued handle on an
 * unexpected drop, keeping the mic/player/MCP/transcript so long chats survive.
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
  // True while a half-duplex (barge-in disabled) response has the mic
  // auto-muted, so the next turn-end / interruption knows to lift it back to
  // the user's manual state.
  const autoMutedRef = useRef(false);
  // Resumption handle + consecutive failed-attempts counter, reset per Talk.
  const resumeRef = useRef<ResumeState>({ handle: null, attempts: 0 });
  // Per-session generation counter shared across the recursive
  // openResumableGeminiSession calls; lets a stale session's late onclose
  // recognize it's been replaced and bail before triggering another resume.
  const sessionGenRef = useRef(0);

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
    await closeSessionAndMcp(session, mcp);

    setAssistantSpeaking(false);
    setAssistantThinking(false);
    setActiveVoice(null);
    setIsMuted(false);
    isMutedRef.current = false;
    autoMutedRef.current = false;
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
      resumeRef.current = { handle: null, attempts: 0 };
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
        // Assign BEFORE the await: a teardown that races resume() must be able
        // to see this player and close its AudioContext. Browsers cap at ~4–6
        // contexts and an orphan would also keep the tab alive across HMR.
        playerRef.current = player;
        await player.resume();
        if (stale()) return void (await cleanup());

        // turn-detection is fixed for the session (changes apply on the next
        // Stop → Talk), so the half-duplex flag is too — mirrors the OpenAI hook.
        const deps = buildGeminiMessageDeps({
          builder,
          builderRef,
          player,
          getSession: () => sessionRef.current,
          executeTool,
          setHistory,
          setAssistantSpeaking,
          setAssistantThinking,
          setError,
          setResumeHandle: (handle: string) => {
            resumeRef.current.handle = handle;
          },
          halfDuplex: turnDetection?.interruptResponse === false,
          getMic: () => micRef.current,
          autoMutedRef,
          isMutedRef,
        });

        const handleDrop = (message: string): void => {
          if (intentionalCloseRef.current) return;
          void cleanup().then(() => {
            setStatus("error");
            setError(message);
          });
        };

        const ai = createGenAIClient(credential);

        const session = await openResumableGeminiSession({
          ai,
          model,
          voice,
          vad: turnDetection,
          functionDeclarations,
          deps,
          resumeRef,
          sessionGenRef,
          isStale: stale,
          isIntentionalClose: () => intentionalCloseRef.current,
          onSession: (s) => {
            sessionRef.current = s;
            // intentionalCloseRef tracks active user intent; the per-session
            // sentinel (sessionGenRef) governs stale callbacks. Clearing it
            // here keeps the flag from carrying a stale "true" across a
            // successful resume (it can only be true here if a prior failed
            // resume set it, but the next resume succeeds).
            intentionalCloseRef.current = false;
          },
          onDrop: handleDrop,
        });

        if (stale()) {
          closeQuietly(session);

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

        // If cleanup() ran during mic.start(), it stopped a partial mic and
        // didn't see the resources mic.start() set up afterward. Stop the
        // orphan locally — cleanup() already ran the rest of teardown.
        if (stale()) return void (await mic.stop());

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
    // Mutate in place rather than replace: handleGeminiToolCall closes over the
    // builder, and replacing the ref would route in-flight tool output to an
    // orphan that publishHistory's identity check drops, hiding it from the UI.
    builderRef.current?.reset();
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

/**
 * Best-effort teardown of the live session + MCP client. A close that throws
 * shouldn't stall the rest of cleanup (the refs are already nulled), so each is
 * swallowed individually.
 *
 * @param session - The live session, or null
 * @param mcp - The MCP client, or null
 */
async function closeSessionAndMcp(
  session: Session | null,
  mcp: Client | null,
): Promise<void> {
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
}
