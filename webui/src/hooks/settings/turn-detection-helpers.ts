// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const TURN_DETECTION_KEY = "producer_pal_turn_detection";

/** VAD strategy for OpenAI Realtime turn detection. `server_vad` is volume
 * based; `semantic_vad` lets the model decide when the user has finished. */
export type TurnDetectionMode = "server_vad" | "semantic_vad";

/** semantic_vad endpointing eagerness — higher responds sooner. */
export type SemanticEagerness = "auto" | "low" | "medium" | "high";

/** Start/end-of-speech detection sensitivity for Gemini's VAD. */
export type SpeechSensitivity = "high" | "low";

/**
 * Gemini Live automatic-activity-detection (VAD) settings. Distinct from
 * OpenAI's mode/threshold/eagerness model — Gemini exposes start/end-of-speech
 * sensitivity plus padding/silence windows (maps to
 * realtimeInputConfig.automaticActivityDetection), and barge-in via
 * activityHandling. Nested under TurnDetectionSettings so it rides the same
 * voice-settings plumbing without threading a second settings object.
 */
export interface GeminiVadSettings {
  /** How readily the start of speech is detected. */
  startSensitivity: SpeechSensitivity;
  /** How readily the end of speech is detected. */
  endSensitivity: SpeechSensitivity;
  /** Silence (ms) after speech before the turn is considered over. */
  silenceDurationMs: number;
  /** Audio (ms) retained before detected speech onset. */
  prefixPaddingMs: number;
  /** Barge-in: when true, user speech interrupts the assistant's current
   * response (activityHandling START_OF_ACTIVITY_INTERRUPTS); false maps to
   * NO_INTERRUPTION. On by default — Gemini's native behavior. */
  interruptResponse: boolean;
}

export interface TurnDetectionSettings {
  mode: TurnDetectionMode;
  /** server_vad: activation volume threshold (0–1). Higher ignores quieter input. */
  threshold: number;
  /** server_vad: silence (ms) after speech before the turn is considered over. */
  silenceDurationMs: number;
  /** semantic_vad: how eagerly the model decides the user is done. */
  eagerness: SemanticEagerness;
  /** Barge-in: when true, the user speaking interrupts the assistant's current
   * response (maps to turn_detection.interrupt_response). Off by default —
   * without headphones the assistant's own audio can self-interrupt. */
  interruptResponse: boolean;
  /** Gemini-only VAD settings (ignored by the OpenAI path). */
  gemini: GeminiVadSettings;
}

export const TURN_DETECTION_THRESHOLD_MIN = 0;
export const TURN_DETECTION_THRESHOLD_MAX = 1;
export const TURN_DETECTION_SILENCE_MIN = 100;
export const TURN_DETECTION_SILENCE_MAX = 2000;

export const GEMINI_VAD_SILENCE_MIN = 0;
export const GEMINI_VAD_SILENCE_MAX = 2000;
export const GEMINI_VAD_PREFIX_MIN = 0;
export const GEMINI_VAD_PREFIX_MAX = 500;

/** Gemini VAD defaults mirror the Live API's documented out-of-the-box values
 * (~800 ms silence, ~20 ms prefix padding, low sensitivity); barge-in defaults
 * on to match Gemini's native interrupt behavior. */
export const DEFAULT_GEMINI_VAD: GeminiVadSettings = {
  startSensitivity: "low",
  endSensitivity: "low",
  silenceDurationMs: 800,
  prefixPaddingMs: 20,
  interruptResponse: true,
};

/** Defaults mirror the OpenAI Realtime server_vad defaults so an untouched
 * config behaves exactly like the API's own out-of-the-box endpointing. */
export const DEFAULT_TURN_DETECTION: TurnDetectionSettings = {
  mode: "server_vad",
  threshold: 0.5,
  silenceDurationMs: 200,
  eagerness: "auto",
  interruptResponse: false,
  gemini: DEFAULT_GEMINI_VAD,
};

const VALID_MODES = new Set<TurnDetectionMode>(["server_vad", "semantic_vad"]);
const VALID_EAGERNESS = new Set<SemanticEagerness>([
  "auto",
  "low",
  "medium",
  "high",
]);
const VALID_SENSITIVITY = new Set<SpeechSensitivity>(["high", "low"]);

