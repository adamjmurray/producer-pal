// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

interface SettingsFooterProps {
  settingsConfigured: boolean;
  saveSettings: () => void;
  cancelSettings: () => void;
  pulse: boolean;
  hasUnsavedChanges: boolean;
  /** Message from the last failed saveSettings(), or null. When set, the
   * modal stayed open after Save because durable persistence failed; render
   * it above the buttons so the user sees what went wrong. */
  saveError: string | null;
}

/**
 * Settings footer component with save/cancel buttons
 * @param {object} props - Component props
 * @param {boolean} props.settingsConfigured - Whether settings have been configured
 * @param {Function} props.saveSettings - Function to save settings
 * @param {Function} props.cancelSettings - Function to cancel settings changes
 * @param {boolean} props.pulse - Whether to pulse buttons to draw attention
 * @param {boolean} props.hasUnsavedChanges - Whether there are unsaved changes
 * @param {string | null} props.saveError - Error from the last failed save
 * @returns {JSX.Element} Settings footer component
 */
export function SettingsFooter({
  settingsConfigured,
  saveSettings,
  cancelSettings,
  pulse,
  hasUnsavedChanges,
  saveError,
}: SettingsFooterProps) {
  const pulseClass = pulse ? " settings-button-pulse" : "";

  return (
    <>
      {!settingsConfigured && (
        <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-6">
          Settings will be stored in this web browser.
        </p>
      )}

      {hasUnsavedChanges && !saveError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-4">
          You have unsaved changes. Save or cancel to dismiss.
        </p>
      )}

      {saveError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-4" role="alert">
          Failed to save settings: {saveError}
        </p>
      )}

      <div
        className={`flex gap-2 ${hasUnsavedChanges || saveError ? "mt-2" : "mt-4"}`}
      >
        {settingsConfigured && (
          <button
            onClick={cancelSettings}
            className={`px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-700${pulseClass}`}
          >
            Cancel
          </button>
        )}
        <button
          onClick={saveSettings}
          className={`flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50${pulseClass}`}
        >
          Save
        </button>
      </div>
    </>
  );
}
