interface AppearanceTabProps {
  theme: string;
  setTheme: (theme: string) => void;
}

/**
 * Appearance tab for chat settings
 * @param {AppearanceTabProps} root0 - Component props
 * @param {string} root0.theme - UI theme setting
 * @param {Function} root0.setTheme - Function to update theme
 * @returns {JSX.Element} Appearance tab component
 */
export function AppearanceTab({ theme, setTheme }: AppearanceTabProps) {
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
    </div>
  );
}
