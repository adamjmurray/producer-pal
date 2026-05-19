// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

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
  /** Atomically swap the active provider + that provider's model (used when
   * loading a conversation whose stored mode differs from the current one). */
  setProviderAndModel: (provider: Provider, model: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  baseUrl?: string; // For custom, lmstudio, and ollama providers
  setBaseUrl?: (url: string) => void;
  model: string;
  setModel: (model: string) => void;
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
}
