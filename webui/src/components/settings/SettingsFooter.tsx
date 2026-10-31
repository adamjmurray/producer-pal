// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

interface SettingsFooterProps {
  /** Whether chat has been set up (a Save with a usable connection). Until then
   * Settings is closable but the footer notes where settings are stored. */
  chatSetUp: boolean;
  /** Whether the Installation tab is showing. It has no settings of its own, so
   * there Save only does something once another tab has unsaved changes. */
  installationTab: boolean;
  saveSettings: () => void;
  cancelSettings: () => void;
  pulse: boolean;
  hasUnsavedChanges: boolean;
  /** Message from the last failed saveSettings(), or null. When set, the
   * modal stayed open after Save because durable persistence failed; render
   * it above the buttons so the user sees what went wrong. */
  saveError: string | null;
  /** Why Save is unavailable right now, or null. Set while a sub-form owns the
   * dialog (the Presets tab's create form), where saving would close the modal
   * and discard the draft. Disables Save and explains it. */
  blockedMessage?: string | null;
}

/**
 * Settings footer component with save/cancel buttons
 * @param {object} props - Component props
 * @param {boolean} props.chatSetUp - Whether chat has been set up
 * @param {boolean} props.installationTab - Whether the Installation tab is showing
 * @param {Function} props.saveSettings - Function to save settings
 * @param {Function} props.cancelSettings - Function to cancel settings changes
 * @param {boolean} props.pulse - Whether to pulse buttons to draw attention
 * @param {boolean} props.hasUnsavedChanges - Whether there are unsaved changes
 * @param {string | null} props.saveError - Error from the last failed save
 * @param {string | null} props.blockedMessage - Why Save is disabled, or null
 * @returns {JSX.Element} Settings footer component
 */
export function SettingsFooter({
  chatSetUp,
  installationTab,
  saveSettings,
  cancelSettings,
  pulse,
  hasUnsavedChanges,
  saveError,
  blockedMessage = null,
}: SettingsFooterProps) {
  const pulseClass = pulse ? " settings-button-pulse" : "";
  const showNotice =
    hasUnsavedChanges || saveError != null || blockedMessage != null;
  // Nothing to save here: Save stays off, and the left button just closes.
  const saveDisabled =
    blockedMessage != null || (installationTab && !hasUnsavedChanges);
  const closeOnly = !hasUnsavedChanges && (installationTab || !chatSetUp);

  return (
    <>
      {!chatSetUp && (
        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-300">
          Settings will be stored in this web browser.
        </p>
      )}

      {/* The blocked notice replaces the unsaved-changes nag — both say "you
          can't leave yet", and only this one is actionable. A saveError is a
          separate failure and still shows. */}
      {hasUnsavedChanges && !saveError && !blockedMessage && (
        <p className="mt-4 text-xs text-red-600 dark:text-red-400">
          You have unsaved changes. Save or cancel to dismiss.
        </p>
      )}

      {saveError && (
        <p className="mt-4 text-xs text-red-600 dark:text-red-400" role="alert">
          Failed to save settings: {saveError}
        </p>
      )}

      {blockedMessage && (
        <p
          className="mt-4 text-xs text-amber-600 dark:text-amber-400"
          data-testid="settings-save-blocked"
        >
          {blockedMessage}
        </p>
      )}

      <div className={`flex gap-2 ${showNotice ? "mt-2" : "mt-4"}`}>
        <button
          onClick={cancelSettings}
          className={`rounded-lg border border-zinc-300 bg-zinc-200 px-4 py-2 hover:bg-zinc-300 dark:border-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-700${pulseClass}`}
        >
          {closeOnly ? "Close" : "Cancel"}
        </button>
        <button
          onClick={saveSettings}
          disabled={saveDisabled}
          className={`flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed${pulseClass}`}
        >
          Save
        </button>
      </div>
    </>
  );
}
