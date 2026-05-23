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

export interface TurnDetectionSettings {
  mode: TurnDetectionMode;
  /** server_vad: activation volume threshold (0–1). Higher ignores quieter input. */
  threshold: number;
  /** server_vad: silence (ms) after speech before the turn is considered over. */
  silenceDurationMs: number;
  /** semantic_vad: how eagerly the model decides the user is done. */
  eagerness: SemanticEagerness;
}

export const TURN_DETECTION_THRESHOLD_MIN = 0;
export const TURN_DETECTION_THRESHOLD_MAX = 1;
export const TURN_DETECTION_SILENCE_MIN = 100;
export const TURN_DETECTION_SILENCE_MAX = 2000;

/** Defaults mirror the OpenAI Realtime server_vad defaults so an untouched
 * config behaves exactly like the API's own out-of-the-box endpointing. */
export const DEFAULT_TURN_DETECTION: TurnDetectionSettings = {
  mode: "server_vad",
  threshold: 0.5,
  silenceDurationMs: 200,
  eagerness: "auto",
};

const VALID_MODES = new Set<TurnDetectionMode>(["server_vad", "semantic_vad"]);
const VALID_EAGERNESS = new Set<SemanticEagerness>([
  "auto",
  "low",
  "medium",
  "high",
]);

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
