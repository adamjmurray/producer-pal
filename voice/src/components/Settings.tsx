import { useState, useEffect } from 'react';

interface SettingsProps {
  apiKey: string;
  onSave: (apiKey: string) => void;
  onBack: () => void;
}

/**
 * Settings component for managing API key
 * @param root0 - Component props
 * @param root0.apiKey - Current API key
 * @param root0.onSave - Callback to save API key
 * @param root0.onBack - Callback to return to chat
 * @returns {JSX.Element} Settings component
 */
export function Settings({ apiKey, onSave, onBack }: SettingsProps) {
  const [inputValue, setInputValue] = useState(apiKey);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setInputValue(apiKey);
  }, [apiKey]);

  const handleSave = () => {
    onSave(inputValue.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full bg-gradient-to-br from-blue-500 to-purple-600 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Settings</h1>
          <button
            onClick={onBack}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors cursor-pointer"
          >
            Back to Chat
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label
              htmlFor="api-key"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Google Gemini API Key
            </label>
            <input
              id="api-key"
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter your Gemini API key"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent outline-none transition-all"
            />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline inline-block"
            >
              Gemini API keys
            </a>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Your API key is stored locally in your browser and never sent to
              any server except Google's Gemini API.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!inputValue.trim()}
              className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all ${
                inputValue.trim()
                  ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
            >
              {saved ? '✓ Saved!' : 'Save API Key'}
            </button>
            {apiKey && (
              <button
                onClick={() => {
                  setInputValue('');
                  onSave('');
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
