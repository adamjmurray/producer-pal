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
  /** Decrypted OpenAI provider key, independent of the active `provider`. Lets
   * voice mode resume a saved OpenAI record while current settings select a
   * different provider — without this, the Talk button would falsely report
   * "key required" because `apiKey` only reflects the active provider's key. */
  openaiApiKey: string;
  /** Decrypted Gemini provider key, independent of the active `provider`. Same
   * rationale as `openaiApiKey` but for record-aware Gemini Live routing. */
  geminiApiKey: string;
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
  /** The persisted thinking level (last save), independent of in-modal edits.
   * useVoiceSession reads this at connect time (mapped to reasoning.effort) so a
   * mid-session edit doesn't leak into the active session — applied on the next
   * Stop → Talk, matching savedRealtimeVoice/savedVoiceSpeed/savedTurnDetection. */
  savedThinking: string;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  /** Persists in-modal settings and resolves only after the at-rest envelope
   * has landed. Returns true on durable success, false on failure (saveError
   * is set in that case). Callers (e.g. use-save-settings-handler) gate the
   * modal close and post-save RPCs on this so a failed persist keeps the
   * modal open with the error visible instead of committing silently. */
  saveSettings: () => Promise<boolean>;
  cancelSettings: () => void;
  hasApiKey: boolean;
  settingsConfigured: boolean;
  /** Message from the last failed saveSettings(), or null. Cleared on the
   * next save attempt and on cancelSettings. The SettingsFooter renders it
   * so the user sees what went wrong instead of closing the modal silently. */
  saveError: string | null;
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

  /** Client-side playback volume (0.0–1.25, applied via a Web Audio GainNode
   * so it can boost above unity). Unlike the other voice settings, this is
   * applied live — useVoiceSession reads this value directly and a mid-session
   * change updates loudness immediately. */
  voiceVolume: number;
  setVoiceVolume: (volume: number) => void;

  /** In-modal OpenAI Realtime turn-detection (VAD) settings. Mid-session edits
   * don't affect the live session — applied on the next Stop → Talk. */
  turnDetection: TurnDetectionSettings;
  setTurnDetection: (settings: TurnDetectionSettings) => void;

  /** Persisted turn-detection settings (last save). Read by useVoiceSession at
   * connect time. */
  savedTurnDetection: TurnDetectionSettings;

  /** In-modal voice-chat language (ISO-639-1 code). Provider-agnostic — locks
   * both backends to the chosen language. Mid-session edits don't affect the
   * live session; applied on the next Stop → Talk. */
  voiceLanguage: string;
  setVoiceLanguage: (language: string) => void;

  /** Persisted voice language (last save). Read by the voice session hooks at
   * connect time. */
  savedVoiceLanguage: string;
}
