// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation } from "#src/shared/notation";
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

/**
 * A named, reusable bundle of everything a chat conversation runs with — the
 * saved twin of what {@link UseSettingsReturn} exposes — EXCEPT the per-provider
 * apiKey/baseUrl (resolved live from the encrypted provider store via
 * getProviderConnection, so a preset only *names* which provider to use) and UI
 * preferences (theme/timestamps). A preset bundles the client-side localStorage
 * layer: provider + model + inference + toolset. The server-side content layer
 * (skills / system-instruction) is a future "persona" that wraps a preset.
 *
 * The stable `id` is the handle a subagent worker persists to say "run with
 * preset X" by reference, so renaming a preset never breaks that link.
 */
export interface ChatPreset extends PresetFields {
  /** Stable id (survives renames); the handle a subagent config references. */
  id: string;
  /** Unique, user-facing label shown in the preset picker. */
  name: string;
  /** Optional freeform note. Currently informational only — reserved for the
   * future "orchestrator picks a preset per spawn" feature, where a spawned
   * worker matches its task against this text. Absent/blank until then. */
  description?: string;
}

/** The settings a preset captures (everything but its identity/metadata). */
export interface PresetFields {
  provider: Provider;
  model: string;
  thinking: string;
  smallModelMode: boolean;
  /** Captured tool-enablement map (the client-side toolset). Additive/optional:
   * localStorage is schemaless, so a preset saved before toolsets existed omits
   * it, meaning "inherit the current toolset" (applying such a preset leaves the
   * tools untouched). A present map is applied verbatim; a missing key within it
   * falls back to that tool's own default (all on except the opt-in Subagent). */
  enabledTools?: Record<string, boolean>;
  /** Captured notation (how the AI reads and writes clip notes). Additive/
   * optional on the same terms as `enabledTools`: a preset saved before this
   * omits it, meaning "inherit the current notation" (applying such a preset
   * leaves notation untouched and its dirty flag clear). Applying a preset that
   * carries one writes the live buffer, so Saving posts it as the device global
   * — the same reach the Notation dropdown already has. A subagent worker
   * running under the preset gets it per-request instead, via its own notation
   * header, so a stark worker can serve a bar|beat orchestrator. */
  notation?: Notation;
}

/**
 * Voice-mode settings fields shared between the full settings hook
 * (UseSettingsReturn) and the voice-only hook (UseVoiceModeSettingsReturn).
 * The voice session reads these at connect time; the in-modal / saved split
 * lets an edit during a live session take effect only on the next Stop → Talk
 * (except voiceVolume, which applies live).
 */
export interface VoiceModeSettingsFields {
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

// Hook return type for useSettings
export interface UseSettingsReturn extends VoiceModeSettingsFields {
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
  /** Read any provider's stored connection (decrypted key + base URL),
   * independent of the active `provider`. Lets a restored conversation locked to
   * provider X keep talking to X using the user's *current* key/baseUrl for X —
   * no API key is ever persisted in conversation storage. */
  getProviderConnection: (provider: Provider) => {
    apiKey: string;
    baseUrl?: string;
  };
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
  /** Load a saved preset into the live editable buffer: writes the preset's
   * model/thinking into that preset's *own* provider
   * slice (a functional update, so it's correct even when the preset switches
   * provider — the per-field setters otherwise target only the active slice),
   * switches the active provider, sets the global small-model mode, and applies
   * the captured toolset and notation (each skipped when the preset carries
   * none, so a legacy preset inherits the current tools/notation). The
   * provider's apiKey/baseUrl are left untouched. The user then Saves normally. */
  applyPreset: (preset: ChatPreset) => void;
  /** Persists in-modal settings and resolves only after the at-rest envelope
   * has landed. Returns true on durable success, false on failure (saveError
   * is set in that case). Callers (e.g. use-save-settings-handler) gate the
   * modal close and post-save RPCs on this so a failed persist keeps the
   * modal open with the error visible instead of committing silently. */
  saveSettings: () => Promise<boolean>;
  cancelSettings: () => void;
  hasApiKey: boolean;
  settingsConfigured: boolean;
  /** False until the post-mount async decrypt has applied the real apiKeys.
   * Consumers that snapshot settings (e.g. unsaved-changes detection) must wait
   * for this so they don't capture the blank pre-decrypt apiKey. */
  settingsLoaded: boolean;
  /** Message from the last failed saveSettings(), or null. Cleared on the
   * next save attempt and on cancelSettings. The SettingsFooter renders it
   * so the user sees what went wrong instead of closing the modal silently. */
  saveError: string | null;
  // Tool toggles
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  resetBehaviorToDefaults: () => void;
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
  /** The preset a spawned subagent runs under: its model/inference and, when the
   * preset saved them, its toolset and notation (a preset without them keeps the
   * orchestrator's). The system instruction always inherits. Null = "inherit current
   * settings", the shipped phase-1 behavior. A global preference (not locked per
   * conversation) and a modal-local buffer persisted on Save. */
  subagentPresetId: string | null;
  setSubagentPresetId: (id: string | null) => void;
  /** Tool steps one turn may spend before the run stops and hands back control.
   * Subagent orchestrators and workers run on the same number (see
   * step-budget.ts). A modal-local buffer persisted on Save. */
  maxToolSteps: number;
  setMaxToolSteps: (steps: number) => void;
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

  // Global notation setting (how clip tools read/write notes), mirrored from
  // server config.notation. Same modal-local-mirror pattern as liveApiEnabled:
  // the source of truth is the server (and the device Setup pane), not
  // localStorage, since the device can change it out from under the modal. The
  // dirty flag distinguishes a user edit from a server-seeded value so the save
  // handler only POSTs on real intent.
  notation: Notation;
  notationDirty: boolean;
  /**
   * False until `notation` holds a real answer — server-seeded or user-chosen —
   * instead of the provisional mount-time default. The chat's first-send gate
   * waits on this: a new conversation locks its notation at the first send, and
   * DEFAULT_NOTATION is a legitimate choice, so the value alone can't say
   * whether it was chosen or merely assumed.
   */
  notationKnown: boolean;
  setNotation: (notation: Notation) => void;
  seedNotation: (notation: Notation) => void;
}
