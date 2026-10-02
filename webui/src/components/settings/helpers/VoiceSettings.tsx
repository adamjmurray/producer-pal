// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DisclosureChevron } from "#webui/components/chat/controls/header/HeaderIcons";
import { GeminiTurnDetectionControls } from "#webui/components/settings/controls/GeminiTurnDetectionControls";
import { TurnDetectionControls } from "#webui/components/settings/controls/TurnDetectionControls";
import { VoiceSelector } from "#webui/components/settings/controls/VoiceSelector";
import { VoiceSpeedSlider } from "#webui/components/settings/controls/VoiceSpeedSlider";
import { VoiceVolumeSlider } from "#webui/components/settings/controls/VoiceVolumeSlider";
import { type TurnDetectionSettings } from "#webui/hooks/settings/helpers/turn-detection-settings";
import {
  GEMINI_REALTIME_VOICES,
  isRealtimeSelection,
  REALTIME_VOICES,
} from "#webui/lib/constants/models";
import { VOICE_LANGUAGES } from "#webui/lib/constants/voice-language";
import { type Provider } from "#webui/types/settings";

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
  if (!isRealtimeSelection(provider, model)) {
    return null;
  }

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
