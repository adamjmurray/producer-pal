// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PresetControls,
  type PresetControlsProps,
} from "#webui/components/settings/PresetControls";
import {
  loadPresets,
  savePresets,
} from "#webui/hooks/settings/presets/preset-storage";
import { usePresetSelection } from "#webui/hooks/settings/presets/use-preset-selection";
import { breakStorageWrites } from "#webui/test-utils/dom-test-helpers";
import { type ChatPreset, type UseSettingsReturn } from "#webui/types/settings";

/**
 * The controls with the selection state their parent owns in the app (the
 * settings dialog, which outlives the tab).
 * @param props - Everything but the selection
 * @returns The rendered controls
 */
function Controls(props: Omit<PresetControlsProps, "selection">) {
  return <PresetControls {...props} selection={usePresetSelection()} />;
}

/**
 * The controls under a parent that unmounts them, the way the settings dialog
 * unmounts the tab you switch away from.
 * @param props - The settings stub
 * @param props.settings - The live settings buffer stub
 * @returns The rendered controls plus a button that toggles them
 */
function TabSwitcher({ settings }: { settings: UseSettingsReturn }) {
  const selection = usePresetSelection();
  const [open, setOpen] = useState(true);

  return (
    <>
      <button
        type="button"
        data-testid="leave-tab"
        onClick={() => setOpen((value) => !value)}
      >
        switch tab
      </button>
      {open && <PresetControls settings={settings} selection={selection} />}
    </>
  );
}

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
    subagentPresetId: null,
    setSubagentPresetId: vi.fn(),
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

/**
 * Render the controls and save the current settings under a name.
 * @param settings - The settings stub to capture from
 * @param name - The preset name to type
 */
function createPreset(settings: UseSettingsReturn, name: string): void {
  render(<Controls settings={settings} />);

  fireEvent.click(screen.getByTestId("preset-new"));
  fireEvent.input(screen.getByTestId("preset-name-input"), {
    target: { value: name },
  });
  fireEvent.click(screen.getByTestId("preset-create-confirm"));
}

