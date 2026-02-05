// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "preact/hooks";
import type { Provider } from "#webui/types/settings";

export interface MessageSettingsToolbarProps {
  provider: Provider;
  model: string;
  defaultThinking: string;
  defaultTemperature: number;
  defaultShowThoughts: boolean;
  thinking: string;
  temperature: number;
  showThoughts: boolean;
  onThinkingChange: (thinking: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onShowThoughtsChange: (showThoughts: boolean) => void;
  onResetToDefaults: () => void;
}

function isO1OrO3Model(model: string): boolean {
  return model === "o1" || model === "o3-mini";
}

interface ExpandedPanelProps {
  thinking: string;
  temperature: number;
  showThoughts: boolean;
  showSimplifiedOptions: boolean;
  showShowThoughtsCheckbox: boolean;
  isUsingDefaults: boolean;
  randomnessPercent: number;
  onThinkingChange: (thinking: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onShowThoughtsChange: (showThoughts: boolean) => void;
  onResetToDefaults: () => void;
}

function ExpandedPanel({
  thinking,
  temperature,
  showThoughts,
  showSimplifiedOptions,
  showShowThoughtsCheckbox,
  isUsingDefaults,
  randomnessPercent,
  onThinkingChange,
  onTemperatureChange,
  onShowThoughtsChange,
  onResetToDefaults,
}: ExpandedPanelProps) {
  return (
    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex flex-col gap-3">
      <div className="flex gap-4 items-center">
        {/* Thinking dropdown */}
        <div className="flex-1">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Thinking
          </label>
          <select
            value={thinking}
            onChange={(e) =>
              onThinkingChange((e.target as HTMLSelectElement).value)
            }
            className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
          >
            {!showSimplifiedOptions && <option value="Default">Default</option>}
            {!showSimplifiedOptions && <option value="Off">Off</option>}
            {!showSimplifiedOptions && <option value="Minimal">Minimal</option>}
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            {!showSimplifiedOptions && <option value="Ultra">Ultra</option>}
          </select>
        </div>

        {/* Randomness slider */}
        <div className="flex-1">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Randomness: {randomnessPercent}%
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onInput={(e) =>
              onTemperatureChange(
                Number.parseFloat((e.target as HTMLInputElement).value),
              )
            }
            className="w-full"
          />
        </div>

        {/* Reset button */}
        <div className="flex items-end">
          <button
            onClick={onResetToDefaults}
            disabled={isUsingDefaults}
            className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            ↺ Use defaults
          </button>
        </div>
      </div>

      {/* Show thinking checkbox */}
      {showShowThoughtsCheckbox && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="messageShowThoughts"
            checked={showThoughts}
            onChange={(e) =>
              onShowThoughtsChange((e.target as HTMLInputElement).checked)
            }
          />
          <label
            htmlFor="messageShowThoughts"
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Show thinking process
          </label>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-500">
        These settings apply only to your next message. Change defaults in
        Settings → Behavior.
      </p>
    </div>
  );
}

/**
 * Toolbar for per-message thinking and randomness settings
 * @param {MessageSettingsToolbarProps} root0 - Component props
 * @param {Provider} root0.provider - Selected provider
 * @param {string} root0.model - Selected model
 * @param {string} root0.defaultThinking - Default thinking mode
 * @param {number} root0.defaultTemperature - Default temperature
 * @param {boolean} root0.defaultShowThoughts - Default showThoughts setting
 * @param {string} root0.thinking - Current thinking mode
 * @param {number} root0.temperature - Current temperature
 * @param {boolean} root0.showThoughts - Current showThoughts setting
 * @param {Function} root0.onThinkingChange - Callback for thinking change
 * @param {Function} root0.onTemperatureChange - Callback for temperature change
 * @param {Function} root0.onShowThoughtsChange - Callback for showThoughts change
 * @param {Function} root0.onResetToDefaults - Callback to reset to defaults
 * @returns {JSX.Element} Settings toolbar component
 */
export function MessageSettingsToolbar({
  provider,
  model,
  defaultThinking,
  defaultTemperature,
  defaultShowThoughts,
  thinking,
  temperature,
  showThoughts,
  onThinkingChange,
  onTemperatureChange,
  onShowThoughtsChange,
  onResetToDefaults,
}: MessageSettingsToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isOpenAIReasoning = provider === "openai" && isO1OrO3Model(model);
  const showSimplifiedOptions = isOpenAIReasoning;
  const isGemini = provider === "gemini";
  const showShowThoughtsCheckbox =
    (isGemini || provider === "openrouter") && thinking !== "Off";

  const randomnessPercent = Math.round((temperature / 2) * 100);
  const isUsingDefaults =
    thinking === defaultThinking &&
    temperature === defaultTemperature &&
    showThoughts === defaultShowThoughts;

  return (
    <div className="border-b border-gray-300 dark:border-gray-700">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        type="button"
      >
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {isExpanded ? "▼" : "▶"} Message settings
          {!isUsingDefaults && " (customized)"}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-500">
          Thinking: {thinking} • {randomnessPercent}% random
        </span>
      </button>

      {isExpanded && (
        <ExpandedPanel
          thinking={thinking}
          temperature={temperature}
          showThoughts={showThoughts}
          showSimplifiedOptions={showSimplifiedOptions}
          showShowThoughtsCheckbox={showShowThoughtsCheckbox}
          isUsingDefaults={isUsingDefaults}
          randomnessPercent={randomnessPercent}
          onThinkingChange={onThinkingChange}
          onTemperatureChange={onTemperatureChange}
          onShowThoughtsChange={onShowThoughtsChange}
          onResetToDefaults={onResetToDefaults}
        />
      )}
    </div>
  );
}
