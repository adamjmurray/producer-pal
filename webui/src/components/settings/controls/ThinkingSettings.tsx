// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";

export interface ThinkingSettingsProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
}

/**
 * Settings for thinking/reasoning modes
 * @param {ThinkingSettingsProps} props - Component props
 * @param {Provider} props.provider - Current provider
 * @param {string} props.model - Current model
 * @param {string} props.thinking - Thinking level
 * @param {(thinking: string) => void} props.setThinking - Thinking setter callback
 * @param {boolean} props.showThoughts - Whether to show thoughts
 * @param {(show: boolean) => void} props.setShowThoughts - Show thoughts setter callback
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
  // Only show thinking settings for providers that support it
  if (
    provider !== "gemini" &&
    provider !== "openai" &&
    provider !== "openrouter" &&
    provider !== "ollama" &&
    provider !== "lmstudio"
  ) {
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
          <option value="Default">Default</option>
          <option value="Off">Off</option>
          <option value="Minimal">Minimal</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Ultra">Ultra</option>
        </select>
      </div>
      {/* Show "Show thinking process" checkbox for Gemini and OpenRouter */}
      {(isGemini || provider === "openrouter") && thinking !== "Off" && (
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
