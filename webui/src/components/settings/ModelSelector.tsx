export function ModelSelector({ model, setModel }) {
  return (
    <div>
      <label className="block text-sm mb-2">Model</label>
      <select
        value={model}
        onChange={(e) => setModel((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
      >
        <option value="gemini-2.5-pro">Gemini 2.5 Pro (most advanced)</option>
        <option value="gemini-2.5-flash">
          Gemini 2.5 Flash (fast & intelligent)
        </option>
        <option value="gemini-2.5-flash-lite">
          Gemini 2.5 Flash-Lite (ultra fast)
        </option>
      </select>
    </div>
  );
}
