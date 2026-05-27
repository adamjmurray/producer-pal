// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LiveServerMessage, type Session } from "@google/genai";
import { type RealtimeItem } from "@openai/agents/realtime";
import {
  beginGeminiHalfDuplexMute,
  type BooleanRef,
  endGeminiHalfDuplexMute,
  type MutableMic,
} from "#webui/hooks/voice/gemini/gemini-half-duplex-helpers";
import { type GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import { type GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { extractErrorMessage } from "#webui/hooks/voice/use-voice-session-helpers";

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
  /** True when barge-in is disabled — auto-mute the mic per assistant turn. */
  halfDuplex: boolean;
  /** Mic instance (null after teardown / before mic.start completes). */
  getMic: () => MutableMic | null;
  /** Flags an active half-duplex auto-mute so turn-end can lift it. */
  autoMutedRef: BooleanRef;
  /** Mirrors the user's manual mute, restored when an auto-mute lifts. */
  isMutedRef: BooleanRef;
}

/** Inputs buildGeminiMessageDeps assembles into a GeminiMessageDeps bag. */
export interface GeminiMessageDepsOptions {
  builder: GeminiHistoryBuilder;
  builderRef: { current: GeminiHistoryBuilder | null };
  player: GeminiPcmPlayer;
  getSession: () => Session | null;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  setHistory: (items: RealtimeItem[]) => void;
  setAssistantSpeaking: (value: boolean) => void;
  setAssistantThinking: (value: boolean) => void;
  setError: (value: string | null) => void;
  setResumeHandle: (handle: string) => void;
  halfDuplex: boolean;
  getMic: () => MutableMic | null;
  autoMutedRef: BooleanRef;
  isMutedRef: BooleanRef;
}

/**
 * Assemble a GeminiMessageDeps bag for handleGeminiMessage. publishHistory
 * checks the builder is still the active one (the hook's reset path may have
 * orphaned it) before pushing items to React state.
 *
 * @param o - The hook's locals, refs, and state setters
 * @returns A complete GeminiMessageDeps
 */
export function buildGeminiMessageDeps(
  o: GeminiMessageDepsOptions,
): GeminiMessageDeps {
  return {
    builder: o.builder,
    player: o.player,
    getSession: o.getSession,
    executeTool: o.executeTool,
    publishHistory: () => {
      if (o.builderRef.current === o.builder)
        o.setHistory(o.builder.toRealtimeItems());
    },
    setAssistantSpeaking: o.setAssistantSpeaking,
    setAssistantThinking: o.setAssistantThinking,
    setError: o.setError,
    setResumeHandle: o.setResumeHandle,
    halfDuplex: o.halfDuplex,
    getMic: o.getMic,
    autoMutedRef: o.autoMutedRef,
    isMutedRef: o.isMutedRef,
  };
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
      endGeminiHalfDuplexMute(
        deps.getMic(),
        deps.autoMutedRef,
        deps.isMutedRef,
      );
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
        beginGeminiHalfDuplexMute(
          deps.getMic(),
          deps.autoMutedRef,
          deps.halfDuplex,
        );
      }
    }

    if (sc.turnComplete) {
      deps.builder.completeTurn();
      deps.setAssistantSpeaking(false);
      endGeminiHalfDuplexMute(
        deps.getMic(),
        deps.autoMutedRef,
        deps.isMutedRef,
      );
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
