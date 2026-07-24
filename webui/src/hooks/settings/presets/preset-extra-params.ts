// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChatPreset, type Provider } from "#webui/types/settings";

/** Resolves a provider's live connection (decrypted key + base URL). */
type GetProviderConnection = (provider: Provider) => {
  apiKey: string;
  baseUrl?: string;
};

/**
 * The subagents integration seam: translate a preset into the `extraParams`
 * bag that `chatAdapter.buildConfig` consumes, resolving the
 * provider's key/baseUrl live from the encrypted per-provider store (a preset
 * only *names* the provider). A worker's cloned config is then built exactly
 * like the main chat's — `buildConfig(preset.model, preset.thinking,
 * enabledTools, chatHistory, presetToExtraParams(preset, …))`. model/thinking
 * are positional args to buildConfig, so they stay out of this bag by design.
 * @param preset - The preset a worker runs under
 * @param getProviderConnection - Reads the provider's stored key/baseUrl
 * @returns The extraParams object for buildConfig
 */
export function presetToExtraParams(
  preset: ChatPreset,
  getProviderConnection: GetProviderConnection,
): Record<string, unknown> {
  const { apiKey, baseUrl } = getProviderConnection(preset.provider);

  return {
    provider: preset.provider,
    apiKey,
    baseUrl,
  };
}
