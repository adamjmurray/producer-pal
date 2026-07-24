// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type ProviderStateSetters } from "#webui/hooks/settings/settings-helpers";
import { type ChatPreset, type Provider } from "#webui/types/settings";

/**
 * Build the `applyPreset` action for the settings hub. Loading a preset must
 * write its model/thinking into the preset's *own*
 * provider slice — the plain per-field setters (useProviderSetters) close over
 * the currently-active provider, so calling them after switching provider would
 * write to the wrong slice. A functional update keyed by the preset's provider
 * sidesteps that ordering hazard entirely; the active provider is switched and
 * the global small-model mode set afterwards. apiKey/baseUrl are never touched —
 * a preset only names which provider to run, and the key resolves live from the
 * encrypted per-provider store.
 *
 * The captured toolset is applied verbatim, but only when the preset carries
 * one: a legacy preset (saved before toolsets) has no `enabledTools`, and
 * applying it must leave the current tools untouched ("inherit").
 *
 * @param providerStateSetters - Per-provider slice setters
 * @param setProvider - Switches the active provider
 * @param setSmallModelMode - Sets the global small-model-mode flag
 * @param setEnabledTools - Replaces the global tool-enablement map
 * @returns Callback that loads a preset into the live editable settings buffer
 */
export function useApplyPreset(
  providerStateSetters: ProviderStateSetters,
  setProvider: (provider: Provider) => void,
  setSmallModelMode: (enabled: boolean) => void,
  setEnabledTools: (tools: Record<string, boolean>) => void,
): (preset: ChatPreset) => void {
  return useCallback(
    (preset: ChatPreset) => {
      providerStateSetters[preset.provider]((prev) => ({
        ...prev,
        model: preset.model,
        thinking: preset.thinking,
      }));
      setProvider(preset.provider);
      setSmallModelMode(preset.smallModelMode);
      if (preset.enabledTools) setEnabledTools({ ...preset.enabledTools });
    },
    [providerStateSetters, setProvider, setSmallModelMode, setEnabledTools],
  );
}
