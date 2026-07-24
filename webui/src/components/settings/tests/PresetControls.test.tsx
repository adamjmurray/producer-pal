// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetControls } from "#webui/components/settings/PresetControls";
import {
  loadPresets,
  savePresets,
} from "#webui/hooks/settings/presets/preset-storage";
import { type ChatPreset, type UseSettingsReturn } from "#webui/types/settings";

/**
 * Build a minimal settings stub exposing just the fields PresetControls reads.
 * @param over - Field overrides
 * @returns A UseSettingsReturn-shaped stub
 */
function makeSettings(over?: Partial<UseSettingsReturn>): UseSettingsReturn {
  return {
    provider: "anthropic",
    model: "claude",
    thinking: "Default",
    temperature: 1,
    showThoughts: true,
    smallModelMode: false,
    applyPreset: vi.fn(),
    ...over,
  } as unknown as UseSettingsReturn;
}

const seeded: ChatPreset = {
  id: "seed",
  name: "Seeded",
  provider: "ollama",
  model: "llama3",
  thinking: "Off",
  temperature: 1,
  showThoughts: true,
  smallModelMode: true,
};

describe("PresetControls", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows Save as… and hides Update/Delete when nothing is selected", () => {
    render(<PresetControls settings={makeSettings()} />);

    expect(screen.getByTestId("preset-save-as")).toBeTruthy();
    expect(screen.queryByTestId("preset-update")).toBeNull();
    expect(screen.queryByTestId("preset-delete")).toBeNull();
  });

  it("saves the current settings as a new named preset", () => {
    render(<PresetControls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-save-as"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "My Preset" },
    });
    fireEvent.click(screen.getByTestId("preset-name-save"));

    const stored = loadPresets();

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: "My Preset",
      provider: "anthropic",
      model: "claude",
      smallModelMode: false,
    });
    // The new preset becomes the selection, revealing Update/Delete.
    expect(screen.getByTestId("preset-update")).toBeTruthy();
  });

  it("saves via the Enter key in the name field", () => {
    render(<PresetControls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-save-as"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Keyboard" },
    });
    fireEvent.keyDown(screen.getByTestId("preset-name-input"), {
      key: "Enter",
    });

    expect(loadPresets().map((p) => p.name)).toStrictEqual(["Keyboard"]);
  });

  it("dismisses the name form on Cancel without saving", () => {
    render(<PresetControls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-save-as"));
    expect(screen.getByTestId("preset-name-input")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByTestId("preset-name-input")).toBeNull();
    expect(loadPresets()).toHaveLength(0);
  });

  it("shows an error and stores nothing for a blank name", () => {
    render(<PresetControls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-save-as"));
    fireEvent.click(screen.getByTestId("preset-name-save"));

    expect(screen.getByTestId("preset-error")).toBeTruthy();
    expect(loadPresets()).toHaveLength(0);
  });

  it("applies a preset into the settings buffer on select", () => {
    savePresets([seeded]);
    const applyPreset = vi.fn();

    render(<PresetControls settings={makeSettings({ applyPreset })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });

    expect(applyPreset).toHaveBeenCalledWith(seeded);
  });

  it("updates then deletes the selected preset", () => {
    savePresets([seeded]);
    render(<PresetControls settings={makeSettings({ model: "changed" })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });
    fireEvent.click(screen.getByTestId("preset-update"));
    expect(loadPresets()[0]?.model).toBe("changed");

    fireEvent.click(screen.getByTestId("preset-delete"));
    expect(loadPresets()).toHaveLength(0);
    expect(screen.queryByTestId("preset-update")).toBeNull();
  });

  it("flags unsaved edits when the buffer drifts from the selected preset", () => {
    savePresets([seeded]);
    render(
      <PresetControls
        settings={makeSettings({
          provider: "ollama",
          model: "different",
          thinking: "Off",
          smallModelMode: true,
        })}
      />,
    );

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });

    expect(screen.getByText(/Unsaved edits/)).toBeTruthy();
  });
});
