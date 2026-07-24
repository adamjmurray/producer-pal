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

/** The provider + live connection a preset resolves to (the extraParams bag). */
export interface PresetConnection {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;
}

/**
 * A "Default subagent" preset resolved to everything buildWorkerConfig needs:
 * the connection (provider + live key/baseUrl) plus the model/inference a
 * v2.0.1 preset swaps. Tools and system instruction are absent by design — a
 * worker inherits those from the orchestrator.
 */
export interface ResolvedSubagentPreset extends PresetConnection {
  model: string;
  thinking: string;
  smallModelMode: boolean;
}

/**
 * The subagents integration seam: translate a preset into the `extraParams`
 * bag that `chatAdapter.buildConfig` consumes, resolving the
 * provider's key/baseUrl live from the encrypted per-provider store (a preset
 * only *names* the provider). model/thinking are positional args to buildConfig,
 * so they stay out of this bag by design.
 * @param preset - The preset a worker runs under
 * @param getProviderConnection - Reads the provider's stored key/baseUrl
 * @returns The connection object for buildConfig's extraParams
 */
export function presetToExtraParams(
  preset: ChatPreset,
  getProviderConnection: GetProviderConnection,
): PresetConnection {
  const { apiKey, baseUrl } = getProviderConnection(preset.provider);

  return {
    provider: preset.provider,
    apiKey,
    baseUrl,
  };
}

/**
 * Resolve the user's chosen "Default subagent" preset id into the full bundle a
 * spawned worker runs under, or `undefined` to inherit the orchestrator config.
 * Returns undefined for the inherit sentinel (null/empty) AND for a dangling id
 * (a preset since deleted) so a stale setting degrades gracefully to inherit.
 * @param presetId - The saved default-subagent preset id (null/empty = inherit)
 * @param presets - The current preset list
 * @param getProviderConnection - Reads the preset provider's key/baseUrl live
 * @returns The resolved worker preset, or undefined to inherit
 */
export function resolveSubagentPreset(
  presetId: string | null,
  presets: ChatPreset[],
  getProviderConnection: GetProviderConnection,
): ResolvedSubagentPreset | undefined {
  if (presetId == null || presetId === "") return undefined;

  const preset = presets.find((p) => p.id === presetId);

  if (preset == null) return undefined;

  return {
    ...presetToExtraParams(preset, getProviderConnection),
    model: preset.model,
    thinking: preset.thinking,
    smallModelMode: preset.smallModelMode,
  };
}
