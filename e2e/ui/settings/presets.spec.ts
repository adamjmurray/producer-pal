// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The Presets tab in the stubbed suite, so it guards in CI. A preset bundles
// the provider, model, inference settings and toolset — the mechanism worker
// profiles are built on — and the only coverage before this was
// ../webui/settings.spec.ts, which needs real Live and API keys and so never
// runs there.
//
// Presets are their own persistence channel: every button writes to
// localStorage on click, while the surrounding settings stay buffered until the
// footer Save. So each test asserts against the stored list, not just the
// picker.

import { expect, test } from "@playwright/test";
import {
  createPreset,
  openPresetsTab,
  readPresets,
  setupSettingsTest,
} from "./settings-test-helpers";

test.describe("Settings — Presets tab (stubbed backend)", () => {
  test("creates a preset from the current settings and persists it", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await openPresetsTab(page);
    await createPreset(page, "Bulk edit worker", "cheap, tools trimmed");

    const presets = await readPresets(page);

    expect(presets).toHaveLength(1);

    const [stored] = presets;

    // The whole point of the bundle: a preset carries the toolset too, not just
    // the connection fields. The exact stored shape is pinned by usePresets'
    // unit tests; this checks it survived the round trip through the UI.
    expect(stored).toEqual(
      expect.objectContaining({
        name: "Bulk edit worker",
        description: "cheap, tools trimmed",
        provider: "gemini",
        model: "gemini-3.7-flash",
        enabledTools: expect.anything(),
      }),
    );
  });

  test("survives a reload and re-selects its bundle", async ({ page }) => {
    await setupSettingsTest(page);
    await openPresetsTab(page);
    await createPreset(page, "Mixing");

    await page.reload();
    await openPresetsTab(page);

    const select = page.getByTestId("preset-select");

    await expect(select.getByRole("option", { name: "Mixing" })).toBeAttached();

    const [stored] = await readPresets(page);

    await select.selectOption(stored?.id ?? "");

    // Selecting loads the bundle into the live buffer, which is what puts the
    // per-selection controls on screen.
    await expect(page.getByTestId("preset-update")).toBeVisible();
    await expect(page.getByTestId("preset-delete")).toBeVisible();
  });

  test("refuses a blank name and a duplicate one, keeping the list intact", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await openPresetsTab(page);
    await createPreset(page, "Sketching");

    await page.getByTestId("preset-new").click();
    await page.getByTestId("preset-create-confirm").click();

    await expect(page.getByTestId("preset-error")).toBeVisible();

    await page.getByTestId("preset-name-input").fill("Sketching");
    await page.getByTestId("preset-create-confirm").click();

    await expect(page.getByTestId("preset-error")).toBeVisible();
    // Stays open on the rejected draft rather than closing over it.
    await expect(page.getByTestId("preset-create-form")).toBeVisible();
    expect(await readPresets(page)).toHaveLength(1);
  });

  test("deletes the selected preset and clears the selection", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await openPresetsTab(page);
    await createPreset(page, "Throwaway");

    await page.getByTestId("preset-delete").click();

    await expect(page.getByTestId("preset-delete")).toBeHidden();
    expect(await readPresets(page)).toStrictEqual([]);
  });

  test("stores a description edit on every keystroke, not on the footer Save", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await openPresetsTab(page);
    await createPreset(page, "Arranging");

    await page
      .getByTestId("preset-description-input")
      .fill("for long-form arrangement passes");

    // Esc dismisses the dialog straight from the focused field, so a blur that
    // never fires must not lose the edit.
    await expect
      .poll(async () => (await readPresets(page))[0]?.description)
      .toBe("for long-form arrangement passes");
  });

  test("offers a saved preset as the subagent preset", async ({ page }) => {
    await setupSettingsTest(page);
    await openPresetsTab(page);
    await createPreset(page, "Worker");

    await expect(
      page.getByTestId("subagent-preset-select").getByRole("option", {
        name: /Worker/,
      }),
    ).toBeAttached();
  });
});
