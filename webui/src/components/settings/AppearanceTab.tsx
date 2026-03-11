// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";
import { ThinkingSettings } from "./controls/ThinkingSettings";

interface AppearanceTabProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
  resetBehaviorToDefaults: () => void;
}

/**
 * Appearance tab component for settings
 * @param {object} props - Component props
 * @param {Provider} props.provider - Selected provider
 * @param {string} props.model - Selected model
 * @param {string} props.thinking - Thinking mode setting
 * @param {Function} props.setThinking - Function to update thinking mode
 * @param {string} props.theme - UI theme setting
 * @param {Function} props.setTheme - Function to update theme
 * @param {boolean} props.showTimestamps - Whether to show message timestamps
 * @param {Function} props.setShowTimestamps - Function to toggle timestamps
 * @param {boolean} props.showHelpLinks - Whether to show help link buttons
 * @param {Function} props.setShowHelpLinks - Function to toggle help links
 * @param {Function} props.resetBehaviorToDefaults - Function to reset behavior settings
 * @returns {JSX.Element} Appearance tab component
 */
export function AppearanceTab({
  provider,
  model,
  thinking,
  setThinking,
  theme,
  setTheme,
  showTimestamps,
  setShowTimestamps,
  showHelpLinks,
  setShowHelpLinks,
  resetBehaviorToDefaults,
}: AppearanceTabProps) {
  return (
    <div className="space-y-4">
      <ThinkingSettings
        provider={provider}
        model={model}
        thinking={thinking}
        setThinking={setThinking}
        resetToDefaults={resetBehaviorToDefaults}
      />

      <div>
        <label htmlFor="theme-select" className="block text-sm mb-2">
          Theme
        </label>
        <select
          id="theme-select"
          value={theme}
          onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
          className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={showTimestamps}
          onChange={(e) =>
            setShowTimestamps((e.target as HTMLInputElement).checked)
          }
        />
        Show message timestamps
      </label>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={showHelpLinks}
          onChange={(e) =>
            setShowHelpLinks((e.target as HTMLInputElement).checked)
          }
        />
        Show help links
      </label>
    </div>
  );
}
