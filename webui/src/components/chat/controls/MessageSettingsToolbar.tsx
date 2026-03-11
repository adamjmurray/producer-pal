// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isShowThoughtsSupported } from "#webui/hooks/settings/config-builders";
import { type Provider } from "#webui/types/settings";

export interface MessageSettingsToolbarProps {
  provider: Provider;
  model: string;
  defaultThinking: string;
  defaultShowThoughts: boolean;
  thinking: string;
  showThoughts: boolean;
  onThinkingChange: (thinking: string) => void;
  onShowThoughtsChange: (showThoughts: boolean) => void;
  onResetToDefaults: () => void;
}

/**
 * Single-row toolbar for per-conversation thinking settings
 * @param {MessageSettingsToolbarProps} root0 - Component props
 * @param {Provider} root0.provider - Selected provider
 * @param {string} root0.model - Selected model
 * @param {string} root0.defaultThinking - Default thinking mode
 * @param {boolean} root0.defaultShowThoughts - Default showThoughts setting
 * @param {string} root0.thinking - Current thinking mode
 * @param {boolean} root0.showThoughts - Current showThoughts setting
 * @param {Function} root0.onThinkingChange - Callback for thinking change
 * @param {Function} root0.onShowThoughtsChange - Callback for showThoughts change
 * @param {Function} root0.onResetToDefaults - Callback to reset to defaults
 * @returns {JSX.Element} Settings toolbar component
 */
export function MessageSettingsToolbar({
  provider,
  model,
  defaultThinking,
  defaultShowThoughts,
  thinking,
  showThoughts,
  onThinkingChange,
  onShowThoughtsChange,
  onResetToDefaults,
}: MessageSettingsToolbarProps) {
  const showSimplifiedOptions =
    provider === "openai" && (model === "o1" || model === "o3-mini");
  const showShowThoughtsCheckbox = isShowThoughtsSupported(provider, thinking);

  const isUsingDefaults =
    thinking === defaultThinking && showThoughts === defaultShowThoughts;

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

        {showShowThoughtsCheckbox && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 shrink-0">
            <input
              type="checkbox"
              id="messageShowThoughts"
              checked={showThoughts}
              onChange={(e) =>
                onShowThoughtsChange((e.target as HTMLInputElement).checked)
              }
            />
            Show thinking
          </label>
        )}

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
