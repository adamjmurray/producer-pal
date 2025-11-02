import type { Provider } from "../../types/settings.js";

interface ProviderSelectorProps {
  provider: Provider;
  setProvider: (provider: Provider) => void;
}

export function ProviderSelector({
  provider,
  setProvider,
}: ProviderSelectorProps) {
  return (
    <div>
      <label className="block text-sm mb-2">Provider</label>
      <select
        value={provider}
        onChange={(e) =>
          setProvider((e.target as HTMLSelectElement).value as Provider)
        }
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
      >
        <option value="gemini">Google</option>
        <option value="openai">OpenAI</option>
        <option value="mistral">Mistral</option>
        <option value="openrouter">OpenRouter</option>
        <option value="custom">Custom (OpenAI-compatible)</option>
      </select>
    </div>
  );
}
