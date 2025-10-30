import { GeminiApiKeyInput } from "./GeminiApiKeyInput.jsx";
import { ModelSelector } from "./ModelSelector.jsx";
import { ThinkingSettings } from "./ThinkingSettings.jsx";
import { RandomnessSlider } from "./RandomnessSlider.jsx";

export function SettingsScreen({
  apiKey,
  setApiKey,
  model,
  setModel,
  thinking,
  setThinking,
  temperature,
  setTemperature,
  showThoughts,
  setShowThoughts,
  saveSettings,
  cancelSettings,
  hasApiKey,
  clearConversation,
  messageCount,
  activeModel,
}) {
  return (
    <div className="flex items-center justify-center h-screen p-4">
      <div className="max-w-md w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Producer Pal Chat Settings</h2>
        <GeminiApiKeyInput
          apiKey={apiKey}
          setApiKey={setApiKey}
          hasApiKey={hasApiKey}
        />
        <ModelSelector model={model} setModel={setModel} />
        <ThinkingSettings
          thinking={thinking}
          setThinking={setThinking}
          showThoughts={showThoughts}
          setShowThoughts={setShowThoughts}
        />
        <RandomnessSlider
          temperature={temperature}
          setTemperature={setTemperature}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {hasApiKey
            ? "Note: Settings changes apply to new conversations."
            : "Settings will be stored in this web browser."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={saveSettings}
            disabled={!apiKey}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
          {hasApiKey && (
            <button
              onClick={cancelSettings}
              className="px-4 py-2 bg-gray-600 text-white rounded"
            >
              Cancel
            </button>
          )}
        </div>
        {(messageCount > 0 || activeModel) && (
          <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
            <button
              onClick={clearConversation}
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Clear & Restart Conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
