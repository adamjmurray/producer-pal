// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";

interface ProviderSelectorProps {
  provider: Provider;
  setProvider: (provider: Provider) => void;
}

/**
 * Dropdown selector for AI provider
 * @param {ProviderSelectorProps} props - Component props
 * @param {Provider} props.provider - Current provider
 * @param {(provider: Provider) => void} props.setProvider - Provider setter callback
 * @returns {JSX.Element} - React component
 */
export function ProviderSelector({
  provider,
  setProvider,
}: ProviderSelectorProps) {
  return (
    <div>
      <label className="mb-2 block text-sm">Provider</label>
      <select
        value={provider}
        onChange={(e) =>
          setProvider((e.target as HTMLSelectElement).value as Provider)
        }
        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700"
        data-testid="provider-select"
      >
        <option value="gemini">Google</option>
        <option value="mistral">Mistral</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="ollama">Ollama (local)</option>
        <option value="lmstudio">LM Studio (local)</option>
        <option value="openrouter">OpenRouter</option>
        <option value="custom">Custom (OpenAI-compatible)</option>
      </select>
    </div>
  );
}
