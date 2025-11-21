import type { Provider } from "../../types/settings";
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
  resetBehaviorToDefaults: () => void;
}

/**
 * Behavior tab component for settings
 * @param {object} root0 - Component props
 * @param {Provider} root0.provider - Selected provider
 * @param {string} root0.model - Selected model
 * @param {string} root0.thinking - Thinking mode setting
 * @param {Function} root0.setThinking - Function to update thinking mode
 * @param {number} root0.temperature - Temperature/randomness setting
 * @param {Function} root0.setTemperature - Function to update temperature
 * @param {boolean} root0.showThoughts - Whether to show thought blocks
 * @param {Function} root0.setShowThoughts - Function to toggle thought display
 * @param {Function} root0.resetBehaviorToDefaults - Function to reset behavior settings
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
  resetBehaviorToDefaults,
}: BehaviorTabProps) {
  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={resetBehaviorToDefaults}
          className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
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
        <p className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-300 dark:border-gray-600">
          These are default values for new conversations. You can adjust
          thinking and randomness for individual messages during chat.
        </p>
      </div>
    </div>
  );
}
