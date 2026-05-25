// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ActivityHandling,
  EndSensitivity,
  type FunctionDeclaration,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type RealtimeInputConfig,
  type Session,
  StartSensitivity,
} from "@google/genai";
import { type RealtimeItem } from "@openai/agents/realtime";
import { type GeminiVadSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { type GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import { type GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { type GeminiVoiceCredential } from "#webui/hooks/voice/gemini/gemini-voice-token";
import { extractErrorMessage } from "#webui/hooks/voice/use-voice-session-helpers";
import { DEFAULT_GEMINI_REALTIME_VOICE } from "#webui/lib/constants/models";

/** Mic input format Gemini Live expects (raw 16-bit PCM, 16 kHz, mono, LE). */
export const GEMINI_INPUT_MIME_TYPE = "audio/pcm;rate=16000";

export const GEMINI_AGENT_INSTRUCTIONS = [
  "You are Producer Pal, an AI music production assistant working with the user in Ableton Live.",
  "Always speak and respond in English. Interpret all user audio as English, even if a short utterance sounds ambiguous.",
  "Before responding to the user's first request, call the ppal-connect tool to load the latest Producer Pal skills and current project context.",
  "Keep voice responses brief and conversational. When tool calls take a moment, you may narrate what you are doing so the user knows you are working.",
].join(" ");

/**
 * Build the Live API session config: audio-out, the system instruction, the
 * MCP function declarations, the selected voice, input/output transcription
 * (off by default on Gemini — we need both to render the transcript UI), the
 * VAD/turn-detection config when provided, and session resumption (always on, so
 * the server issues handles we can reconnect with after the ~10–15 min cap).
 *
 * @param opts - Voice id, the MCP function declarations, and optional VAD config
 * @param opts.voice - Prebuilt Gemini voice name (defaults to Puck)
 * @param opts.functionDeclarations - MCP tools as Gemini declarations
 * @param opts.vad - Gemini VAD settings; when omitted, Live API defaults apply
 * @param opts.resumeHandle - Prior session's resumption handle; omit for a fresh
 *   session (still enables resumption so the server starts issuing handles)
 * @returns The LiveConnectConfig
 */
export function buildGeminiConfig(opts: {
  voice: string | undefined;
  functionDeclarations: FunctionDeclaration[];
  vad?: GeminiVadSettings;
  resumeHandle?: string;
}): LiveConnectConfig {
  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: GEMINI_AGENT_INSTRUCTIONS,
    tools: [{ functionDeclarations: opts.functionDeclarations }],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: opts.voice ?? DEFAULT_GEMINI_REALTIME_VOICE,
        },
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
  };

  if (opts.vad) config.realtimeInputConfig = buildRealtimeInputConfig(opts.vad);

  return config;
}

/**
 * Map the UI VAD settings to Gemini's realtimeInputConfig: start/end-of-speech
 * sensitivity, silence + prefix-padding windows, and barge-in via
 * activityHandling (NO_INTERRUPTION when barge-in is off).
 *
 * @param vad - Gemini VAD settings
 * @returns The realtimeInputConfig payload
 */
function buildRealtimeInputConfig(vad: GeminiVadSettings): RealtimeInputConfig {
  return {
    automaticActivityDetection: {
      startOfSpeechSensitivity:
        vad.startSensitivity === "high"
          ? StartSensitivity.START_SENSITIVITY_HIGH
          : StartSensitivity.START_SENSITIVITY_LOW,
      endOfSpeechSensitivity:
        vad.endSensitivity === "high"
          ? EndSensitivity.END_SENSITIVITY_HIGH
          : EndSensitivity.END_SENSITIVITY_LOW,
      prefixPaddingMs: vad.prefixPaddingMs,
      silenceDurationMs: vad.silenceDurationMs,
    },
    activityHandling: vad.interruptResponse
      ? ActivityHandling.START_OF_ACTIVITY_INTERRUPTS
      : ActivityHandling.NO_INTERRUPTION,
  };
}

/**
 * Construct the GoogleGenAI client for a Live session. Ephemeral tokens are only
 * valid on the v1alpha API, so the API version is pinned accordingly; a raw key
 * uses the default version.
 *
 * @param credential - The Gemini voice credential (raw key or ephemeral token)
 * @returns A configured GoogleGenAI client
 */
export function createGenAIClient(
  credential: GeminiVoiceCredential,
): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: credential.value,
    ...(credential.ephemeral ? { httpOptions: { apiVersion: "v1alpha" } } : {}),
  });
}

