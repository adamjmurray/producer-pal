// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";

export interface MessageSettingsToolbarProps {
  provider: Provider;
  model: string;
  defaultThinking: string;
  thinking: string;
  onThinkingChange: (thinking: string) => void;
  onResetToDefaults: () => void;
}

/**
 * Single-row toolbar for per-conversation thinking settings
 * @param {MessageSettingsToolbarProps} root0 - Component props
 * @param {Provider} root0.provider - Selected provider
 * @param {string} root0.model - Selected model
 * @param {string} root0.defaultThinking - Default thinking mode
 * @param {string} root0.thinking - Current thinking mode
 * @param {Function} root0.onThinkingChange - Callback for thinking change
 * @param {Function} root0.onResetToDefaults - Callback to reset to defaults
 * @returns {JSX.Element} Settings toolbar component
 */
export function MessageSettingsToolbar({
  provider,
  model,
  defaultThinking,
  thinking,
  onThinkingChange,
  onResetToDefaults,
}: MessageSettingsToolbarProps) {
  const showSimplifiedOptions =
    provider === "openai" && (model === "o1" || model === "o3-mini");

  const isUsingDefaults = thinking === defaultThinking;

  return (
    <div className="border-t border-zinc-300 dark:border-zinc-700 px-4 py-1.5 flex justify-end">
      <div className="flex items-center gap-3">
        <label className="text-xs text-zinc-600 dark:text-zinc-400 shrink-0">
          Thinking
        </label>
        <select
          value={thinking}
          onChange={(e) =>
            onThinkingChange((e.target as HTMLSelectElement).value)
          }
          className="px-2 py-0.5 text-sm bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
        >
          {!showSimplifiedOptions && <option value="Default">Default</option>}
          {!showSimplifiedOptions && <option value="Off">Off</option>}
          {!showSimplifiedOptions && <option value="Minimal">Minimal</option>}
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          {!showSimplifiedOptions && <option value="Ultra">Ultra</option>}
        </select>

        <button
          onClick={onResetToDefaults}
          disabled={isUsingDefaults}
          className="px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 rounded disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          type="button"
        >
          ↺ Reset
        </button>
      </div>
    </div>
  );
}
