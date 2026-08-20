// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import { PresetControls } from "#webui/components/settings/PresetControls";
import { savePresets } from "#webui/hooks/settings/presets/preset-storage";
import { usePresetSelection } from "#webui/hooks/settings/presets/use-preset-selection";
import {
  DEFAULT_SETTINGS,
  loadCurrentProvider,
  saveSubagentPresetId,
} from "#webui/hooks/settings/settings-helpers";
import {
  type AppearanceSettings,
  useHasUnsavedChanges,
} from "#webui/hooks/settings/use-has-unsaved-changes";
import { useSettings } from "#webui/hooks/settings/use-settings";
import { type ChatPreset, type UseSettingsReturn } from "#webui/types/settings";

const appearance: AppearanceSettings = {
  theme: "dark",
  showTimestamps: false,
  showHelpLinks: false,
  showTokenUsage: false,
};

// Derived from the defaults useSettings starts from, so selecting it in the
// picker applies nothing — the state the repro needs, where the only thing the
// delete can change is the Subagent preset pointer. Hardcoding the model would
// quietly turn Select into a real edit the day a default changes.
const provider = loadCurrentProvider();
const seeded: ChatPreset = {
  id: "seed",
  name: "Seeded",
  provider,
  model: DEFAULT_SETTINGS[provider].model,
  thinking: DEFAULT_SETTINGS[provider].thinking,
  smallModelMode: false,
  enabledTools: {},
};

/**
 * The Presets tab wired the way the app wires it: App owns useSettings and the
 * unsaved-changes detector, and the preset controls sit under it with their own
 * selection state. The split matters — a delete that only reaches storage would
 * leave a stale answer up here.
 * @returns A readout of the two states the assertions need, plus the controls
 */
function SettingsTab() {
  const settings = useSettings();
  const hasUnsavedChanges = useHasUnsavedChanges(settings, appearance, true);

  return (
    <>
      <span data-testid="loaded">{String(settings.settingsLoaded)}</span>
      <span data-testid="unsaved">{String(hasUnsavedChanges)}</span>
      <PresetsPane settings={settings} />
    </>
  );
}

/**
 * The controls plus the selection state that lives beside them, below the
 * detector — SettingsScreen's arrangement.
 * @param props - Component props
 * @param props.settings - The settings hook from the parent
 * @returns The preset controls
 */
function PresetsPane({ settings }: { settings: UseSettingsReturn }) {
  return (
    <PresetControls settings={settings} selection={usePresetSelection()} />
  );
}

/**
 * Render the tab with a preset already saved as the Subagent preset, then wait
 * out the async decrypt so the unsaved-changes baseline has been captured.
 */
async function renderTab(): Promise<void> {
  savePresets([seeded]);
  saveSubagentPresetId("seed");
  render(<SettingsTab />);

  await waitFor(() =>
    expect(screen.getByTestId("loaded").textContent).toBe("true"),
  );
}

/**
 * Whether the modal currently reports unsaved changes.
 * @returns The readout, as a boolean
 */
function unsaved(): boolean {
  return screen.getByTestId("unsaved").textContent === "true";
}

/**
 * Pick a value in the Subagent preset selector.
 * @param value - The option value ("" for Inherit)
 */
function pickSubagentPreset(value: string): void {
  fireEvent.change(screen.getByTestId("subagent-preset-select"), {
    target: { value },
  });
}

/**
 * Select a preset and press Delete.
 * @param id - The preset to delete
 */
function deletePreset(id: string): void {
  fireEvent.change(screen.getByTestId("preset-select"), {
    target: { value: id },
  });
  fireEvent.click(screen.getByTestId("preset-delete"));
}

describe("PresetControls unsaved-changes wiring", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stays closable after deleting the preset that is the Subagent preset", async () => {
    await renderTab();

    deletePreset("seed");

    // The delete already cleared both copies of the pointer, so there is
    // nothing left to save and Escape/backdrop must close instead of shaking.
    await waitFor(() => expect(unsaved()).toBe(false));
  });

  it("stays closable when the delete only has the saved copy left to clear", async () => {
    await renderTab();

    // Switching to Inherit is a real unsaved edit...
    pickSubagentPreset("");
    await waitFor(() => expect(unsaved()).toBe(true));

    // ...but deleting the preset the saved copy still names settles it: both
    // copies are now empty. Nothing here touches the buffer, so this only
    // reads clean if the saved copy is reactive state and not a bare read.
    deletePreset("seed");
    await waitFor(() => expect(unsaved()).toBe(false));
  });

  it("still flags a Subagent preset the user picks", async () => {
    await renderTab();

    pickSubagentPreset("");

    await waitFor(() => expect(unsaved()).toBe(true));
  });
});