/**
 * Loads the saved turn-detection settings from localStorage, falling back to
 * defaults and clamping/validating any stale or hand-edited values.
 * @returns A normalized turn-detection settings object
 */
export function loadTurnDetection(): TurnDetectionSettings {
  const stored = localStorage.getItem(TURN_DETECTION_KEY);

  if (stored == null) return DEFAULT_TURN_DETECTION;

  try {
    return normalizeTurnDetection(
      JSON.parse(stored) as Partial<TurnDetectionSettings>,
    );
  } catch {
    return DEFAULT_TURN_DETECTION;
  }
}

/**
 * Persists turn-detection settings to localStorage.
 * @param settings - The turn-detection settings to persist
 */
export function saveTurnDetection(settings: TurnDetectionSettings): void {
  localStorage.setItem(TURN_DETECTION_KEY, JSON.stringify(settings));
}

/**
 * Coerces a possibly-partial/invalid stored object into a valid settings
 * object: unknown enum values fall back to defaults; numbers are clamped.
 * @param raw - Parsed (untrusted) settings object
 * @returns A normalized turn-detection settings object
 */
function normalizeTurnDetection(
  raw: Partial<TurnDetectionSettings>,
): TurnDetectionSettings {
  const mode = VALID_MODES.has(raw.mode as TurnDetectionMode)
    ? (raw.mode as TurnDetectionMode)
    : DEFAULT_TURN_DETECTION.mode;
  const eagerness = VALID_EAGERNESS.has(raw.eagerness as SemanticEagerness)
    ? (raw.eagerness as SemanticEagerness)
    : DEFAULT_TURN_DETECTION.eagerness;

  return {
    mode,
    eagerness,
    interruptResponse:
      typeof raw.interruptResponse === "boolean"
        ? raw.interruptResponse
        : DEFAULT_TURN_DETECTION.interruptResponse,
    threshold: clampNumber(
      raw.threshold,
      DEFAULT_TURN_DETECTION.threshold,
      TURN_DETECTION_THRESHOLD_MIN,
      TURN_DETECTION_THRESHOLD_MAX,
    ),
    silenceDurationMs: clampNumber(
      raw.silenceDurationMs,
      DEFAULT_TURN_DETECTION.silenceDurationMs,
      TURN_DETECTION_SILENCE_MIN,
      TURN_DETECTION_SILENCE_MAX,
    ),
    gemini: normalizeGeminiVad(raw.gemini),
  };
}

/**
 * Coerces a possibly-partial/invalid Gemini VAD object into a valid one:
 * unknown sensitivity values fall back to defaults; numbers are clamped.
 * @param raw - Parsed (untrusted) Gemini VAD settings, possibly undefined
 * @returns A normalized Gemini VAD settings object
 */
function normalizeGeminiVad(
  raw: Partial<GeminiVadSettings> | undefined,
): GeminiVadSettings {
  const g = raw ?? {};

  return {
    startSensitivity: VALID_SENSITIVITY.has(
      g.startSensitivity as SpeechSensitivity,
    )
      ? (g.startSensitivity as SpeechSensitivity)
      : DEFAULT_GEMINI_VAD.startSensitivity,
    endSensitivity: VALID_SENSITIVITY.has(g.endSensitivity as SpeechSensitivity)
      ? (g.endSensitivity as SpeechSensitivity)
      : DEFAULT_GEMINI_VAD.endSensitivity,
    interruptResponse:
      typeof g.interruptResponse === "boolean"
        ? g.interruptResponse
        : DEFAULT_GEMINI_VAD.interruptResponse,
    silenceDurationMs: clampNumber(
      g.silenceDurationMs,
      DEFAULT_GEMINI_VAD.silenceDurationMs,
      GEMINI_VAD_SILENCE_MIN,
      GEMINI_VAD_SILENCE_MAX,
    ),
    prefixPaddingMs: clampNumber(
      g.prefixPaddingMs,
      DEFAULT_GEMINI_VAD.prefixPaddingMs,
      GEMINI_VAD_PREFIX_MIN,
      GEMINI_VAD_PREFIX_MAX,
    ),
  };
}

/**
 * Returns the value clamped to [min, max], falling back when not finite.
 * @param value - Candidate value (untrusted)
 * @param fallback - Value used when `value` is not a finite number
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns A finite number within [min, max]
 */
function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return Math.min(max, Math.max(min, n));
}
