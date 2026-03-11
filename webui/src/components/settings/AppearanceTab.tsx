// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface AppearanceTabProps {
  theme: string;
  setTheme: (theme: string) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
}

/**
 * Display tab component for settings (theme and display options)
 * @param {object} props - Component props
 * @param {string} props.theme - UI theme setting
 * @param {Function} props.setTheme - Function to update theme
 * @param {boolean} props.showTimestamps - Whether to show message timestamps
 * @param {Function} props.setShowTimestamps - Function to toggle timestamps
 * @param {boolean} props.showHelpLinks - Whether to show help link buttons
 * @param {Function} props.setShowHelpLinks - Function to toggle help links
 * @returns {JSX.Element} Display tab component
 */
export function AppearanceTab({
  theme,
  setTheme,
  showTimestamps,
  setShowTimestamps,
  showHelpLinks,
  setShowHelpLinks,
}: AppearanceTabProps) {
  return (
    <div className="space-y-4">
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
