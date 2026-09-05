// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  type Session,
  StartSensitivity,
} from "@google/genai";
import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it, vi } from "vitest";
import { type GeminiVadSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { handleGeminiMessage } from "#webui/hooks/voice/gemini/gemini-message-handler";
import {
  GEM_ITEM_ID,
  makeMessageDeps,
  msg,
} from "#webui/hooks/voice/gemini/tests/gemini-message-handler-test-helpers";
import {
  buildGeminiConfig,
  closeQuietly,
  createGenAIClient,
  seedGeminiContext,
} from "#webui/hooks/voice/gemini/use-gemini-voice-session-helpers";

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
    // Transcription is enabled with empty configs: the Developer API rejects
    // languageCodes, so it must never appear (regression guard for the throw).
    expect(config.inputAudioTranscription).toStrictEqual({});
    expect(config.outputAudioTranscription).toStrictEqual({});
    expect(config.inputAudioTranscription).not.toHaveProperty("languageCodes");
    expect(config.systemInstruction).toContain("ENGLISH");
  });

  it("locks a non-English language via the system instruction", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      language: "es",
    });

    // System instruction is the only Gemini language-control path now.
    expect(config.systemInstruction).toContain("SPANISH");
    expect(config.systemInstruction).toContain("Respond only in Spanish.");
    expect(config.inputAudioTranscription).toStrictEqual({});
    expect(config.outputAudioTranscription).toStrictEqual({});
  });

  it("falls back to English for an unknown language code", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      language: "xx",
    });

    expect(config.systemInstruction).toContain("ENGLISH");
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

  it("enables session resumption with an empty handle for a fresh session", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
    });

    expect(config.sessionResumption).toStrictEqual({});
  });

  it("passes the resumption handle when resuming a prior session", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      resumeHandle: "handle-9",
    });

    expect(config.sessionResumption).toStrictEqual({ handle: "handle-9" });
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
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { inputTranscription: { text: "hello" } } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "user",
      status: "completed",
      content: [{ type: "input_audio", transcript: "hello" }],
    });
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("appends output transcription and enqueues audio", async () => {
    const { deps, player } = makeMessageDeps();

    await handleGeminiMessage(
      msg({
        serverContent: {
          outputTranscription: { text: "hi" },
          modelTurn: { parts: [{ inlineData: { data: "BASE64" } }] },
        },
      }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [{ type: "output_audio", transcript: "hi" }],
    });
    expect(player.enqueueBase64).toHaveBeenCalledWith("BASE64");
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(true);
  });

  it("ignores model-turn parts that carry no audio data", async () => {
    const { deps, player } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { modelTurn: { parts: [{ text: "no audio" }] } } }),
      deps,
    );

    expect(player.enqueueBase64).not.toHaveBeenCalled();
  });

  it("flushes playback and stops speaking on interruption", async () => {
    const { deps, player } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { interrupted: true } }),
      deps,
    );

    expect(player.flush).toHaveBeenCalled();
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
  });

  it("stops speaking on turnComplete", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ serverContent: { turnComplete: true } }),
      deps,
    );

    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("ignores a message with no serverContent or toolCall", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(msg({ setupComplete: {} }), deps);

    expect(deps.publishHistory).not.toHaveBeenCalled();
  });

  it("stores a resumable session-resumption handle", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: true, newHandle: "h-1" } }),
      deps,
    );

    expect(deps.setResumeHandle).toHaveBeenCalledWith("h-1");
  });

  it("ignores a non-resumable update and one with no handle", async () => {
    const { deps } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: false } }),
      deps,
    );
    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: true } }),
      deps,
    );

    expect(deps.setResumeHandle).not.toHaveBeenCalled();
  });

  it("runs a tool call and sends the response with matching id", async () => {
    const executeTool = vi.fn(async () => "Tempo updated.");
    const { deps, sendToolResponse } = makeMessageDeps({ executeTool });

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
    const { deps, sendToolResponse } = makeMessageDeps();

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toStrictEqual({
      arguments: "{}",
      itemId: "ppal-x",
      output: "tool-output",
      status: "completed",
      type: "function_call",
      name: "ppal-x",
    });
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("tolerates a function call with no name (empty-string fallbacks)", async () => {
    const executeTool = vi.fn(async () => "ok");
    const { deps, sendToolResponse } = makeMessageDeps({ executeTool });

    await handleGeminiMessage(msg({ toolCall: { functionCalls: [{}] } }), deps);

    expect(executeTool).toHaveBeenCalledWith("", {});
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("surfaces a sendToolResponse failure via setError", async () => {
    const { deps } = makeMessageDeps({
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
    const { deps } = makeMessageDeps({ getSession: () => null });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    // No throw; thinking still toggled off.
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });
});

describe("closeQuietly", () => {
  it("swallows a close that throws", () => {
    const session = {
      close: () => {
        throw new Error("boom");
      },
    } as unknown as Session;

    expect(() => closeQuietly(session)).not.toThrow();
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

  it("skips system items and reads both text and (null) transcript content", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    // A system message (skipped), then a user message mixing a text part, a
    // null-transcript audio part, and a bare part (no usable text).
    const history = [
      { role: "system", content: [{ type: "input_text", text: "SYSTEM" }] },
      {
        role: "user",
        content: [
          { type: "input_text", text: "hello there" },
          { type: "input_audio", transcript: null },
          { type: "input_image" },
        ],
      },
    ].map((m, i) => ({
      itemId: String(i),
      type: "message",
      status: "completed",
      ...m,
    })) as unknown as RealtimeItem[];

    seedGeminiContext(session, history);

    const arg = sendClientContent.mock.calls[0]![0] as {
      turns: { parts: { text: string }[] }[];
    };

    expect(arg.turns[0]!.parts[0]!.text).toContain("User: hello there");
    expect(arg.turns[0]!.parts[0]!.text).not.toContain("SYSTEM");
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
