interface ThinkingSettingsProps {
  thinking: string;
  setThinking: (thinking: string) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
}

export function ThinkingSettings({
  thinking,
  setThinking,
  showThoughts,
  setShowThoughts,
}: ThinkingSettingsProps) {
  return (
    <>
      <div>
        <label className="block text-sm mb-2">Thinking</label>
        <select
          value={thinking}
          onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        >
          <option value="Off">Off</option>
          <option value="Auto">Auto</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Ultra">Ultra</option>
        </select>
      </div>
      {thinking !== "Off" && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showThoughts"
            checked={showThoughts}
            onChange={(e) =>
              setShowThoughts((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="showThoughts" className="text-sm">
            Show thinking process
          </label>
        </div>
      )}
    </>
  );
}
