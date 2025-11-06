import { TOOLS } from "../../constants/tools.js";

interface ToolTogglesProps {
  enabledTools: Record<string, boolean>;
  setEnabledTools: (tools: Record<string, boolean>) => void;
  enableAllTools: () => void;
  disableAllTools: () => void;
}

export function ToolToggles({
  enabledTools,
  setEnabledTools,
  enableAllTools,
  disableAllTools,
}: ToolTogglesProps) {
  const handleToggle = (toolId: string) => {
    setEnabledTools({
      ...enabledTools,
      [toolId]: !enabledTools[toolId],
    });
  };

  // Filter out Raw Live API if not built with env var
  const visibleTools = TOOLS.filter((tool) => {
    if (tool.requiresEnvVar) {
      return import.meta.env.ENABLE_RAW_LIVE_API === true;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium">Available Tools</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={enableAllTools}
            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Enable all
          </button>
          <button
            type="button"
            onClick={disableAllTools}
            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Disable all
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {visibleTools.map((tool) => (
          <div key={tool.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`tool-${tool.id}`}
              checked={enabledTools[tool.id] ?? true}
              onChange={() => handleToggle(tool.id)}
            />
            <label htmlFor={`tool-${tool.id}`} className="text-sm">
              {tool.name}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
