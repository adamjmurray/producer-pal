// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { type UseSettingsReturn } from "#webui/types/settings";

/**
 * Minimal settings stub exposing just the fields PresetControls reads.
 * @param over - Field overrides
 * @returns A UseSettingsReturn-shaped stub
 */
export function makePresetSettings(
  over?: Partial<UseSettingsReturn>,
): UseSettingsReturn {
  return {
    provider: "anthropic",
    model: "claude",
    thinking: "Default",
    smallModelMode: false,
    enabledTools: {},
    setEnabledTools: vi.fn(),
    applyPreset: vi.fn(),
    subagentPresetId: null,
    setSubagentPresetId: vi.fn(),
    forgetDeletedPreset: vi.fn(),
    settingsLoaded: true,
    getProviderConnection: vi.fn(() => ({ apiKey: "sk-test" })),
    ...over,
  } as unknown as UseSettingsReturn;
}