/** Connection state + lifecycle callbacks openResumableGeminiSession needs. */
export interface ResumableSessionContext {
  /** The GenAI client (carries the credential and API version). */
  ai: GoogleGenAI;
  /** Gemini Live model id. */
  model: string;
  /** Prebuilt voice name, or undefined for the default. */
  voice: string | undefined;
  /** VAD/turn-detection settings, or undefined for Live API defaults. */
  vad: GeminiVadSettings | undefined;
  /** MCP tools exposed to the model. */
  functionDeclarations: FunctionDeclaration[];
  /** Message-handler deps (history builder, player, tool loop, UI setters). */
  deps: GeminiMessageDeps;
  /** Holds the latest server-issued resumption handle (null before the first). */
  resumeHandleRef: { current: string | null };
  /** True once teardown bumped the connect generation. */
  isStale: () => boolean;
  /** True when we initiated the close (disconnect/cleanup). */
  isIntentionalClose: () => boolean;
  /** Install a freshly (re)connected session as the active one. */
  onSession: (session: Session) => void;
  /** Report an unrecoverable drop (no handle, or a failed resume). */
  onDrop: (message: string) => void;
}

/**
 * Open a Gemini Live session that transparently resumes after a server-initiated
 * drop. The Live API caps connection duration (~10–15 min) and periodically
 * issues resumption handles (captured by handleGeminiMessage); when the socket
 * closes or errors and a handle is available, this reconnects with it and swaps
 * the new session in without tearing down the mic, player, MCP client, or
 * transcript. A per-session `dropHandled` flag collapses the onerror+onclose pair
 * a dead socket fires (and ignores a late callback from a session we've already
 * replaced) so one drop triggers exactly one resume.
 *
 * @param ctx - Connection state and lifecycle callbacks
 * @returns The connected Live session
 */
export async function openResumableGeminiSession(
  ctx: ResumableSessionContext,
): Promise<Session> {
  let dropHandled = false;

  const handleClose = (fallback: string): void => {
    if (dropHandled || ctx.isIntentionalClose() || ctx.isStale()) return;
    dropHandled = true;
    void resumeOrFail(ctx, fallback);
  };

  return await ctx.ai.live.connect({
    model: ctx.model,
    callbacks: {
      onopen: () => {},
      onmessage: (m) => void handleGeminiMessage(m, ctx.deps),
      onerror: (e) =>
        handleClose(extractErrorMessage(e) || "Voice connection error."),
      onclose: () => handleClose("Connection lost. Press Talk to reconnect."),
    },
    config: buildGeminiConfig({
      voice: ctx.voice,
      functionDeclarations: ctx.functionDeclarations,
      vad: ctx.vad,
      resumeHandle: ctx.resumeHandleRef.current ?? undefined,
    }),
  });
}

/**
 * Resume the session from the stored handle, or report an unrecoverable drop.
 * Without a handle (none issued yet) there is nothing to resume, so the drop is
 * surfaced with the original message. A resume that races teardown closes the
 * fresh session instead of leaking it.
 *
 * @param ctx - Connection state and lifecycle callbacks
 * @param fallbackMessage - Drop message used when no handle is available
 */
async function resumeOrFail(
  ctx: ResumableSessionContext,
  fallbackMessage: string,
): Promise<void> {
  if (!ctx.resumeHandleRef.current) {
    ctx.onDrop(fallbackMessage);

    return;
  }

  try {
    const session = await openResumableGeminiSession(ctx);

    if (ctx.isStale() || ctx.isIntentionalClose()) {
      closeQuietly(session);

      return;
    }

    ctx.onSession(session);
  } catch (err) {
    ctx.onDrop(extractErrorMessage(err));
  }
}

/**
 * Close a session, swallowing any error (best-effort teardown).
 * @param session - The session to close
 */
export function closeQuietly(session: Session): void {
  try {
    session.close();
  } catch {
    // best-effort
  }
}

/** Dependencies handleGeminiMessage needs from the hook. */
export interface GeminiMessageDeps {
  builder: GeminiHistoryBuilder;
  player: GeminiPcmPlayer;
  /** The live session (for sendToolResponse); null after teardown. */
  getSession: () => Session | null;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Push the builder's current items to React state. */
  publishHistory: () => void;
  setAssistantSpeaking: (value: boolean) => void;
  setAssistantThinking: (value: boolean) => void;
  setError: (value: string | null) => void;
  /** Store the latest server-issued session-resumption handle. */
  setResumeHandle: (handle: string) => void;
}

