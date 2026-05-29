// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Voice-chat language lock. Both realtime backends are forced to English so the
 * model can't wander into another language on accent, filler, or context. The
 * locked language is parameterized through a single name + code set here:
 * changing these constants (and the instruction phrasing) retargets both
 * backends.
 *
 * Two independent levers (per provider):
 *   - Output language — enforced via agent instructions (the only lever that
 *     governs the spoken response language on both backends).
 *   - Input transcription language — a parallel ASR side-channel that only
 *     shapes the transcript text (UI/logs/tool-call inputs), not how the
 *     speech-to-speech model hears or responds. Pinned so short/noisy
 *     utterances aren't misclassified.
 */

/** Human-readable language name woven into the agent instructions. */
export const VOICE_LANGUAGE_NAME = "English";

/** ISO-639-1 code for the OpenAI ASR side-channel (audio.input.transcription.language). */
export const VOICE_LANGUAGE_ISO = "en";

/** BCP-47 code for the Gemini ASR side-channel (AudioTranscriptionConfig.languageCodes). */
export const VOICE_LANGUAGE_BCP47 = "en-US";

/**
 * OpenAI's purpose-built streaming ASR model for the realtime transcription
 * side-channel — pinned over the older whisper-1 / gpt-4o-transcribe so short or
 * noisy utterances aren't misclassified into another language. Affects the
 * transcript text only, not comprehension.
 */
export const OPENAI_TRANSCRIPTION_MODEL = "gpt-realtime-whisper";

const IDENTITY =
  "You are Producer Pal, an AI music production assistant working with the user in Ableton Live.";

// Anti-drift language rules from OpenAI's realtime prompting guide: an accent is
// not an intended language, and broad "mirror the user" behavior makes the model
// switch on accent, filler, or isolated foreign words. These rules stay constant
// across languages; only the language name changes.
const ANTI_DRIFT = [
  `Respond only in ${VOICE_LANGUAGE_NAME}.`,
  "Do not respond in any other language even if the user asks.",
  "Do not infer language from accent alone.",
  "Ignore short filler sounds, backchannels, and isolated foreign words for language detection.",
].join(" ");

const CONNECT_AND_STYLE = [
  "Before responding to the user's first request, call the ppal-connect tool to load the latest Producer Pal skills and current project context.",
  "Keep voice responses brief and conversational. When tool calls take a moment, you may narrate what you are doing so the user knows you are working.",
].join(" ");

/**
 * Agent instructions for the OpenAI Realtime backend. Output language is locked
 * via these instructions; the transcription.language field governs recognized
 * input only, not the response language.
 */
export const OPENAI_VOICE_INSTRUCTIONS = [
  IDENTITY,
  ANTI_DRIFT,
  CONNECT_AND_STYLE,
].join(" ");

/**
 * Agent instructions for the Gemini Live backend. The native-audio model
 * (gemini-3.1-flash-live-preview) ignores speechConfig.languageCode, so the lock
 * is instructions-only — prepend Google's emphatic recommended phrasing to the
 * shared anti-drift rules for the strongest soft lock available.
 */
export const GEMINI_VOICE_INSTRUCTIONS = [
  IDENTITY,
  `RESPOND IN ${VOICE_LANGUAGE_NAME.toUpperCase()}. YOU MUST RESPOND UNMISTAKABLY IN ${VOICE_LANGUAGE_NAME.toUpperCase()}.`,
  ANTI_DRIFT,
  CONNECT_AND_STYLE,
].join(" ");
