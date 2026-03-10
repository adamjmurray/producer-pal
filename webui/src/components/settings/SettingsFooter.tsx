// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

interface SettingsFooterProps {
  settingsConfigured: boolean;
  saveSettings: () => void;
  cancelSettings: () => void;
}

/**
 * Settings footer component with save/cancel buttons
 * @param {object} props - Component props
 * @param {boolean} props.settingsConfigured - Whether settings have been configured
 * @param {Function} props.saveSettings - Function to save settings
 * @param {Function} props.cancelSettings - Function to cancel settings changes
 * @returns {JSX.Element} Settings footer component
 */
export function SettingsFooter({
  settingsConfigured,
  saveSettings,
  cancelSettings,
}: SettingsFooterProps) {
  return (
    <>
      {!settingsConfigured && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-6">
          Settings will be stored in this web browser.
        </p>
      )}

      <div className="flex gap-2 mt-4">
        {settingsConfigured && (
          <button
            onClick={cancelSettings}
            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
        )}
        <button
          onClick={saveSettings}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </>
  );
}
