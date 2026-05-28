// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Tooltip } from "#webui/components/settings/controls/Tooltip";
import { LabeledSlider } from "#webui/components/settings/controls/TurnDetectionControls";
import {
  DEFAULT_GEMINI_VAD,
  GEMINI_VAD_PREFIX_MAX,
  GEMINI_VAD_PREFIX_MIN,
  GEMINI_VAD_SILENCE_MAX,
  GEMINI_VAD_SILENCE_MIN,
  type GeminiVadSettings,
  type SpeechSensitivity,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";

const SELECT_CLASS =
  "w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded";

const SENSITIVITY_OPTIONS: { value: SpeechSensitivity; label: string }[] = [
  { value: "low", label: "Low (less sensitive)" },
  { value: "high", label: "High (more sensitive)" },
];

export interface GeminiTurnDetectionControlsProps {
  settings: TurnDetectionSettings;
  setSettings: (settings: TurnDetectionSettings) => void;
}

/**
 * Gemini Live VAD controls: start/end-of-speech sensitivity, silence window,
 * prefix padding, and the barge-in toggle. Edits the nested `gemini` block of
 * the shared turn-detection settings. Rendered inside the parent "Voice
 * Settings" disclosure for the Gemini provider; mid-session edits apply on the
 * next Stop → Talk.
 *
 * @param props - Component props
 * @param props.settings - Current in-modal turn-detection settings
 * @param props.setSettings - Setter for the in-modal settings object
 * @returns Gemini turn-detection controls element
 */
export function GeminiTurnDetectionControls({
  settings,
  setSettings,
}: GeminiTurnDetectionControlsProps) {
  const vad = settings.gemini;
  const update = (partial: Partial<GeminiVadSettings>) =>
    setSettings({ ...settings, gemini: { ...vad, ...partial } });

  return (
    <>
      <SensitivitySelect
        id="gemini-start-sensitivity"
        label="Start-of-speech sensitivity"
        value={vad.startSensitivity}
        onChange={(startSensitivity) => update({ startSensitivity })}
      />
      <SensitivitySelect
        id="gemini-end-sensitivity"
        label="End-of-speech sensitivity"
        value={vad.endSensitivity}
        onChange={(endSensitivity) => update({ endSensitivity })}
      />
      <LabeledSlider
        label={`Silence (${vad.silenceDurationMs} ms)`}
        value={vad.silenceDurationMs}
        defaultValue={DEFAULT_GEMINI_VAD.silenceDurationMs}
        min={GEMINI_VAD_SILENCE_MIN}
        max={GEMINI_VAD_SILENCE_MAX}
        step={50}
        testId="gemini-silence"
        onChange={(silenceDurationMs) => update({ silenceDurationMs })}
      />
      <LabeledSlider
        label={`Prefix padding (${vad.prefixPaddingMs} ms)`}
        value={vad.prefixPaddingMs}
        defaultValue={DEFAULT_GEMINI_VAD.prefixPaddingMs}
        min={GEMINI_VAD_PREFIX_MIN}
        max={GEMINI_VAD_PREFIX_MAX}
        step={10}
        testId="gemini-prefix"
        onChange={(prefixPaddingMs) => update({ prefixPaddingMs })}
      />
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          id="gemini-barge-in"
          checked={vad.interruptResponse}
          onChange={(e) =>
            update({
              interruptResponse: (e.target as HTMLInputElement).checked,
            })
          }
          data-testid="gemini-barge-in"
        />
        Enable barge-in
        <Tooltip text="Speak to interrupt Producer Pal while it's talking. On by default for Gemini. Use headphones — without them, the assistant's own voice can trigger interruptions." />
      </label>
    </>
  );
}

interface SensitivitySelectProps {
  id: string;
  label: string;
  value: SpeechSensitivity;
  onChange: (value: SpeechSensitivity) => void;
}

/**
 * A labeled High/Low sensitivity dropdown.
 * @param props - Component props
 * @param props.id - Element id + data-testid
 * @param props.label - Visible label text
 * @param props.value - Current sensitivity value
 * @param props.onChange - Called with the selected sensitivity
 * @returns Sensitivity selector element
 */
function SensitivitySelect({
  id,
  label,
  value,
  onChange,
}: SensitivitySelectProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm mb-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) =>
          onChange((e.target as HTMLSelectElement).value as SpeechSensitivity)
        }
        className={SELECT_CLASS}
        data-testid={id}
      >
        {SENSITIVITY_OPTIONS.map(({ value: v, label: l }) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
