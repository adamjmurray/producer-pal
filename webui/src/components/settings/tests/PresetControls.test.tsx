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
import { breakStorageWrites } from "#webui/test-utils/dom-test-helpers";
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
    smallModelMode: false,
    enabledTools: {},
    setEnabledTools: vi.fn(),
    applyPreset: vi.fn(),
    defaultSubagentPresetId: null,
    setDefaultSubagentPresetId: vi.fn(),
    settingsLoaded: true,
    getProviderConnection: vi.fn(() => ({ apiKey: "sk-test" })),
    ...over,
  } as unknown as UseSettingsReturn;
}

const seeded: ChatPreset = {
  id: "seed",
  name: "Seeded",
  provider: "ollama",
  model: "llama3",
  thinking: "Off",
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

  it("keeps the form open and explains itself when the write fails", () => {
    breakStorageWrites();
    render(<PresetControls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-save-as"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Doomed" },
    });
    fireEvent.click(screen.getByTestId("preset-name-save"));

    expect(screen.getByTestId("preset-error").textContent).toMatch(
      /quota exceeded/,
    );
    // Still the name form, not a selected preset: nothing was saved.
    expect(screen.getByTestId("preset-name-input")).toBeTruthy();
    expect(screen.queryByTestId("preset-update")).toBeNull();
  });

  it("surfaces a failed write from Update, which has no result to return", () => {
    savePresets([seeded]);
    render(<PresetControls settings={makeSettings({ model: "changed" })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });
    breakStorageWrites();
    fireEvent.click(screen.getByTestId("preset-update"));

    expect(screen.getByTestId("preset-error").textContent).toMatch(
      /quota exceeded/,
    );
    expect(loadPresets()[0]?.model).toBe("llama3");
  });

  it("captures the description and enabled toolset in a new preset", () => {
    render(
      <PresetControls
        settings={makeSettings({ enabledTools: { "ppal-delete": false } })}
      />,
    );

    fireEvent.click(screen.getByTestId("preset-save-as"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Worker" },
    });
    fireEvent.input(screen.getByTestId("preset-description-input"), {
      target: { value: "cheap bulk editor" },
    });
    fireEvent.click(screen.getByTestId("preset-name-save"));

    expect(loadPresets()[0]).toMatchObject({
      name: "Worker",
      description: "cheap bulk editor",
      enabledTools: { "ppal-delete": false },
    });
  });

  it("shows and persists the description of the selected preset", () => {
    savePresets([{ ...seeded, description: "existing note" }]);
    render(<PresetControls settings={makeSettings()} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });

    const editor = screen.getByTestId(
      "preset-description-input",
    ) as HTMLTextAreaElement;

    expect(editor.value).toBe("existing note");

    fireEvent.input(editor, { target: { value: "updated note" } });
    fireEvent.click(screen.getByTestId("preset-update"));

    expect(loadPresets()[0]?.description).toBe("updated note");
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

  it("offers Inherit plus every preset in the Default subagent selector", () => {
    savePresets([seeded]);
    render(
      <PresetControls
        settings={makeSettings({ defaultSubagentPresetId: "seed" })}
      />,
    );

    const select = screen.getByTestId(
      "subagent-default-select",
    ) as HTMLSelectElement;

    expect(select.value).toBe("seed");
    const optionLabels = [...select.options].map((o) => o.textContent);

    expect(optionLabels).toStrictEqual(["Inherit current settings", "Seeded"]);
  });

  it("sets the default subagent preset (and null for Inherit)", () => {
    savePresets([seeded]);
    const setDefaultSubagentPresetId = vi.fn();

    render(
      <PresetControls
        settings={makeSettings({ setDefaultSubagentPresetId })}
      />,
    );

    fireEvent.change(screen.getByTestId("subagent-default-select"), {
      target: { value: "seed" },
    });
    expect(setDefaultSubagentPresetId).toHaveBeenCalledWith("seed");

    fireEvent.change(screen.getByTestId("subagent-default-select"), {
      target: { value: "" },
    });
    expect(setDefaultSubagentPresetId).toHaveBeenCalledWith(null);
  });

  it("flags Default subagent presets whose provider has no API key", () => {
    savePresets([
      { ...seeded, id: "keyed", name: "Keyed", provider: "anthropic" },
      { ...seeded, id: "keyless", name: "Keyless", provider: "openai" },
      { ...seeded, id: "local", name: "Local", provider: "ollama" },
    ]);
    render(
      <PresetControls
        settings={makeSettings({
          getProviderConnection: vi.fn((p: string) => ({
            apiKey: p === "anthropic" ? "sk-ok" : "",
          })),
        })}
      />,
    );

    const labels = [
      ...(screen.getByTestId("subagent-default-select") as HTMLSelectElement)
        .options,
    ].map((o) => o.textContent);

    expect(labels).toStrictEqual([
      "Inherit current settings",
      "Keyed",
      "Keyless (no API key)",
      "Local", // ollama needs no key → never flagged
    ]);
  });

  it("doesn't flag missing keys until settings finish loading", () => {
    savePresets([
      { ...seeded, id: "keyless", name: "Keyless", provider: "openai" },
    ]);
    render(
      <PresetControls
        settings={makeSettings({
          settingsLoaded: false,
          getProviderConnection: vi.fn(() => ({ apiKey: "" })),
        })}
      />,
    );

    const labels = [
      ...(screen.getByTestId("subagent-default-select") as HTMLSelectElement)
        .options,
    ].map((o) => o.textContent);

    expect(labels).toStrictEqual(["Inherit current settings", "Keyless"]);
  });

  it("shows Inherit when the saved default id no longer matches a preset", () => {
    savePresets([seeded]);
    render(
      <PresetControls
        settings={makeSettings({ defaultSubagentPresetId: "deleted" })}
      />,
    );

    expect(
      (screen.getByTestId("subagent-default-select") as HTMLSelectElement)
        .value,
    ).toBe("");
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
