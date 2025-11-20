import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Provider } from "../../types/settings.js";

interface ModelSelectorProps {
  provider: Provider;
  model: string;
  setModel: (model: string) => void;
}

const GEMINI_MODELS = [
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (most advanced)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast & intelligent)" },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite (ultra fast)",
  },
  { value: "OTHER", label: "Other..." },
];

const OPENAI_MODELS = [
  { value: "gpt-5-2025-08-07", label: "GPT-5 (most capable)" },
  { value: "gpt-5-mini-2025-08-07", label: "GPT-5 Mini (fast & affordable)" },
  { value: "gpt-5-nano-2025-08-07", label: "GPT-5 Nano (ultra fast)" },
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

const OPENROUTER_MODELS = [
  // Free models
  { value: "minimax/minimax-m2:free", label: "[Free] MiniMax M2" },
  { value: "qwen/qwen3-235b-a22b:free", label: "[Free] Qwen3 235B A22B" },
  // Paid models - MiniMax
  { value: "minimax/minimax-m1", label: "[Paid] MiniMax M1 (smart)" },
  { value: "minimax/minimax-m2", label: "[Paid] MiniMax M2 (basic)" },
  // Paid models - Qwen
  { value: "qwen/qwen3-max", label: "[Paid] Qwen3 Max (smart)" },
  {
    value: "qwen/qwen3-235b-a22b-07-25",
    label: "[Paid] Qwen3 235B A22B (basic)",
  },
  // Paid models - Moonshot AI
  { value: "moonshotai/kimi-k2", label: "[Paid] Kimi K2" },
  // Paid models - Perplexity
  {
    value: "perplexity/sonar-reasoning-pro",
    label: "[Paid] Sonar Reasoning Pro (smart)",
  },
  {
    value: "perplexity/sonar-reasoning",
    label: "[Paid] Sonar Reasoning (fast)",
  },
  // Paid models - xAI
  { value: "x-ai/grok-4", label: "[Paid] Grok 4 (smart)" },
  { value: "x-ai/grok-4-fast", label: "[Paid] Grok 4 Fast (fast)" },

  // Paid models - Anthropic
  {
    value: "anthropic/claude-sonnet-4-5-20250929",
    label: "[Paid] Claude Sonnet 4.5 (smart)",
  },
  {
    value: "anthropic/claude-haiku-4-5-20250514",
    label: "[Paid] Claude Haiku 4.5 (fast)",
  },
  // Paid models - Google
  { value: "google/gemini-2.5-pro", label: "[Paid] Gemini 2.5 Pro (smart)" },
  { value: "google/gemini-2.5-flash", label: "[Paid] Gemini 2.5 Flash (fast)" },
  // Paid models - Mistral
  {
    value: "mistralai/magistral-medium-2506:thinking",
    label: "[Paid] Magistral Medium (thinking)",
  },
  {
    value: "mistralai/mistral-medium-3.1",
    label: "[Paid] Mistral Medium 3.1 (basic)",
  },
  // Paid models - OpenAI
  { value: "openai/gpt-5", label: "[Paid] GPT-5 (smart)" },
  { value: "openai/gpt-5-mini", label: "[Paid] GPT-5 Mini (fast)" },
  { value: "OTHER", label: "Other..." },
];

/**
 *
 * @param root0
 * @param root0.provider
 * @param root0.model
 * @param root0.setModel
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
  if (
    provider === "custom" ||
    provider === "lmstudio" ||
    provider === "ollama"
  ) {
    const placeholder =
      provider === "lmstudio" || provider === "ollama"
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
