// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { ThinkingStateIcon } from "#webui/components/chat/controls/ThinkingToggle";
import { GeminiTurnDetectionControls } from "#webui/components/settings/controls/GeminiTurnDetectionControls";
import { THINKING_LEVELS } from "#webui/components/settings/controls/helpers/thinking-levels";
import { Tooltip } from "#webui/components/settings/controls/Tooltip";
import { TurnDetectionControls } from "#webui/components/settings/controls/TurnDetectionControls";
import { VoiceSelector } from "#webui/components/settings/controls/VoiceSelector";
import { VoiceSpeedSlider } from "#webui/components/settings/controls/VoiceSpeedSlider";
import { VoiceVolumeSlider } from "#webui/components/settings/controls/VoiceVolumeSlider";
import { type TurnDetectionSettings } from "#webui/hooks/settings/turn-detection-helpers";
import {
  GEMINI_REALTIME_VOICES,
  isRealtimeSelection,
  REALTIME_VOICES,
} from "#webui/lib/constants/models";
import { MODEL_DOCS_URLS } from "#webui/lib/constants/provider-urls";
import { VOICE_LANGUAGES } from "#webui/lib/constants/voice-language";
import { type Provider } from "#webui/types/settings";

interface ModelDocsLinkProps {
  provider: Provider;
  providerLabel: string;
}

/**
 * External link to the active provider's model documentation. Renders nothing
 * for providers without a docs URL.
 * @param props - Component props
 * @param props.provider - Current provider
 * @param props.providerLabel - Display name for the provider
 * @returns Docs link element, or null
 */
export function ModelDocsLink({ provider, providerLabel }: ModelDocsLinkProps) {
  const url = MODEL_DOCS_URLS[provider];

  if (!url) return null;

  return (
    <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-300">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        {providerLabel} models
      </a>
    </p>
  );
}

interface ThinkingSelectorProps {
  thinking: string;
  setThinking: (thinking: string) => void;
}

/**
 * Thinking level selector with icon and tooltip
 * @param props - Component props
 * @param props.thinking - Current thinking level
 * @param props.setThinking - Thinking level setter callback
 * @returns Thinking selector element
 */
export function ThinkingSelector({
  thinking,
  setThinking,
}: ThinkingSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <ThinkingStateIcon level={thinking} />
      <label htmlFor="thinking-select" className="shrink-0 text-sm">
        Thinking
      </label>
      <select
        id="thinking-select"
        value={thinking}
        onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-700"
      >
        {THINKING_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
      <Tooltip text="Default for new conversations. Can be changed at any time during a chat using the in-chat toggle." />
    </div>
  );
}

interface SmallModelToggleProps {
  smallModelMode: boolean;
  setSmallModelMode: (enabled: boolean) => void;
}

/**
 * Small model mode checkbox with emoji indicator and tooltip
 * @param props - Component props
 * @param props.smallModelMode - Whether small model mode is enabled
 * @param props.setSmallModelMode - Small model mode setter callback
 * @returns Small model toggle element
 */
export function SmallModelToggle({
  smallModelMode,
  setSmallModelMode,
}: SmallModelToggleProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <span className={smallModelMode ? "" : "text-xl"}>
        {smallModelMode ? "🐢" : "🐘"}
      </span>{" "}
      <input
        type="checkbox"
        id="smallModelMode"
        checked={smallModelMode}
        onChange={(e) =>
          setSmallModelMode((e.target as HTMLInputElement).checked)
        }
      />
      Small model mode
      <Tooltip text="Simplifies skills and tool parameters for less capable models. Recommended for local models (Ollama and Bionic)." />
    </label>
  );
}

interface VoiceLanguageSelectorProps {
  language: string;
  setLanguage: (language: string) => void;
}

/**
 * Voice-chat language dropdown. Provider-agnostic — locks both the OpenAI and
 * Gemini backends to the chosen language (response language plus the ASR
 * transcription hint). Applied on the next session (Stop → Talk).
 * @param props - Component props
 * @param props.language - Currently selected language code (ISO-639-1)
 * @param props.setLanguage - Language setter callback
 * @returns Language selector element
 */
