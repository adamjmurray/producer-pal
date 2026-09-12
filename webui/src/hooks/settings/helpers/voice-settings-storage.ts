// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_REALTIME_VOICE,
  isValidGeminiRealtimeVoice,
  isValidRealtimeVoice,
} from "#webui/lib/constants/models";
import {
  DEFAULT_VOICE_LANGUAGE,
  isValidVoiceLanguage,
} from "#webui/lib/constants/voice-language";

const REALTIME_VOICE_KEY = "producer_pal_realtime_voice";
const VOICE_SPEED_KEY = "producer_pal_voice_speed";
const VOICE_VOLUME_KEY = "producer_pal_voice_volume";
const VOICE_LANGUAGE_KEY = "producer_pal_voice_language";

export const VOICE_SPEED_MIN = 0.5;
export const VOICE_SPEED_MAX = 1.5;
export const VOICE_SPEED_DEFAULT = 1.0;

// Output playback gain (1.0 = unity). Driven through a Web Audio GainNode, which
// can boost above unity — so the range extends to 1.25 (125%). The plain
// <audio> element is muted and the remote stream is routed source → gain →
// destination; element .volume alone is hard-capped at 1.0 by the HTML spec.
export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 1.25;
export const VOICE_VOLUME_DEFAULT = 1.0;

/**
 * Loads the saved realtime voice, falling back to the default when missing or
 * invalid. Accepts an OpenAI or a Gemini voice id (the two providers share this
 * field); the consuming hook re-validates per active provider, so the other
 * provider's voice sitting here is harmless and survives a reload.
 * @returns A known realtime voice id
 */
export function loadRealtimeVoice(): string {
  const stored = localStorage.getItem(REALTIME_VOICE_KEY);

  if (
    stored &&
    (isValidRealtimeVoice(stored) || isValidGeminiRealtimeVoice(stored))
  ) {
    return stored;
  }

  return DEFAULT_REALTIME_VOICE;
}

/**
 * Persists the realtime voice selection to localStorage.
 * @param voice - The voice id to persist
 */
export function saveRealtimeVoice(voice: string): void {
  localStorage.setItem(REALTIME_VOICE_KEY, voice);
}

/**
 * Loads the saved voice playback speed multiplier from localStorage. Falls
 * back to 1.0 (normal speed) when missing or out of range.
 * @returns A speed multiplier clamped to [VOICE_SPEED_MIN, VOICE_SPEED_MAX]
 */
export function loadVoiceSpeed(): number {
  const stored = loadStoredNumber(VOICE_SPEED_KEY);

  return stored == null
    ? VOICE_SPEED_DEFAULT
    : Math.min(VOICE_SPEED_MAX, Math.max(VOICE_SPEED_MIN, stored));
}

/**
 * Persists the voice playback speed multiplier to localStorage.
 * @param speed - The speed multiplier to persist
 */
export function saveVoiceSpeed(speed: number): void {
  localStorage.setItem(VOICE_SPEED_KEY, String(speed));
}

/**
 * Loads the saved output playback volume from localStorage. Falls back to 1.0
 * (unity) when missing or out of range — existing users with no stored value
 * get unity.
 * @returns A volume clamped to [VOICE_VOLUME_MIN, VOICE_VOLUME_MAX]
 */
export function loadVoiceVolume(): number {
  const stored = loadStoredNumber(VOICE_VOLUME_KEY);

  return stored == null
    ? VOICE_VOLUME_DEFAULT
    : Math.min(VOICE_VOLUME_MAX, Math.max(VOICE_VOLUME_MIN, stored));
}

/**
 * Persists the output playback volume to localStorage.
 * @param volume - The volume (0.0–1.25) to persist
 */
export function saveVoiceVolume(volume: number): void {
  localStorage.setItem(VOICE_VOLUME_KEY, String(volume));
}

/**
 * Loads the saved voice-chat language (ISO-639-1 code) from localStorage,
 * falling back to English when missing or unknown.
 * @returns A valid voice-language code
 */
export function loadVoiceLanguage(): string {
  const stored = localStorage.getItem(VOICE_LANGUAGE_KEY);

  if (stored && isValidVoiceLanguage(stored)) {
    return stored;
  }

  return DEFAULT_VOICE_LANGUAGE;
}

/**
 * Persists the voice-chat language selection to localStorage.
 * @param language - The ISO-639-1 language code to persist
 */
export function saveVoiceLanguage(language: string): void {
  localStorage.setItem(VOICE_LANGUAGE_KEY, language);
}

/**
 * Reads a finite number from localStorage.
 * @param key - The localStorage key
 * @returns The stored number, or null when missing or unparseable
 */
function loadStoredNumber(key: string): number | null {
  const stored = localStorage.getItem(key);

  if (stored == null) {
    return null;
  }

  const parsed = Number.parseFloat(stored);

  return Number.isFinite(parsed) ? parsed : null;
}
