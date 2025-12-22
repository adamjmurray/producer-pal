interface SettingsFooterProps {
  settingsConfigured: boolean;
  saveSettings: () => void;
  cancelSettings: () => void;
}

/**
 * Settings footer component with save/cancel buttons
 * @param {object} root0 - Component props
 * @param {boolean} root0.settingsConfigured - Whether settings have been configured
 * @param {Function} root0.saveSettings - Function to save settings
 * @param {Function} root0.cancelSettings - Function to cancel settings changes
 * @returns {JSX.Element} Settings footer component
 */
export function SettingsFooter({
  settingsConfigured,
  saveSettings,
  cancelSettings,
}: SettingsFooterProps) {
  return (
    <>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
        {settingsConfigured
          ? "Note: Settings changes apply to new conversations."
          : "Settings will be stored in this web browser."}
      </p>

      <div className="flex gap-2 mt-4">
        <button
          onClick={saveSettings}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Save
        </button>
        {settingsConfigured && (
          <button
            onClick={cancelSettings}
            className="px-4 py-2 bg-gray-600 text-white rounded"
          >
            Cancel
          </button>
        )}
      </div>
    </>
  );
}
