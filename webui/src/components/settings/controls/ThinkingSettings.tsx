import type { Provider } from "#webui/types/settings";

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
  // Only show thinking settings for Gemini, OpenAI, and OpenRouter
  if (
    provider !== "gemini" &&
    provider !== "openai" &&
    provider !== "openrouter"
  ) {
    return null;
  }

  const isGemini = provider === "gemini";
  // OpenRouter uses OpenAI-style effort levels (not Gemini's budget system)
  const useOpenAIOptions = provider === "openai" || provider === "openrouter";

  return (
    <>
      <div>
        <label className="block text-sm mb-2">Thinking</label>
        <select
          value={thinking}
          onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        >
          {useOpenAIOptions ? (
            <>
              <option value="Default">Default</option>
              <option value="Off">Off</option>
              <option value="Minimal">Minimal</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="XHigh">XHigh</option>
            </>
          ) : (
            <>
              <option value="Off">Off</option>
              <option value="Auto">Auto</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Ultra">Ultra</option>
            </>
          )}
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
