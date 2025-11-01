export function GeminiApiKeyInput({ apiKey, setApiKey, hasApiKey }) {
  return (
    <div>
      <label className="block text-sm mb-2">Gemini API Key (required)</label>
      <input
        type="password"
        value={apiKey}
        onInput={(e) =>
          setApiKey(/** @type {HTMLInputElement} */ (e.target).value)
        }
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded placeholder:dark:text-gray-400 placeholder:text-gray-500"
        placeholder="Enter your API key"
        autoFocus={!hasApiKey}
      />
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
    </div>
  );
}
