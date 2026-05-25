// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  type LiveServerMessage,
  type Session,
  StartSensitivity,
} from "@google/genai";
import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it, vi } from "vitest";
import { type GeminiVadSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { type GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import {
  buildGeminiConfig,
  createGenAIClient,
  type GeminiMessageDeps,
  handleGeminiMessage,
  seedGeminiContext,
} from "#webui/hooks/voice/gemini/use-gemini-voice-session-helpers";

/**
 * Build message-handler deps with spy-able fakes (a real history builder, a fake
 * player, and an injectable session/tool dispatcher).
 * @param overrides - Partial deps to override
 * @returns The deps plus the fakes for assertions
 */
function makeDeps(overrides: Partial<GeminiMessageDeps> = {}) {
  const player = {
    flush: vi.fn(),
    enqueueBase64: vi.fn(),
  } as unknown as GeminiPcmPlayer;
  const sendToolResponse = vi.fn();
  const session = { sendToolResponse } as unknown as Session;
  const deps: GeminiMessageDeps = {
    builder: new GeminiHistoryBuilder(),
    player,
    getSession: () => session,
    executeTool: vi.fn(async () => "tool-output"),
    publishHistory: vi.fn(),
    setAssistantSpeaking: vi.fn(),
    setAssistantThinking: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };

  return { deps, player, sendToolResponse, session };
}

/**
 * Cast a partial message literal to LiveServerMessage (a class with text/data
 * getters that plain object literals can't satisfy structurally).
 * @param partial - The message fields under test
 * @returns The same value typed as LiveServerMessage
 */
function msg(partial: Partial<LiveServerMessage>): LiveServerMessage {
  return partial as LiveServerMessage;
}

describe("buildGeminiConfig", () => {
  it("sets audio modality, voice, tools, and transcription", () => {
    const config = buildGeminiConfig({
      voice: "Charon",
      functionDeclarations: [{ name: "ppal-x" }],
    });

    expect(config.responseModalities).toStrictEqual(["AUDIO"]);
    expect(
      config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    ).toBe("Charon");
    expect(config.tools).toStrictEqual([
      { functionDeclarations: [{ name: "ppal-x" }] },
    ]);
    expect(config.inputAudioTranscription).toStrictEqual({});
    expect(config.outputAudioTranscription).toStrictEqual({});
    expect(typeof config.systemInstruction).toBe("string");
  });

  it("falls back to the default voice when none is given", () => {
    const config = buildGeminiConfig({
      voice: undefined,
      functionDeclarations: [],
    });

    expect(
      config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    ).toBe("Puck");
  });

  it("omits realtimeInputConfig when no VAD settings are given", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
    });

    expect(config.realtimeInputConfig).toBeUndefined();
  });

  it("maps high-sensitivity VAD with barge-in on", () => {
    const vad: GeminiVadSettings = {
      startSensitivity: "high",
      endSensitivity: "high",
      silenceDurationMs: 500,
      prefixPaddingMs: 100,
      interruptResponse: true,
    };

    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      vad,
    });

    expect(config.realtimeInputConfig).toStrictEqual({
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: 500,
      },
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    });
  });

  it("maps low-sensitivity VAD with barge-in off to NO_INTERRUPTION", () => {
    const vad: GeminiVadSettings = {
      startSensitivity: "low",
      endSensitivity: "low",
      silenceDurationMs: 800,
      prefixPaddingMs: 20,
      interruptResponse: false,
    };

    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      vad,
    });

    expect(config.realtimeInputConfig).toStrictEqual({
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: 20,
        silenceDurationMs: 800,
      },
      activityHandling: ActivityHandling.NO_INTERRUPTION,
    });
  });
});

describe("createGenAIClient", () => {
  it("builds a client for a raw key (default API version)", () => {
    const client = createGenAIClient({ value: "raw-key", ephemeral: false });

    expect(client).toBeInstanceOf(GoogleGenAI);
  });

  it("builds a client for an ephemeral token (v1alpha)", () => {
    const client = createGenAIClient({ value: "ephemeral", ephemeral: true });

    expect(client).toBeInstanceOf(GoogleGenAI);
  });
});

