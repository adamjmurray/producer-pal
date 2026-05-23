// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { ThinkingStateIcon } from "#webui/components/chat/controls/ThinkingToggle";
import { type TurnDetectionSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { isRealtimeModel } from "#webui/lib/constants/models";
import { type Provider } from "#webui/types/settings";
import { THINKING_LEVELS } from "./controls/thinking-levels";
import { Tooltip } from "./controls/Tooltip";
import { TurnDetectionControls } from "./controls/TurnDetectionControls";
import { VoiceSelector } from "./controls/VoiceSelector";
import { VoiceSpeedSlider } from "./controls/VoiceSpeedSlider";

export const API_KEY_URLS: Record<string, string | undefined> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  mistral: "https://console.mistral.ai/home?workspace_dialog=apiKeys",
  openrouter: "https://openrouter.ai/settings/keys",
};

export const MODEL_DOCS_URLS: Record<string, string | undefined> = {
  anthropic: "https://docs.anthropic.com/en/docs/about-claude/models",
  gemini: "https://ai.google.dev/gemini-api/docs/models",
  openai: "https://platform.openai.com/docs/models",
  mistral: "https://docs.mistral.ai/getting-started/models",
  openrouter: "https://openrouter.ai/models",
  lmstudio: "https://lmstudio.ai/models",
  ollama: "https://ollama.com/search",
};

export const DEFAULT_LOCAL_URLS: Record<string, string> = {
  lmstudio: "http://localhost:1234",
  ollama: "http://localhost:11434",
};

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
      <label htmlFor="thinking-select" className="text-sm shrink-0">
        Thinking
      </label>
      <select
        id="thinking-select"
        value={thinking}
        onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
        className="px-2 py-1 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded text-sm"
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
    <label className="flex items-center gap-2 text-sm cursor-pointer">
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
      <Tooltip text="Simplifies skills and tool parameters for less capable models. Recommended for local models (Ollama and LM Studio)." />
    </label>
  );
}

interface VoiceSettingsProps {
  provider: Provider;
  model: string;
  realtimeVoice: string;
  setRealtimeVoice: (voice: string) => void;
  voiceSpeed: number;
  setVoiceSpeed: (speed: number) => void;
  turnDetection: TurnDetectionSettings;
  setTurnDetection: (settings: TurnDetectionSettings) => void;
  activeVoice: string | null;
}

/**
 * Voice-mode settings group (voice, speed, turn detection), shown only for the
 * OpenAI realtime model. Returns null otherwise.
 * @param props - Component props
 * @param props.provider - Current provider
 * @param props.model - Current model id
 * @param props.realtimeVoice - In-modal voice id
 * @param props.setRealtimeVoice - Voice setter callback
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
  voiceSpeed,
  setVoiceSpeed,
  turnDetection,
  setTurnDetection,
  activeVoice,
}: VoiceSettingsProps) {
  if (provider !== "openai" || !isRealtimeModel(model)) return null;

  return (
    <>
      <VoiceSelector
        voice={realtimeVoice}
        setVoice={setRealtimeVoice}
        activeVoice={activeVoice}
      />
      <VoiceSpeedSlider speed={voiceSpeed} setSpeed={setVoiceSpeed} />
      <TurnDetectionControls
        settings={turnDetection}
        setSettings={setTurnDetection}
      />
    </>
  );
}
