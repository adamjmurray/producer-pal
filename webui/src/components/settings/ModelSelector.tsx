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
];

const OPENAI_MODELS = [
  { value: "gpt-5-2025-08-07", label: "GPT-5 (most capable)" },
  { value: "gpt-5-mini-2025-08-07", label: "GPT-5 Mini (fast & affordable)" },
  { value: "gpt-5-nano-2025-08-07", label: "GPT-5 Nano (ultra fast)" },
];

const GROQ_MODELS = [
  { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  {
    value: "meta-llama/llama-4-maverick-17b-128e-instruct",
    label: "Llama 4 Maverick 17B",
  },
  { value: "moonshotai/kimi-k2-instruct-0905", label: "Kimi K2" },
  { value: "qwen/qwen3-32b", label: "Qwen 3 32B" },
];

const MISTRAL_MODELS = [
  { value: "mistral-large-latest", label: "Mistral Large" },
  { value: "mistral-medium-latest", label: "Mistral Medium" },
  { value: "mistral-small-latest", label: "Mistral Small" },
  { value: "magistral-medium-2509", label: "Magistral Medium" },
  { value: "magistral-small-2509", label: "Magistral Small" },
];

export function ModelSelector({
  provider,
  model,
  setModel,
}: ModelSelectorProps) {
  // For custom provider, use free-form text input
  if (provider === "custom") {
    return (
      <div>
        <label className="block text-sm mb-2">Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel((e.target as HTMLInputElement).value)}
          placeholder="e.g., gpt-4, llama-3.1-70b"
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
        />
      </div>
    );
  }

  // Provider-specific dropdowns
  const models =
    provider === "gemini"
      ? GEMINI_MODELS
      : provider === "openai"
        ? OPENAI_MODELS
        : provider === "groq"
          ? GROQ_MODELS
          : MISTRAL_MODELS;

  return (
    <div>
      <label className="block text-sm mb-2">Model</label>
      <select
        value={model}
        onChange={(e) => setModel((e.target as HTMLSelectElement).value)}
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded"
      >
        {models.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
