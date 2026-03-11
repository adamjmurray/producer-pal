// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";

export interface ThinkingSettingsProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  resetToDefaults: () => void;
}

/**
 * Settings for thinking/reasoning modes
 * @param {ThinkingSettingsProps} props - Component props
 * @param {Provider} props.provider - Current provider
 * @param {string} props.model - Current model
 * @param {string} props.thinking - Thinking level
 * @param {(thinking: string) => void} props.setThinking - Thinking setter callback
 * @param {() => void} props.resetToDefaults - Reset to provider defaults
 * @returns {JSX.Element | null} - React component or null
 */
export function ThinkingSettings({
  provider,
  model: _model,
  thinking,
  setThinking,
  resetToDefaults,
}: ThinkingSettingsProps) {
  // Only show thinking settings for providers that support it
  if (
    provider !== "anthropic" &&
    provider !== "gemini" &&
    provider !== "openai" &&
    provider !== "openrouter" &&
    provider !== "ollama" &&
    provider !== "lmstudio"
  ) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm">Thinking</label>
        <button
          type="button"
          onClick={resetToDefaults}
          className="px-3 py-1 text-xs bg-zinc-600 text-white rounded hover:bg-zinc-700"
        >
          Reset to defaults
        </button>
      </div>
      <select
        value={thinking}
        onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
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
  );
}
