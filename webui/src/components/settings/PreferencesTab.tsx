// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface PreferencesTabProps {
  theme: string;
  setTheme: (theme: string) => void;
  showTimestamps: boolean;
  setShowTimestamps: (show: boolean) => void;
  showHelpLinks: boolean;
  setShowHelpLinks: (show: boolean) => void;
  showTokenUsage: boolean;
  setShowTokenUsage: (show: boolean) => void;
  autoUpdateCheck: boolean;
  setAutoUpdateCheck: (enabled: boolean) => void;
  onDeleteAllConversations: () => void;
  onDeleteUnbookmarkedConversations: () => void;
}

/**
 * Preferences tab component for settings (theme and display options)
 * @param {object} props - Component props
 * @param {string} props.theme - UI theme setting
 * @param {Function} props.setTheme - Function to update theme
 * @param {boolean} props.showTimestamps - Whether to show message timestamps
 * @param {Function} props.setShowTimestamps - Function to toggle timestamps
 * @param {boolean} props.showHelpLinks - Whether to show help link buttons
 * @param {Function} props.setShowHelpLinks - Function to toggle help links
 * @param {boolean} props.showTokenUsage - Whether to show per-message token usage
 * @param {Function} props.setShowTokenUsage - Function to toggle token usage
 * @param {boolean} props.autoUpdateCheck - Whether to check GitHub for new releases
 * @param {Function} props.setAutoUpdateCheck - Function to toggle update checking
 * @param {Function} props.onDeleteAllConversations - Callback to delete all conversations
 * @param {Function} props.onDeleteUnbookmarkedConversations - Callback to delete unstarred conversations
 * @returns {JSX.Element} Preferences tab component
 */
export function PreferencesTab({
  theme,
  setTheme,
  showTimestamps,
  setShowTimestamps,
  showHelpLinks,
  setShowHelpLinks,
  showTokenUsage,
  setShowTokenUsage,
  autoUpdateCheck,
  setAutoUpdateCheck,
  onDeleteAllConversations,
  onDeleteUnbookmarkedConversations,
}: PreferencesTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="theme-select" className="mb-2 block text-sm">
          Theme
        </label>
        <select
          id="theme-select"
          value={theme}
          onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showTimestamps}
          onChange={(e) =>
            setShowTimestamps((e.target as HTMLInputElement).checked)
          }
        />
        Show message timestamps
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showHelpLinks}
          onChange={(e) =>
            setShowHelpLinks((e.target as HTMLInputElement).checked)
          }
        />
        Show help links
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showTokenUsage}
          onChange={(e) =>
            setShowTokenUsage((e.target as HTMLInputElement).checked)
          }
        />
        Show message token usage
      </label>

      {/* Machine-wide and shared with the Max for Live device, so it applies
          on change rather than on Save — like the Delete buttons below. */}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoUpdateCheck}
          onChange={(e) =>
            setAutoUpdateCheck((e.target as HTMLInputElement).checked)
          }
        />
        Automatically check for new versions
      </label>

      <div className="mt-4 border-t border-zinc-300 pt-4 dark:border-zinc-600">
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-300">
          Cleanup Conversations
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Delete all conversations that are not bookmarked? This cannot be undone.",
                )
              ) {
                onDeleteUnbookmarkedConversations();
              }
            }}
            className="rounded-lg border border-red-600 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-600 hover:text-white"
          >
            Delete unstarred
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete all conversations? This cannot be undone.")) {
                onDeleteAllConversations();
              }
            }}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700"
          >
            Delete all
          </button>
        </div>
      </div>
      <div className="border-b border-zinc-300 dark:border-zinc-600" />
    </div>
  );
}
