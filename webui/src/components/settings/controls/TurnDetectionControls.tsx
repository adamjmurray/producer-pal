// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Tooltip } from "#webui/components/settings/controls/Tooltip";
import {
  DEFAULT_TURN_DETECTION,
  type SemanticEagerness,
  type TurnDetectionMode,
  type TurnDetectionSettings,
  TURN_DETECTION_SILENCE_MAX,
  TURN_DETECTION_SILENCE_MIN,
  TURN_DETECTION_THRESHOLD_MAX,
  TURN_DETECTION_THRESHOLD_MIN,
} from "#webui/hooks/settings/turn-detection-helpers";

const SELECT_CLASS =
  "w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded";

const MODE_OPTIONS: { value: TurnDetectionMode; label: string }[] = [
  { value: "server_vad", label: "Server VAD (volume-based)" },
  { value: "semantic_vad", label: "Semantic VAD (model-based)" },
];

const EAGERNESS_OPTIONS: { value: SemanticEagerness; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low (waits longer)" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High (responds sooner)" },
];

export interface TurnDetectionControlsProps {
  settings: TurnDetectionSettings;
  setSettings: (settings: TurnDetectionSettings) => void;
}

/**
 * OpenAI Realtime turn detection (VAD) controls. Picks the VAD mode and exposes
 * that mode's tuning knobs: eagerness for Semantic VAD, threshold + silence
 * window for Server VAD, plus the barge-in toggle. Rendered inside the parent
 * "Voice Settings" disclosure; mid-session edits apply on the next Stop → Talk.
 *
 * @param props - Component props
 * @param props.settings - Current in-modal turn-detection settings
 * @param props.setSettings - Setter for the in-modal settings object
 * @returns Turn-detection controls element
 */
export function TurnDetectionControls({
  settings,
  setSettings,
}: TurnDetectionControlsProps) {
  const update = (partial: Partial<TurnDetectionSettings>) =>
    setSettings({ ...settings, ...partial });

  return (
    <>
      <div>
        <label htmlFor="turn-detection-mode" className="mb-2 block text-sm">
          Turn detection
        </label>
        <select
          id="turn-detection-mode"
          value={settings.mode}
          onChange={(e) =>
            update({
              mode: (e.target as HTMLSelectElement).value as TurnDetectionMode,
            })
          }
          className={SELECT_CLASS}
          data-testid="turn-detection-mode"
        >
          {MODE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {settings.mode === "semantic_vad" ? (
        <EagernessSelect settings={settings} update={update} />
      ) : (
        <ServerVadSliders settings={settings} update={update} />
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          id="turn-detection-barge-in"
          checked={settings.interruptResponse}
          onChange={(e) =>
            update({
              interruptResponse: (e.target as HTMLInputElement).checked,
            })
          }
          data-testid="turn-detection-barge-in"
        />
        Enable barge-in
        <Tooltip text="Speak to interrupt Producer Pal while it's talking. Use headphones — without them, the assistant's own voice can trigger interruptions." />
      </label>
    </>
  );
}

interface SubControlProps {
  settings: TurnDetectionSettings;
  update: (partial: Partial<TurnDetectionSettings>) => void;
}

/**
 * Eagerness dropdown shown when Semantic VAD is selected.
 * @param props - Component props
 * @param props.settings - Current turn-detection settings
 * @param props.update - Partial-settings updater
 * @returns Eagerness selector element
 */
function EagernessSelect({ settings, update }: SubControlProps) {
  return (
    <div>
      <label htmlFor="turn-detection-eagerness" className="mb-1 block text-xs">
        Eagerness
      </label>
      <select
        id="turn-detection-eagerness"
        value={settings.eagerness}
        onChange={(e) =>
          update({
            eagerness: (e.target as HTMLSelectElement)
              .value as SemanticEagerness,
          })
        }
        className={SELECT_CLASS}
        data-testid="turn-detection-eagerness"
      >
        {EAGERNESS_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Threshold + silence-duration sliders shown when Server VAD is selected.
 * @param props - Component props
 * @param props.settings - Current turn-detection settings
 * @param props.update - Partial-settings updater
 * @returns Server VAD sliders element
 */
function ServerVadSliders({ settings, update }: SubControlProps) {
  return (
    <>
      <LabeledSlider
        label={`Threshold (${settings.threshold.toFixed(2)})`}
        value={settings.threshold}
        defaultValue={DEFAULT_TURN_DETECTION.threshold}
        min={TURN_DETECTION_THRESHOLD_MIN}
        max={TURN_DETECTION_THRESHOLD_MAX}
        step={0.05}
        testId="turn-detection-threshold"
        onChange={(threshold) => update({ threshold })}
      />
      <LabeledSlider
        label={`Pause (${settings.silenceDurationMs} ms)`}
        value={settings.silenceDurationMs}
        defaultValue={DEFAULT_TURN_DETECTION.silenceDurationMs}
        min={TURN_DETECTION_SILENCE_MIN}
        max={TURN_DETECTION_SILENCE_MAX}
        step={50}
        testId="turn-detection-silence"
        onChange={(silenceDurationMs) => update({ silenceDurationMs })}
      />
    </>
  );
}

interface LabeledSliderProps {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  testId: string;
  onChange: (value: number) => void;
}

/**
 * Range slider with a label that includes the current value and a Reset link
 * (right-aligned in the label row) that restores the default.
 * @param props - Component props
 * @param props.label - Label text (caller embeds the formatted value)
 * @param props.value - Current numeric value
 * @param props.defaultValue - Value the Reset link restores
 * @param props.min - Minimum value
 * @param props.max - Maximum value
 * @param props.step - Step increment
 * @param props.testId - data-testid + element id (Reset adds `-reset`)
 * @param props.onChange - Called with the parsed numeric value on input
 * @returns Labeled slider element
 */
export function LabeledSlider({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  testId,
  onChange,
}: LabeledSliderProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={testId} className="text-xs">
          {label}
        </label>
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-200"
          data-testid={`${testId}-reset`}
        >
          Reset
        </button>
      </div>
      <input
        id={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) =>
          onChange(Number.parseFloat((e.target as HTMLInputElement).value))
        }
        className="w-full"
        data-testid={testId}
      />
    </div>
  );
}
