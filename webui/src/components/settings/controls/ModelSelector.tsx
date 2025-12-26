import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Provider } from "#webui/types/settings";

interface ModelSelectorProps {
  provider: Provider;
  model: string;
  setModel: (model: string) => void;
}

const GEMINI_MODELS = [
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (most advanced)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast & intelligent)" },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite (ultra fast)",
  },
  { value: "OTHER", label: "Other..." },
];

const OPENAI_MODELS = [
  { value: "gpt-5.2-2025-12-11", label: "GPT-5.2 (most capable)" },
  { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { value: "gpt-5-2025-08-07", label: "GPT-5 (previous version)" },
  { value: "gpt-5-mini-2025-08-07", label: "GPT-5 Mini (fast & affordable)" },
  { value: "gpt-4o-2024-08-06", label: "GPT-4o" },
  { value: "OTHER", label: "Other..." },
];

const MISTRAL_MODELS = [
  { value: "mistral-large-latest", label: "Mistral Large" },
  { value: "mistral-medium-latest", label: "Mistral Medium" },
  { value: "mistral-small-latest", label: "Mistral Small" },
  { value: "magistral-medium-2509", label: "Magistral Medium" },
  { value: "magistral-small-2509", label: "Magistral Small" },
  { value: "OTHER", label: "Other..." },
];

export const OPENROUTER_MODELS = [
  // Free models
  { value: "z-ai/glm-4.5-air:free", label: "[Free] Z.AI GLM 4.5 Air" },
  { value: "qwen/qwen3-coder:free", label: "[Free] Qwen3 Coder 480B" },
  { value: "mistralai/devstral-2512:free", label: "[Free] Mistral Devstral 2" },
  {
    value: "nvidia/nemotron-3-nano-30b-a3b:free",
    label: "[Free] Nvidia Nemotron 3 Nano",
  },
  // Paid models
  {
    value: "google/gemini-3-flash-preview",
    label: "[Paid] Google Gemini 3 Flash",
  },
  {
    value: "google/gemini-3-pro-preview",
    label: "[Paid] Google Gemini 3 Pro",
  },
  {
    value: "anthropic/claude-sonnet-4.5",
    label: "[Paid] Anthropic Claude Sonnet 4.5",
  },
  {
    value: "anthropic/claude-opus-4.5",
    label: "[Paid] Anthropic Claude Opus 4.5",
  },
  { value: "openai/gpt-5.2", label: "[Paid] OpenAI GPT-5.2" },
  {
    value: "openai/gpt-5.1-codex-max",
    label: "[Paid] OpenAI GPT-5.1 Codex Max",
  },
  { value: "x-ai/grok-4.1-fast", label: "[Paid] xAI Grok 4.1 Fast" },
  { value: "mistralai/mistral-large-2512", label: "[Paid] Mistral Large" },
  { value: "qwen/qwen3-max", label: "[Paid] Qwen3 Max" },
  { value: "minimax/minimax-m2.1", label: "[Paid] MiniMax M2.1" },
  { value: "OTHER", label: "Other..." },
];

const OLLAMA_MODELS = [
  { value: "ministral-3", label: "Ministral 3" },
  { value: "devstral-small-2", label: "Devstral Small 2" },
  { value: "mistral", label: "Mistral" },
  { value: "gpt-oss", label: "GPT-OSS" },
  { value: "qwen3", label: "Qwen3" },
  { value: "qwen3-coder", label: "Qwen3 Coder" },
  { value: "OTHER", label: "Other..." },
];

/**
 * Model selection dropdown with provider-specific presets
 * @param {ModelSelectorProps} root0 - Component props
 * @param {Provider} root0.provider - Current provider
 * @param {string} root0.model - Current model
 * @param {(model: string) => void} root0.setModel - Model setter callback
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