export function VoiceLanguageSelector({
  language,
  setLanguage,
}: VoiceLanguageSelectorProps) {
  return (
    <div>
      <label htmlFor="voice-language-select" className="mb-2 block text-sm">
        Language
      </label>
      <select
        id="voice-language-select"
        value={language}
        onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)}
        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
        data-testid="voice-language-select"
      >
        {VOICE_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface VoiceSettingsProps {
  provider: Provider;
  model: string;
  realtimeVoice: string;
  setRealtimeVoice: (voice: string) => void;
  voiceLanguage: string;
  setVoiceLanguage: (language: string) => void;
  voiceVolume: number;
  setVoiceVolume: (volume: number) => void;
  voiceSpeed: number;
  setVoiceSpeed: (speed: number) => void;
  turnDetection: TurnDetectionSettings;
  setTurnDetection: (settings: TurnDetectionSettings) => void;
  /** Voice currently locked into the live RealtimeSession (or null when idle).
   * Used to render a pending-change notice. */
  activeVoice: string | null;
}

/**
 * Voice-mode settings, shown only for a realtime model selection (OpenAI or
 * Gemini). The voice selector sits at the top level; volume and the provider's
 * turn-detection controls are tucked into a collapsed "Voice Settings"
 * disclosure. Returns null otherwise.
 * @param props - Component props
 * @param props.provider - Current provider
 * @param props.model - Current model id
 * @param props.realtimeVoice - In-modal voice id
 * @param props.setRealtimeVoice - Voice setter callback
 * @param props.voiceLanguage - In-modal language code (ISO-639-1)
 * @param props.setVoiceLanguage - Language setter callback
 * @param props.voiceVolume - In-modal output volume (0.0–1.25)
 * @param props.setVoiceVolume - Volume setter callback
 * @param props.voiceSpeed - In-modal playback speed
 * @param props.setVoiceSpeed - Speed setter callback
 * @param props.turnDetection - In-modal turn-detection settings
 * @param props.setTurnDetection - Turn-detection setter callback
 * @param props.activeVoice - Voice locked into the live session (or null)
 * @returns Voice settings group, or null when not a realtime selection
 */
export function VoiceSettings({
  provider,
  model,
  realtimeVoice,
  setRealtimeVoice,
  voiceLanguage,
  setVoiceLanguage,
  voiceVolume,
  setVoiceVolume,
  voiceSpeed,
  setVoiceSpeed,
  turnDetection,
  setTurnDetection,
  activeVoice,
}: VoiceSettingsProps) {
  if (!isRealtimeSelection(provider, model)) return null;
  // Each provider gets its own turn-detection controls (the VAD configs don't
  // map 1:1). Speed has no Gemini equivalent (the Live API has no speaking-rate
  // field), so it stays OpenAI-only.
  const isGemini = provider === "gemini";
  const voices = isGemini ? GEMINI_REALTIME_VOICES : REALTIME_VOICES;

  return (
    <>
      <VoiceSelector
        voice={realtimeVoice}
        setVoice={setRealtimeVoice}
        activeVoice={activeVoice}
        voices={voices}
      />
      <VoiceLanguageSelector
        language={voiceLanguage}
        setLanguage={setVoiceLanguage}
      />
      <details className="disclosure open:rounded-lg open:border open:border-zinc-300 open:bg-zinc-200 open:p-3 dark:open:border-zinc-700 dark:open:bg-zinc-900">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm select-none [&::-webkit-details-marker]:hidden">
          <DisclosureChevron />
          Voice Settings
        </summary>
        <div className="mt-3 space-y-3">
          <VoiceVolumeSlider volume={voiceVolume} setVolume={setVoiceVolume} />
          {isGemini ? (
            <GeminiTurnDetectionControls
              settings={turnDetection}
              setSettings={setTurnDetection}
            />
          ) : (
            <>
              <VoiceSpeedSlider speed={voiceSpeed} setSpeed={setVoiceSpeed} />
              <TurnDetectionControls
                settings={turnDetection}
                setSettings={setTurnDetection}
              />
            </>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-300">
            Applied on the next session (Stop, then Talk) — except Volume, which
            is live.
          </p>
        </div>
      </details>
    </>
  );
}
