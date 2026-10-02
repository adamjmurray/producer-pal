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
  Modality,
  type RealtimeInputConfig,
  StartSensitivity,
} from "@google/genai";
import { type GeminiVadSettings } from "#webui/hooks/settings/helpers/turn-detection-settings";
import { type GeminiVoiceCredential } from "#webui/hooks/voice/gemini/gemini-voice-token";
import { DEFAULT_GEMINI_REALTIME_VOICE } from "#webui/lib/constants/models";
import {
  buildGeminiVoiceInstructions,
  getVoiceLanguage,
} from "#webui/lib/constants/voice-language";

/** Mic input format Gemini Live expects (raw 16-bit PCM, 16 kHz, mono, LE). */
export const GEMINI_INPUT_MIME_TYPE = "audio/pcm;rate=16000";

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
 * @param opts.language - Locked voice language (ISO-639-1 code); defaults to
 *   English
 * @param opts.resumeHandle - Prior session's resumption handle; omit for a fresh
 *   session (still enables resumption so the server starts issuing handles)
 * @returns The LiveConnectConfig
 */
export function buildGeminiConfig(opts: {
  voice: string | undefined;
  functionDeclarations: FunctionDeclaration[];
  vad?: GeminiVadSettings;
  language?: string;
  resumeHandle?: string;
}): LiveConnectConfig {
  const language = getVoiceLanguage(opts.language);
  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: buildGeminiVoiceInstructions(language),
    tools: [{ functionDeclarations: opts.functionDeclarations }],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: opts.voice ?? DEFAULT_GEMINI_REALTIME_VOICE,
        },
      },
    },
    // Enable transcription so the UI can render the transcript (off by default
    // on Gemini). We send empty configs intentionally: the Developer API rejects
    // AudioTranscriptionConfig.languageCodes (the SDK throws for it in this
    // mode), and the native-audio model picks language automatically anyway. The
    // spoken-output language is locked via the system instruction below.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: opts.resumeHandle ? { handle: opts.resumeHandle } : {},
  };

  if (opts.vad) {
    config.realtimeInputConfig = buildRealtimeInputConfig(opts.vad);
  }

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
