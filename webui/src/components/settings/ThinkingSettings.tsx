import type { Provider } from "../../types/settings.js";

interface ThinkingSettingsProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
}

/**
 * Settings for thinking/reasoning modes
 * @param {ThinkingSettingsProps} root0 - Component props
 * @param {Provider} root0.provider - Current provider
 * @param {string} root0.model - Current model
 * @param {string} root0.thinking - Thinking level
 * @param {(thinking: string) => void} root0.setThinking - Thinking setter callback
 * @param {boolean} root0.showThoughts - Whether to show thoughts
 * @param {(show: boolean) => void} root0.setShowThoughts - Show thoughts setter callback
 * @returns {JSX.Element} - React component
 */
export function ThinkingSettings({
  provider,
  model: _model,
  thinking,
  setThinking,
  showThoughts,
  setShowThoughts,
}: ThinkingSettingsProps) {
  // Only show thinking settings for Gemini and OpenAI
  if (provider !== "gemini" && provider !== "openai") {
    return null;
  }

  const isGemini = provider === "gemini";

  return (
    <>
      <div>
        <label className="block text-sm mb-2">Thinking</label>
        <select
          value={thinking}
          onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        >
          {isGemini && <option value="Off">Off</option>}
          {isGemini && <option value="Auto">Auto</option>}
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          {isGemini && <option value="Ultra">Ultra</option>}
        </select>
      </div>
      {/* Only show "Show thinking process" checkbox for Gemini */}
      {isGemini && thinking !== "Off" && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showThoughts"
            checked={showThoughts}
            onChange={(e) =>
              setShowThoughts((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="showThoughts" className="text-sm">
            Show thinking process
          </label>
        </div>
      )}
    </>
  );
}