describe("handleGeminiMessage", () => {
  it("appends input transcription to history", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { inputTranscription: { text: "hello" } } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toMatchObject({ role: "user" });
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("appends output transcription and enqueues audio", async () => {
    const { deps, player } = makeDeps();

    await handleGeminiMessage(
      msg({
        serverContent: {
          outputTranscription: { text: "hi" },
          modelTurn: { parts: [{ inlineData: { data: "BASE64" } }] },
        },
      }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toMatchObject({
      role: "assistant",
    });
    expect(player.enqueueBase64).toHaveBeenCalledWith("BASE64");
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(true);
  });

  it("ignores model-turn parts that carry no audio data", async () => {
    const { deps, player } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { modelTurn: { parts: [{ text: "no audio" }] } } }),
      deps,
    );

    expect(player.enqueueBase64).not.toHaveBeenCalled();
  });

  it("flushes playback and stops speaking on interruption", async () => {
    const { deps, player } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { interrupted: true } }),
      deps,
    );

    expect(player.flush).toHaveBeenCalled();
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
  });

  it("stops speaking on turnComplete", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { turnComplete: true } }),
      deps,
    );

    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("ignores a message with no serverContent or toolCall", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(msg({ setupComplete: {} }), deps);

    expect(deps.publishHistory).not.toHaveBeenCalled();
  });

  it("runs a tool call and sends the response with matching id", async () => {
    const executeTool = vi.fn(async () => "Tempo updated.");
    const { deps, sendToolResponse } = makeDeps({ executeTool });

    const message = msg({
      toolCall: {
        functionCalls: [
          { id: "c1", name: "ppal-update-live-set", args: { tempo: 128 } },
        ],
      },
    });

    await handleGeminiMessage(message, deps);

    expect(executeTool).toHaveBeenCalledWith("ppal-update-live-set", {
      tempo: 128,
    });
    expect(sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        {
          id: "c1",
          name: "ppal-update-live-set",
          response: { output: "Tempo updated." },
        },
      ],
    });
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(true);
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });

  it("falls back to the tool name as id when none is provided", async () => {
    const { deps, sendToolResponse } = makeDeps();

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toMatchObject({
      type: "function_call",
      name: "ppal-x",
    });
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("tolerates a function call with no name (empty-string fallbacks)", async () => {
    const executeTool = vi.fn(async () => "ok");
    const { deps, sendToolResponse } = makeDeps({ executeTool });

    await handleGeminiMessage(msg({ toolCall: { functionCalls: [{}] } }), deps);

    expect(executeTool).toHaveBeenCalledWith("", {});
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("surfaces a sendToolResponse failure via setError", async () => {
    const { deps } = makeDeps({
      getSession: () =>
        ({
          sendToolResponse: () => {
            throw new Error("socket closed");
          },
        }) as unknown as Session,
    });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.setError).toHaveBeenCalledWith("socket closed");
  });

  it("skips sendToolResponse when the session is gone", async () => {
    const { deps } = makeDeps({ getSession: () => null });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    // No throw; thinking still toggled off.
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });
});

describe("seedGeminiContext", () => {
  it("is a no-op for empty or missing history", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;

    seedGeminiContext(session, undefined);
    seedGeminiContext(session, []);

    expect(sendClientContent).not.toHaveBeenCalled();
  });

  it("sends prior message transcripts as a non-triggering context turn", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    const history: RealtimeItem[] = [
      {
        itemId: "1",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "set tempo to 128" }],
      },
      {
        itemId: "2",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "Done." }],
      },
      // function_call + system items are skipped by the transcript flattener.
      {
        itemId: "3",
        type: "function_call",
        status: "completed",
        name: "ppal-x",
        arguments: "{}",
        output: "ok",
      },
    ];

    seedGeminiContext(session, history);

    expect(sendClientContent).toHaveBeenCalledTimes(1);
    const arg = sendClientContent.mock.calls[0]![0] as {
      turns: { parts: { text: string }[] }[];
      turnComplete: boolean;
    };

    expect(arg.turnComplete).toBe(false);
    const text = arg.turns[0]!.parts[0]!.text;

    expect(text).toContain("User: set tempo to 128");
    expect(text).toContain("You: Done.");
    expect(text).not.toContain("ppal-x");
  });

  it("is a no-op when history has no usable transcript text", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    const history: RealtimeItem[] = [
      {
        itemId: "1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "" }],
      },
    ];

    seedGeminiContext(session, history);

    expect(sendClientContent).not.toHaveBeenCalled();
  });
});
