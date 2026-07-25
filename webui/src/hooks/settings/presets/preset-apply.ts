// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type Notation } from "#src/shared/notation";
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
 * The captured toolset and notation are applied verbatim, but only when the
 * preset carries them: a legacy preset (saved before either existed) has no
 * `enabledTools` / `notation`, and applying it must leave the current values
 * untouched ("inherit"). Skipping notation also leaves its dirty flag clear, so
 * loading a legacy preset never posts a redundant `/config` write on Save.
 *
 * @param providerStateSetters - Per-provider slice setters
 * @param setProvider - Switches the active provider
 * @param setSmallModelMode - Sets the global small-model-mode flag
 * @param setEnabledTools - Replaces the global tool-enablement map
 * @param setNotation - Sets the notation buffer (and marks it dirty)
 * @returns Callback that loads a preset into the live editable settings buffer
 */
export function useApplyPreset(
  providerStateSetters: ProviderStateSetters,
  setProvider: (provider: Provider) => void,
  setSmallModelMode: (enabled: boolean) => void,
  setEnabledTools: (tools: Record<string, boolean>) => void,
  setNotation: (notation: Notation) => void,
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

      // The additive fields, each applied only when the preset captured it.
      if (preset.enabledTools) setEnabledTools({ ...preset.enabledTools });
      if (preset.notation) setNotation(preset.notation);
    },
    [
      providerStateSetters,
      setProvider,
      setSmallModelMode,
      setEnabledTools,
      setNotation,
    ],
  );
}
