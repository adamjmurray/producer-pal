// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type SemanticEagerness,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/helpers/turn-detection-settings";

export type RealtimeReasoningEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/**
 * Maps thinking UI setting to OpenAI Realtime API reasoning.effort. The
 * Realtime API supports an additional "minimal" tier below "low" for the
 * Off case. Default returns undefined so the server picks its own default.
 * @param thinking - Thinking mode setting from UI
 * @returns A reasoning effort tier, or undefined to omit the field
 */
export function mapThinkingToRealtimeEffort(
  thinking: string,
): RealtimeReasoningEffort | undefined {
  switch (thinking) {
    case "Off":
      return "minimal";
    case "Max":
      return "high";
    default:
      return undefined;
  }
}

/** OpenAI Realtime `audio.input.turnDetection` payload (snake_case "as-is"
 * shape). Only the fields each mode uses are sent. Structurally validated at
 * the assignment site against the SDK's RealtimeTurnDetectionConfig. */
export interface RealtimeTurnDetectionPayload {
  type: "server_vad" | "semantic_vad";
  threshold?: number;
  silence_duration_ms?: number;
  eagerness?: SemanticEagerness;
  interrupt_response: boolean;
}

/**
 * Maps the UI turn-detection settings to the OpenAI Realtime
 * audio.input.turnDetection payload. server_vad carries the volume threshold
 * and silence window; semantic_vad carries the eagerness tier. Each mode omits
 * the other mode's fields. interrupt_response (barge-in) applies to both.
 * @param settings - UI turn-detection settings
 * @returns The turn-detection payload for the realtime session config
 */
export function mapTurnDetectionToConfig(
  settings: TurnDetectionSettings,
): RealtimeTurnDetectionPayload {
  if (settings.mode === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness: settings.eagerness,
      interrupt_response: settings.interruptResponse,
    };
  }

  return {
    type: "server_vad",
    threshold: settings.threshold,
    silence_duration_ms: settings.silenceDurationMs,
    interrupt_response: settings.interruptResponse,
  };
}