describe("PresetControls", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the selection when the tab is unmounted and reopened", () => {
    // The settings dialog unmounts the inactive tab. Losing the selection here
    // means the only route back to Update is re-selecting the preset, which
    // applies it first — discarding the edit the user left the tab to make.
    savePresets([seeded]);

    const applyPreset = vi.fn();

    render(<TabSwitcher settings={makeSettings({ applyPreset })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });
    fireEvent.click(screen.getByTestId("leave-tab"));
    fireEvent.click(screen.getByTestId("leave-tab"));

    expect(
      (screen.getByTestId("preset-select") as HTMLSelectElement).value,
    ).toBe("seed");
    // Update is reachable without going back through Select.
    expect(screen.getByTestId("preset-update")).toBeTruthy();
    expect(applyPreset).toHaveBeenCalledTimes(1);
  });

  it("shows New… and hides Update/Delete when nothing is selected", () => {
    render(<Controls settings={makeSettings()} />);

    expect(screen.getByTestId("preset-new")).toBeTruthy();
    expect(screen.queryByTestId("preset-update")).toBeNull();
    expect(screen.queryByTestId("preset-delete")).toBeNull();
  });

  it("saves the current settings as a new named preset", () => {
    render(<Controls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-new"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "My Preset" },
    });
    fireEvent.click(screen.getByTestId("preset-create-confirm"));

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

  it("captures the notation once it is known", () => {
    createPreset(
      makeSettings({ notation: "stark", notationKnown: true }),
      "Stark",
    );

    expect(loadPresets()[0]?.notation).toBe("stark");
  });

  it("omits an unknown notation, so the preset can't force the default", () => {
    // Before the server seeds it, `notation` is the provisional mount-time
    // default. Capturing it would make the preset impose bar|beat on every
    // later apply; omitted, it means "inherit the current notation".
    createPreset(
      makeSettings({ notation: "barbeat", notationKnown: false }),
      "Unknown",
    );

    expect(loadPresets()[0]).not.toHaveProperty("notation");
  });

  it("saves via the Enter key in the name field", () => {
    render(<Controls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-new"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Keyboard" },
    });
    fireEvent.keyDown(screen.getByTestId("preset-name-input"), {
      key: "Enter",
    });

    expect(loadPresets().map((p) => p.name)).toStrictEqual(["Keyboard"]);
  });

  it("locks the dropdown while naming, so a pick can't rewrite the draft", () => {
    // Selecting a preset loads its bundle into the same settings buffer the
    // form captures on Create — a pick mid-naming would save a copy of the
    // picked preset under the new name.
    savePresets([seeded]);

    const applyPreset = vi.fn();

    render(<Controls settings={makeSettings({ applyPreset })} />);

    fireEvent.click(screen.getByTestId("preset-new"));

    expect(
      (screen.getByTestId("preset-select") as HTMLSelectElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByText("Cancel"));

    expect(
      (screen.getByTestId("preset-select") as HTMLSelectElement).disabled,
    ).toBe(false);
    expect(applyPreset).not.toHaveBeenCalled();
  });

  it("dismisses the name form via the Escape key", () => {
    render(<Controls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-new"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Abandoned" },
    });
    fireEvent.keyDown(screen.getByTestId("preset-name-input"), {
      key: "Escape",
    });

    expect(screen.queryByTestId("preset-name-input")).toBeNull();
    expect(loadPresets()).toHaveLength(0);
  });

  it("dismisses the name form on Cancel without saving", () => {
    render(<Controls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-new"));
    expect(screen.getByTestId("preset-name-input")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByTestId("preset-name-input")).toBeNull();
    expect(loadPresets()).toHaveLength(0);
  });

  it("shows an error and stores nothing for a blank name", () => {
    render(<Controls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-new"));
    fireEvent.click(screen.getByTestId("preset-create-confirm"));

    expect(screen.getByTestId("preset-error")).toBeTruthy();
    expect(loadPresets()).toHaveLength(0);
  });

  it("keeps the form open and explains itself when the write fails", () => {
    breakStorageWrites();
    render(<Controls settings={makeSettings()} />);

    fireEvent.click(screen.getByTestId("preset-new"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Doomed" },
    });
    fireEvent.click(screen.getByTestId("preset-create-confirm"));

    expect(screen.getByTestId("preset-error").textContent).toMatch(
      /quota exceeded/,
    );
    // Still the name form, not a selected preset: nothing was saved.
    expect(screen.getByTestId("preset-name-input")).toBeTruthy();
    expect(screen.queryByTestId("preset-update")).toBeNull();
  });

  it("surfaces a failed write from Update, which has no result to return", () => {
    savePresets([seeded]);
    render(<Controls settings={makeSettings({ model: "changed" })} />);

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
      <Controls
        settings={makeSettings({ enabledTools: { "ppal-delete": false } })}
      />,
    );

    fireEvent.click(screen.getByTestId("preset-new"));
    fireEvent.input(screen.getByTestId("preset-name-input"), {
      target: { value: "Worker" },
    });
    fireEvent.input(screen.getByTestId("preset-description-input"), {
      target: { value: "cheap bulk editor" },
    });
    fireEvent.click(screen.getByTestId("preset-create-confirm"));

    expect(loadPresets()[0]).toMatchObject({
      name: "Worker",
      description: "cheap bulk editor",
      enabledTools: { "ppal-delete": false },
    });
  });

  it("persists a description edit as it's typed, without touching the settings", () => {
    savePresets([{ ...seeded, description: "existing note" }]);
    // Buffer drifted from the preset: a description edit must not capture it.
    render(<Controls settings={makeSettings({ model: "changed" })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });

    const editor = screen.getByTestId(
      "preset-description-input",
    ) as HTMLTextAreaElement;

    expect(editor.value).toBe("existing note");

    // No blur: Esc can close the dialog straight from the focused field.
    fireEvent.input(editor, { target: { value: "updated note" } });

    expect(loadPresets()[0]).toMatchObject({
      description: "updated note",
      model: "llama3",
    });
  });

  it("applies a preset into the settings buffer on select", () => {
    savePresets([seeded]);
    const applyPreset = vi.fn();

    render(<Controls settings={makeSettings({ applyPreset })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });

    expect(applyPreset).toHaveBeenCalledWith(seeded);
  });

  it("updates then deletes the selected preset", () => {
    savePresets([seeded]);
    render(<Controls settings={makeSettings({ model: "changed" })} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });
    fireEvent.click(screen.getByTestId("preset-update"));
    expect(loadPresets()[0]?.model).toBe("changed");

    fireEvent.click(screen.getByTestId("preset-delete"));
    expect(loadPresets()).toHaveLength(0);
    expect(screen.queryByTestId("preset-update")).toBeNull();
  });

  it("keeps the selection when a delete can't be written", () => {
    savePresets([seeded]);
    render(<Controls settings={makeSettings()} />);

    fireEvent.change(screen.getByTestId("preset-select"), {
      target: { value: "seed" },
    });
    breakStorageWrites();
    fireEvent.click(screen.getByTestId("preset-delete"));

    // The preset is still there, so the controls that act on it must be too.
    expect(loadPresets()).toHaveLength(1);
    expect(
      (screen.getByTestId("preset-select") as HTMLSelectElement).value,
    ).toBe("seed");
    expect(screen.getByTestId("preset-delete")).toBeTruthy();
    expect(screen.getByTestId("preset-error").textContent).toMatch(
      /quota exceeded/,
    );
  });

  it("offers Inherit plus every preset in the Subagent preset selector", () => {
    savePresets([seeded]);
    render(<Controls settings={makeSettings({ subagentPresetId: "seed" })} />);

    const select = screen.getByTestId(
      "subagent-preset-select",
    ) as HTMLSelectElement;

    expect(select.value).toBe("seed");
    const optionLabels = [...select.options].map((o) => o.textContent);

    expect(optionLabels).toStrictEqual(["Inherit current settings", "Seeded"]);
  });

  it("sets the subagent preset (and null for Inherit)", () => {
    savePresets([seeded]);
    const setSubagentPresetId = vi.fn();

    render(<Controls settings={makeSettings({ setSubagentPresetId })} />);

    fireEvent.change(screen.getByTestId("subagent-preset-select"), {
      target: { value: "seed" },
    });
    expect(setSubagentPresetId).toHaveBeenCalledWith("seed");

    fireEvent.change(screen.getByTestId("subagent-preset-select"), {
      target: { value: "" },
    });
    expect(setSubagentPresetId).toHaveBeenCalledWith(null);
  });

  it("flags Subagent preset options whose provider has no API key", () => {
    savePresets([
      { ...seeded, id: "keyed", name: "Keyed", provider: "anthropic" },
      { ...seeded, id: "keyless", name: "Keyless", provider: "openai" },
      { ...seeded, id: "local", name: "Local", provider: "ollama" },
    ]);
    render(
      <Controls
        settings={makeSettings({
          getProviderConnection: vi.fn((p: string) => ({
            apiKey: p === "anthropic" ? "sk-ok" : "",
          })),
        })}
      />,
    );

    const labels = [
      ...(screen.getByTestId("subagent-preset-select") as HTMLSelectElement)
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
      <Controls
        settings={makeSettings({
          settingsLoaded: false,
          getProviderConnection: vi.fn(() => ({ apiKey: "" })),
        })}
      />,
    );

    const labels = [
      ...(screen.getByTestId("subagent-preset-select") as HTMLSelectElement)
        .options,
    ].map((o) => o.textContent);

    expect(labels).toStrictEqual(["Inherit current settings", "Keyless"]);
  });

  it("shows Inherit when the saved default id no longer matches a preset", () => {
    savePresets([seeded]);
    render(
      <Controls settings={makeSettings({ subagentPresetId: "deleted" })} />,
    );

    expect(
      (screen.getByTestId("subagent-preset-select") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("flags unsaved edits when the buffer drifts from the selected preset", () => {
    savePresets([seeded]);
    render(
      <Controls
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

    expect(screen.getByText(/no longer match/)).toBeTruthy();
  });

  it("reports the create form opening and closing to the footer", () => {
    const onDraftOpenChange = vi.fn();

    render(
      <Controls
        settings={makeSettings()}
        onDraftOpenChange={onDraftOpenChange}
      />,
    );
    onDraftOpenChange.mockClear();

    fireEvent.click(screen.getByTestId("preset-new"));
    expect(onDraftOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onDraftOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("reports the draft closed when the tab unmounts", () => {
    const onDraftOpenChange = vi.fn();
    const { unmount } = render(
      <Controls
        settings={makeSettings()}
        onDraftOpenChange={onDraftOpenChange}
      />,
    );

    fireEvent.click(screen.getByTestId("preset-new"));
    unmount();

    expect(onDraftOpenChange).toHaveBeenLastCalledWith(false);
  });
});
