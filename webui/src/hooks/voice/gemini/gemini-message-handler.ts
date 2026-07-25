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
import { extractErrorMessage } from "#webui/hooks/voice/helpers/use-voice-session-helpers";

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

/**
 * Inputs buildGeminiMessageDeps assembles into a GeminiMessageDeps bag: every
 * dep passed straight through, with `publishHistory` replaced by the pieces it
 * is built from.
 */
export interface GeminiMessageDepsOptions extends Omit<
  GeminiMessageDeps,
  "publishHistory"
> {
  builderRef: { current: GeminiHistoryBuilder | null };
  setHistory: (items: RealtimeItem[]) => void;
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
    if (sc.interrupted) handleGeminiInterrupt(deps);

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
 * Handle a barge-in `interrupted` signal: drop queued audio, close the open turn,
 * and lift the half-duplex auto-mute. Exception: under NO_INTERRUPTION
 * (half-duplex) the model can emit `interrupted` mid-stream and keep sending
 * audio, so lifting the auto-mute while audio is still queued would let the next
 * chunk re-mute and flicker the Muted indicator. There, defer the lift to
 * turnComplete; lift now only when the queue has drained (the turn really ended
 * here). hasQueued() is read before flush() clears the queue.
 *
 * @param deps - Builder, player, mic accessor, and UI setters
 */
function handleGeminiInterrupt(deps: GeminiMessageDeps): void {
  const audioStillQueued = deps.player.hasQueued();

  deps.player.flush();
  deps.builder.completeTurn();
  deps.setAssistantSpeaking(false);

  if (!(deps.halfDuplex && audioStillQueued)) {
    endGeminiHalfDuplexMute(deps.getMic(), deps.autoMutedRef, deps.isMutedRef);
  }

  deps.publishHistory();
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
