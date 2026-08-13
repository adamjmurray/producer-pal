// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Voice-chat language lock. Both realtime backends are forced to a single
 * chosen language so the model can't wander off it on accent, filler, or
 * context. The language is user-selectable (a dropdown in Voice settings);
 * English is the default.
 *
 * Spoken-output language is enforced via agent instructions on both providers —
 * the only lever that governs the response language. The providers differ on the
 * ASR (transcript) side-channel:
 *   - OpenAI additionally accepts audio.input.transcription.language, pinned to
 *     the chosen language so short/noisy utterances aren't misclassified. This
 *     shapes the transcript text only, not how the model hears or responds.
 *   - Gemini (Developer API) has transcription enabled but takes no language
 *     code — AudioTranscriptionConfig.languageCodes is rejected in this mode and
 *     the native-audio model detects language automatically.
 */

export interface VoiceLanguage {
  /** ISO-639-1 code. Canonical key (localStorage) + OpenAI
   * audio.input.transcription.language. */
  code: string;
  /** Language name woven into the agent instructions ("Respond only in X"). */
  name: string;
  /** Dropdown label. */
  label: string;
}

/**
 * Common languages offered in Voice settings, keyed by ISO-639-1 code (OpenAI
 * transcription / canonical localStorage key). English is first (the default).
 * Trim or extend freely — the lock is driven by `name` (instructions) and, on
 * OpenAI, the `code` (ASR hint).
 */
export const VOICE_LANGUAGES: readonly VoiceLanguage[] = [
  { code: "en", name: "English", label: "English" },
  { code: "es", name: "Spanish", label: "Spanish (Español)" },
  { code: "fr", name: "French", label: "French (Français)" },
  { code: "de", name: "German", label: "German (Deutsch)" },
  { code: "it", name: "Italian", label: "Italian (Italiano)" },
  { code: "pt", name: "Portuguese", label: "Portuguese (Português)" },
  { code: "nl", name: "Dutch", label: "Dutch (Nederlands)" },
  { code: "pl", name: "Polish", label: "Polish (Polski)" },
  { code: "ru", name: "Russian", label: "Russian (Русский)" },
  { code: "tr", name: "Turkish", label: "Turkish (Türkçe)" },
  { code: "ja", name: "Japanese", label: "Japanese (日本語)" },
  { code: "ko", name: "Korean", label: "Korean (한국어)" },
  { code: "zh", name: "Chinese", label: "Chinese (中文)" },
  { code: "hi", name: "Hindi", label: "Hindi (हिन्दी)" },
  { code: "ar", name: "Arabic", label: "Arabic (العربية)" },
] as const;

/** ISO-639-1 code of the default voice language (English). */
export const DEFAULT_VOICE_LANGUAGE = "en";

// English is the guaranteed fallback — VOICE_LANGUAGES is non-empty and starts
// with it, so the lookup in getVoiceLanguage never falls through to undefined.
const ENGLISH = VOICE_LANGUAGES[0] as VoiceLanguage;

/**
 * ASR model for the realtime transcription side-channel. Affects the transcript
 * text only, not comprehension.
 *
 * gpt-transcribe over the streaming gpt-realtime-whisper / gpt-live-transcribe:
 * it's ~4x cheaper per minute and writes numbers as digits ("bar 3 beat 2", "128
 * BPM") where the streaming models spell them out. Its one tradeoff — no partial
 * transcripts until the turn commits — costs us nothing, because the Realtime
 * SDK discards user-transcription deltas and only updates history on
 * `.completed` anyway.
 */
export const OPENAI_TRANSCRIPTION_MODEL = "gpt-transcribe";

/**
 * Whether a code names one of the offered voice languages. Used to validate a
 * value loaded from localStorage.
 * @param code - Candidate ISO-639-1 code
 * @returns True if the code is in VOICE_LANGUAGES
 */
export function isValidVoiceLanguage(code: string): boolean {
  return VOICE_LANGUAGES.some((l) => l.code === code);
}

/**
 * Resolve an ISO-639-1 code to its VoiceLanguage record, falling back to
 * English for a missing or unknown code.
 * @param code - ISO-639-1 code, or null/undefined
 * @returns The matching VoiceLanguage, or the English default
 */
export function getVoiceLanguage(
  code: string | null | undefined,
): VoiceLanguage {
  return VOICE_LANGUAGES.find((l) => l.code === code) ?? ENGLISH;
}

const IDENTITY =
  "You are Producer Pal, an AI music production assistant working with the user in Ableton Live.";

const CONNECT_AND_STYLE = [
  "Before responding to the user's first request, call the ppal-connect tool to load the latest Producer Pal skills and current project context.",
  "Keep voice responses brief and conversational. When tool calls take a moment, you may narrate what you are doing so the user knows you are working.",
].join(" ");

/**
 * Anti-drift language rules from OpenAI's realtime prompting guide: an accent is
 * not an intended language, and broad "mirror the user" behavior makes the model
 * switch on accent, filler, or isolated foreign words. The rules are constant
 * across languages; only the language name changes.
 * @param lang - The locked language
 * @returns The anti-drift instruction block
 */
function antiDrift(lang: VoiceLanguage): string {
  return [
    `Respond only in ${lang.name}.`,
    "Do not respond in any other language even if the user asks.",
    "Do not infer language from accent alone.",
    "Ignore short filler sounds, backchannels, and isolated foreign words for language detection.",
  ].join(" ");
}

/**
 * Agent instructions for the OpenAI Realtime backend. Output language is locked
 * via these instructions; the transcription.language field governs recognized
 * input only, not the response language.
 * @param lang - The locked language
 * @returns The full instruction string
 */
export function buildOpenAIVoiceInstructions(lang: VoiceLanguage): string {
  return [IDENTITY, antiDrift(lang), CONNECT_AND_STYLE].join(" ");
}

/**
 * Agent instructions for the Gemini Live backend. The native-audio model
 * (gemini-3.1-flash-live-preview) ignores speechConfig.languageCode, so the lock
 * is instructions-only — prepend Google's emphatic recommended phrasing to the
 * shared anti-drift rules for the strongest soft lock available.
 * @param lang - The locked language
 * @returns The full instruction string
 */
export function buildGeminiVoiceInstructions(lang: VoiceLanguage): string {
  const shout = lang.name.toUpperCase();

  return [
    IDENTITY,
    `RESPOND IN ${shout}. YOU MUST RESPOND UNMISTAKABLY IN ${shout}.`,
    antiDrift(lang),
    CONNECT_AND_STYLE,
  ].join(" ");
}
