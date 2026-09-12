// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  StartSensitivity,
} from "@google/genai";
import { describe, expect, it } from "vitest";
import { type GeminiVadSettings } from "#webui/hooks/settings/helpers/turn-detection-settings";
import {
  buildGeminiConfig,
  createGenAIClient,
} from "#webui/hooks/voice/gemini/gemini-client";

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
