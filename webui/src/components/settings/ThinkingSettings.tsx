import type { Provider } from "../../types/settings.js";

interface ThinkingSettingsProps {
  provider: Provider;
  model: string;
  thinking: string;
  setThinking: (thinking: string) => void;
  showThoughts: boolean;
  setShowThoughts: (show: boolean) => void;
}

function isO1OrO3Model(model: string): boolean {
  return model === "o1" || model === "o3-mini";
}

export function ThinkingSettings({
  provider,
  model,
  thinking,
  setThinking,
  showThoughts,
  setShowThoughts,
}: ThinkingSettingsProps) {
  // Determine which options to show based on provider and model
  const isGemini = provider === "gemini";
  const isOpenAIReasoning = provider === "openai" && isO1OrO3Model(model);

  // For Gemini: show all options
  // For OpenAI o1/o3: show only Low/Medium/High
  const showSimplifiedOptions = isOpenAIReasoning;

  return (
    <>
      <div>
        <label className="block text-sm mb-2">Thinking</label>
        <select
          value={thinking}
          onChange={(e) => setThinking((e.target as HTMLSelectElement).value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        >
          {!showSimplifiedOptions && <option value="Off">Off</option>}
          {!showSimplifiedOptions && <option value="Auto">Auto</option>}
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          {!showSimplifiedOptions && <option value="Ultra">Ultra</option>}
        </select>
      </div>
      {/* Only show "Show thinking process" checkbox for Gemini */}
      {isGemini && thinking !== "Off" && (
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
