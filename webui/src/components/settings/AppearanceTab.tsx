// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

interface AppearanceTabProps {
  theme: string;
  setTheme: (theme: string) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
}

/**
 * Appearance tab component for settings
 * @param {object} props - Component props
 * @param {string} props.theme - UI theme setting
 * @param {Function} props.setTheme - Function to update theme
 * @param {boolean} props.showTimestamps - Whether to show message timestamps
 * @param {Function} props.setShowTimestamps - Function to toggle timestamps
 * @returns {JSX.Element} Appearance tab component
 */
export function AppearanceTab({
  theme,
  setTheme,
  showTimestamps,
  setShowTimestamps,
}: AppearanceTabProps) {
  return (
    <div>
      <label htmlFor="theme-select" className="block text-sm mb-2">
        Theme
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>

      <label className="flex items-center gap-2 text-sm mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={showTimestamps}
          onChange={(e) =>
            setShowTimestamps((e.target as HTMLInputElement).checked)
          }
        />
        Show message timestamps
      </label>
    </div>
  );
}
