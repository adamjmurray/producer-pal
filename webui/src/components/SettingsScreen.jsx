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
        <div>
          <label className="block text-sm mb-2">
            Gemini API Key (required)
          </label>
          <input
            type="password"
            value={apiKey}
            onInput={(e) => setApiKey(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded placeholder:dark:text-gray-400 placeholder:text-gray-500"
            placeholder="Enter your API key"
            autoFocus={!hasApiKey}
          />
        </div>
        {!hasApiKey && (
          <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Get a Gemini API Key
            </a>{" "}
            <span>(free, requires Google account)</span>
          </p>
        )}
        <div>
          <label className="block text-sm mb-2">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
          >
            <option value="gemini-2.5-pro">
              Gemini 2.5 Pro (most advanced)
            </option>
            <option value="gemini-2.5-flash">
              Gemini 2.5 Flash (fast & intelligent)
            </option>
            <option value="gemini-2.5-flash-lite">
              Gemini 2.5 Flash-Lite (ultra fast)
            </option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-2">Thinking</label>
          <select
            value={thinking}
            onChange={(e) => setThinking(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
          >
            <option value="Off">Off</option>
            <option value="Auto">Auto</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Ultra">Ultra</option>
          </select>
        </div>
        {thinking !== "Off" && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showThoughts"
              checked={showThoughts}
              onChange={(e) => setShowThoughts(e.target.checked)}
            />
            <label htmlFor="showThoughts" className="text-sm">
              Show thinking process
            </label>
          </div>
        )}
        <div>
          <label className="block text-sm mb-2">
            Randomness: {Math.round((temperature / 2) * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onInput={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
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
