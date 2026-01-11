import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  GEMINI_MODELS,
  MISTRAL_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
} from "#webui/lib/constants/models";
import type { Provider } from "#webui/types/settings";

export interface ModelSelectorProps {
  provider: Provider;
  model: string;
  setModel: (model: string) => void;
}

/**
 * Model selection dropdown with provider-specific presets
 * @param {ModelSelectorProps} props - Component props
 * @param {Provider} props.provider - Current provider
 * @param {string} props.model - Current model
 * @param {(model: string) => void} props.setModel - Model setter callback
 * @returns {JSX.Element} - React component
 */
export function ModelSelector({
  provider,
  model,
  setModel,
}: ModelSelectorProps) {
  // Determine preset models for this provider
  const presetModels = useMemo(() => {
    return provider === "gemini"
      ? GEMINI_MODELS
      : provider === "openai"
        ? OPENAI_MODELS
        : provider === "mistral"
          ? MISTRAL_MODELS
          : provider === "openrouter"
            ? OPENROUTER_MODELS
            : provider === "ollama"
              ? OLLAMA_MODELS
              : [];
  }, [provider]);

  // Track whether custom input is shown (for non-custom providers)
  const [showCustomInput, setShowCustomInput] = useState(() => {
    if (provider === "custom" || presetModels.length === 0) return false;

    // Check if current model matches any preset (excluding "OTHER")
    return !presetModels.some((m) => m.value === model && m.value !== "OTHER");
  });

  // Ref for autofocusing the custom input when "Other..." is selected
  const customInputRef = useRef<HTMLInputElement>(null);
  const previousShowCustomInputRef = useRef(showCustomInput);

  // Sync showCustomInput when model or provider changes
  useEffect(() => {
    if (provider === "custom" || presetModels.length === 0) {
      setShowCustomInput(false);

      return;
    }

    const isCustom = !presetModels.some(
      (m) => m.value === model && m.value !== "OTHER",
    );

    setShowCustomInput(isCustom);
  }, [model, provider, presetModels]);

  // Autofocus custom input when user selects "Other..." (but not on initial load)
  useEffect(() => {
    if (
      showCustomInput &&
      !previousShowCustomInputRef.current &&
      customInputRef.current
    ) {
      customInputRef.current.focus();
    }

    previousShowCustomInputRef.current = showCustomInput;
  }, [showCustomInput]);

  // For custom and local providers, use free-form text input
  if (provider === "custom" || provider === "lmstudio") {
    const placeholder =
      provider === "lmstudio"
        ? "e.g., llama-3.1-70b, qwen-2.5-72b"
        : "e.g., gpt-4, llama-3.1-70b";

    return (
      <div>
        <label className="block text-sm mb-2">Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel((e.target as HTMLInputElement).value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        />
      </div>
    );
  }

  // Provider-specific dropdowns
  const dropdownValue = showCustomInput ? "OTHER" : model;

  const handleDropdownChange = (value: string) => {
    if (value === "OTHER") {
      setShowCustomInput(true);
      // Keep current model value - user will edit in text input
    } else {
      setShowCustomInput(false);
      setModel(value);
    }
  };

  return (
    <div>
      <label className="block text-sm mb-2">Model</label>
      <select
        value={dropdownValue}
        onChange={(e) =>
          handleDropdownChange((e.target as HTMLSelectElement).value)
        }
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        data-testid="model-select"
      >
        {presetModels.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {showCustomInput && (
        <input
          ref={customInputRef}
          type="text"
          value={model}
          onChange={(e) => setModel((e.target as HTMLInputElement).value)}
          placeholder="e.g., gpt-4, claude-3-opus"
          className="w-full px-3 py-2 mt-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        />
      )}
    </div>
  );
}
