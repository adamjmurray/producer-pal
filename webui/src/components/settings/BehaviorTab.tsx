import type { Provider } from "../../types/settings";
import { RandomnessSlider } from "./controls/RandomnessSlider";
import { ThinkingSettings } from "./controls/ThinkingSettings";
import { VoiceSelector } from "./controls/VoiceSelector";

interface BehaviorTabProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  temperature: number;
  setTemperature: (temp: number) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
  voice: string;
  setVoice: (voice: string) => void;
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
 * @param {string} root0.voice - Voice selection for Gemini voice chat
 * @param {Function} root0.setVoice - Function to update voice
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
  voice,
  setVoice,
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
        {provider === "gemini" && (
          <div className="mt-8">
            <VoiceSelector voice={voice} setVoice={setVoice} />
          </div>
        )}
      </div>
    </div>
  );
}
