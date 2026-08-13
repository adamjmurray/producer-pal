// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetsTab } from "#webui/components/settings/PresetsTab";
import { usePresetSelection } from "#webui/hooks/settings/presets/use-preset-selection";
import { type UseSettingsReturn } from "#webui/types/settings";

/**
 * Minimal settings stub exposing the fields the embedded PresetControls reads.
 * @returns A UseSettingsReturn-shaped stub
 */
function makeSettings(): UseSettingsReturn {
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
  } as unknown as UseSettingsReturn;
}

/**
 * The tab with the selection state the settings dialog owns.
 * @param props - The settings stub
 * @param props.settings - The live settings buffer stub
 * @returns The rendered tab
 */
function Tab({ settings }: { settings: UseSettingsReturn }) {
  return <PresetsTab settings={settings} selection={usePresetSelection()} />;
}

describe("PresetsTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders intro copy and the preset picker", () => {
    render(<Tab settings={makeSettings()} />);

    expect(screen.getByText(/A preset saves and recalls/)).toBeTruthy();
    expect(screen.getByTestId("preset-select")).toBeTruthy();
    expect(screen.getByTestId("preset-new")).toBeTruthy();
  });
});
