import { useState } from "preact/hooks";
import type { Provider } from "../../types/settings.js";

interface MessageSettingsToolbarProps {
  provider: Provider;
  model: string;
  defaultThinking: string;
  defaultTemperature: number;
  thinking: string;
  temperature: number;
  onThinkingChange: (thinking: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onResetToDefaults: () => void;
}

function isO1OrO3Model(model: string): boolean {
  return model === "o1" || model === "o3-mini";
}

export function MessageSettingsToolbar({
  provider,
  model,
  defaultThinking,
  defaultTemperature,
  thinking,
  temperature,
  onThinkingChange,
  onTemperatureChange,
  onResetToDefaults,
}: MessageSettingsToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isOpenAIReasoning = provider === "openai" && isO1OrO3Model(model);
  const showSimplifiedOptions = isOpenAIReasoning;

  const randomnessPercent = Math.round((temperature / 2) * 100);
  const isUsingDefaults =
    thinking === defaultThinking && temperature === defaultTemperature;

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
                {!showSimplifiedOptions && <option value="Off">Off</option>}
                {!showSimplifiedOptions && <option value="Auto">Auto</option>}
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
                    parseFloat((e.target as HTMLInputElement).value),
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

          <p className="text-xs text-gray-500 dark:text-gray-500">
            These settings apply only to your next message. Change defaults in
            Settings → Behavior.
          </p>
        </div>
      )}
    </div>
  );
}
