// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TurnDetectionSettings } from "#webui/hooks/settings/turn-detection-helpers";

/**
 * Type definitions for provider settings and configuration.
 *
 * Supports multiple LLM providers:
 * - Anthropic (Claude)
 * - Gemini (Google)
 * - OpenAI
 * - Mistral (OpenAI-compatible)
 * - OpenRouter (OpenAI-compatible)
 * - LM Studio (local OpenAI-compatible)
 * - Ollama (local OpenAI-compatible)
 * - Custom (any OpenAI-compatible provider)
 */

// Provider types
export type Provider =
  | "anthropic"
  | "gemini"
  | "openai"
  | "mistral"
  | "openrouter"
  | "lmstudio"
  | "ollama"
  | "custom";

// Hook return type for useSettings
export interface UseSettingsReturn {
  provider: Provider;
  setProvider: (provider: Provider) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl?: string; // For custom, lmstudio, and ollama providers
  setBaseUrl?: (url: string) => void;
  model: string;
  setModel: (model: string) => void;
  /** The persisted model (last save), independent of in-modal edits. App.tsx
   * routes voice vs chat off this so picking a realtime model in the dropdown
   * doesn't switch modes until the user saves. */
  savedModel: string;
  /** The persisted provider (last save), paired with `savedModel` for voice
   * routing. Like `savedModel`, it lags the in-modal `provider` until save so a
   * mid-modal provider switch doesn't remount the chat/voice screen. */
  savedProvider: Provider;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  saveSettings: () => void;
  cancelSettings: () => void;
  hasApiKey: boolean;
  settingsConfigured: boolean;
  // Tool toggles
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  resetBehaviorToDefaults: () => void;
  isToolEnabled: (toolId: string) => boolean;
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
  // Mirrors server-side ProducerPalConfig.liveApiEnabled, kept in modal-local
  // state. Source of truth is the server (which mirrors the device Setup-tab
  // toggle) — not localStorage. The dirty flag distinguishes "user toggled
  // this in the modal" from "server seeded this value", so the save handler
  // only POSTs when the user expressed intent (avoids clobbering device-side
  // changes that arrive mid-modal and avoids posting the default `false` on
  // first open if the server fetch hasn't resolved yet).
  liveApiEnabled: boolean;
  liveApiEnabledDirty: boolean;
  setLiveApiEnabled: (enabled: boolean) => void;
  seedLiveApiEnabled: (enabled: boolean) => void;

  /** In-modal voice selection for the OpenAI Realtime API. Editing this
   * during a live voice session does NOT change the active voice — the
   * RealtimeAgent locks the voice at connect time. Takes effect on the next
   * Stop → Talk cycle. */
  realtimeVoice: string;
  setRealtimeVoice: (voice: string) => void;

  /** Persisted voice setting (last save). Used by useVoiceSession at connect
   * time so an in-modal edit doesn't reach into the live session. */
  savedRealtimeVoice: string;

  /** In-modal voice playback speed multiplier (audio.output.speed for the
   * OpenAI Realtime API). Mid-session edits don't affect the live session —
   * applied on the next Stop → Talk. */
  voiceSpeed: number;
  setVoiceSpeed: (speed: number) => void;

  /** Persisted voice speed (last save). Read by useVoiceSession at connect time. */
  savedVoiceSpeed: number;

  /** In-modal OpenAI Realtime turn-detection (VAD) settings. Mid-session edits
   * don't affect the live session — applied on the next Stop → Talk. */
  turnDetection: TurnDetectionSettings;
  setTurnDetection: (settings: TurnDetectionSettings) => void;

  /** Persisted turn-detection settings (last save). Read by useVoiceSession at
   * connect time. */
  savedTurnDetection: TurnDetectionSettings;
}