/**
 * Translate one Live server message into transcript/audio/tool side effects.
 * The WebSocket transport hands us raw deltas — transcripts, audio chunks, tool
 * calls, and turn/interrupt signals — which we fold into the history builder,
 * the gapless player, and the UI flags. The OpenAI SDK did all of this
 * internally; here it is explicit.
 *
 * @param message - The Live server message
 * @param deps - Builder, player, tool dispatcher, and UI setters
 */
export async function handleGeminiMessage(
  message: LiveServerMessage,
  deps: GeminiMessageDeps,
): Promise<void> {
  const resumption = message.sessionResumptionUpdate;

  if (resumption?.resumable && resumption.newHandle) {
    deps.setResumeHandle(resumption.newHandle);
  }

  const sc = message.serverContent;

  if (sc) {
    if (sc.interrupted) {
      // Barge-in: drop queued audio and close the open model turn.
      deps.player.flush();
      deps.builder.completeTurn();
      deps.setAssistantSpeaking(false);
      deps.publishHistory();
    }

    if (sc.inputTranscription?.text) {
      deps.builder.addUserTranscript(sc.inputTranscription.text);
      deps.publishHistory();
    }

    if (sc.outputTranscription?.text) {
      deps.builder.addAssistantTranscript(sc.outputTranscription.text);
      deps.publishHistory();
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;

      if (data) {
        deps.player.enqueueBase64(data);
        deps.setAssistantSpeaking(true);
      }
    }

    if (sc.turnComplete) {
      deps.builder.completeTurn();
      deps.setAssistantSpeaking(false);
      deps.publishHistory();
    }
  }

  if (message.toolCall) {
    await handleGeminiToolCall(message.toolCall, deps);
  }
}

/**
 * Run each function call the model requested through the MCP dispatcher and send
 * the results back with matching ids. Errors come back from executeTool as a
 * string (never a throw), so a failing tool is reported to the model as output
 * it can recover from rather than wedging the session.
 *
 * @param toolCall - The server tool-call message
 * @param deps - Builder, tool dispatcher, session accessor, and UI setters
 */
async function handleGeminiToolCall(
  toolCall: NonNullable<LiveServerMessage["toolCall"]>,
  deps: GeminiMessageDeps,
): Promise<void> {
  deps.setAssistantThinking(true);

  const functionResponses = [];

  for (const fc of toolCall.functionCalls ?? []) {
    const name = fc.name ?? "";
    const id = fc.id ?? name;
    const args = fc.args ?? {};

    deps.builder.addToolCall(id, name, args);
    deps.publishHistory();

    const output = await deps.executeTool(name, args);

    deps.builder.setToolOutput(id, output);
    deps.publishHistory();
    functionResponses.push({ id: fc.id, name, response: { output } });
  }

  try {
    deps.getSession()?.sendToolResponse({ functionResponses });
  } catch (err) {
    deps.setError(extractErrorMessage(err));
  }

  deps.setAssistantThinking(false);
}

/**
 * Seed prior conversation context onto a fresh Gemini session so continuing a
 * saved voice chat keeps the model's memory. Unlike the OpenAI SDK's
 * updateHistory, Gemini has no item-replay API — we send the saved transcript
 * as a single text turn (turnComplete:false so it becomes context without
 * triggering a spoken reply). Tool calls and audio bytes are not replayable, so
 * only message transcripts are carried.
 *
 * @param session - The connected Live session
 * @param initialHistory - Saved history to seed, or undefined
 */
export function seedGeminiContext(
  session: Pick<Session, "sendClientContent">,
  initialHistory: RealtimeItem[] | undefined,
): void {
  if (!initialHistory || initialHistory.length === 0) return;
  const transcript = transcriptText(initialHistory);

  if (!transcript) return;

  session.sendClientContent({
    turns: [
      {
        role: "user",
        parts: [
          {
            text: `Here is the transcript of our conversation so far, for context. Do not respond to it; just continue from here.\n\n${transcript}`,
          },
        ],
      },
    ],
    turnComplete: false,
  });
}

/**
 * Flatten saved message items into a "Speaker: text" transcript for seeding.
 *
 * @param items - Saved history items
 * @returns Newline-joined transcript, or empty string
 */
function transcriptText(items: RealtimeItem[]): string {
  const lines: string[] = [];

  for (const item of items) {
    if (item.type !== "message") continue;
    if (item.role === "system") continue;
    const text = item.content
      .map((c) =>
        "text" in c ? c.text : "transcript" in c ? (c.transcript ?? "") : "",
      )
      .filter(Boolean)
      .join(" ");

    if (text) lines.push(`${item.role === "user" ? "User" : "You"}: ${text}`);
  }

  return lines.join("\n");
}
