// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";
import { RandomnessSlider } from "./controls/RandomnessSlider";
import { ThinkingSettings } from "./controls/ThinkingSettings";

interface BehaviorTabProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  showMessageSettings: boolean;
  setShowMessageSettings: (show: boolean) => void;
  resetBehaviorToDefaults: () => void;
}

/**
 * Behavior tab component for settings
 * @param {object} props - Component props
 * @param {Provider} props.provider - Selected provider
 * @param {string} props.model - Selected model
 * @param {string} props.thinking - Thinking mode setting
 * @param {Function} props.setThinking - Function to update thinking mode
 * @param {number} props.temperature - Temperature/randomness setting
 * @param {Function} props.setTemperature - Function to update temperature
 * @param {boolean} props.showThoughts - Whether to show thought blocks
 * @param {Function} props.setShowThoughts - Function to toggle thought display
 * @param {boolean} props.showMessageSettings - Whether to show per-conversation behavior overrides
 * @param {Function} props.setShowMessageSettings - Function to toggle behavior overrides
 * @param {Function} props.resetBehaviorToDefaults - Function to reset behavior settings
 * @returns {JSX.Element} Behavior tab component
 */
export function BehaviorTab({
  provider,
  model,
  thinking,
  setThinking,
  temperature,
  setTemperature,
  showThoughts,
  setShowThoughts,
  showMessageSettings,
  setShowMessageSettings,
  resetBehaviorToDefaults,
}: BehaviorTabProps) {
  // Render the behavior settings with thinking and temperature controls
  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={resetBehaviorToDefaults}
          className="px-3 py-1 text-xs bg-zinc-600 text-white rounded hover:bg-zinc-700"
        >
          Reset to defaults
        </button>
      </div>

      <div className="space-y-4">
        <ThinkingSettings
          provider={provider}
          model={model}
          thinking={thinking}
          setThinking={setThinking}
          showThoughts={showThoughts}
          setShowThoughts={setShowThoughts}
        />

        <div className="mt-8">
          <RandomnessSlider
            temperature={temperature}
            setTemperature={setTemperature}
          />
        </div>
        <div className="pt-2 border-t border-zinc-300 dark:border-zinc-600">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            These settings apply to new conversations.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showMessageSettings"
              checked={showMessageSettings}
              onChange={(e) =>
                setShowMessageSettings((e.target as HTMLInputElement).checked)
              }
            />
            <label htmlFor="showMessageSettings" className="text-sm">
              Allow per-conversation behavior overrides
            </label>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 ml-5">
            Show a toolbar above the chat input to adjust thinking and
            randomness for the current conversation.
          </p>
        </div>
      </div>
    </div>
  );
}
