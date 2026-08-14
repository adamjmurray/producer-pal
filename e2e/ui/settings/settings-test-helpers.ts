// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Harness for the stubbed settings-modal specs. The chat UI's own stubs already
// bypass the first-run screen, so this only has to open the modal and read back
// the one store the settings screen writes outside the footer Save: presets.

import { type Page, expect } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";

/** localStorage key holding the JSON-serialized preset list. Mirrors
 * PRESETS_STORAGE_KEY in webui/src/hooks/settings/presets/preset-storage.ts. */
export const PRESETS_STORAGE_KEY = "producer_pal_presets";

/** A preset as stored, with only the fields these specs assert on. */
export interface StoredPreset {
  id: string;
  name: string;
  description?: string;
  provider: string;
  model: string;
  thinking: string;
  smallModelMode: boolean;
  enabledTools?: Record<string, boolean>;
  notation?: string;
}

/**
 * Install the stubs, load the chat UI, and open the settings modal.
 * @param page - Playwright page
 */
export async function setupSettingsTest(page: Page): Promise<void> {
  await installStubs(page);
  await page.goto("/chat-ui.html");
  await openSettings(page);
}

/**
 * Open the settings modal from the chat header.
 * @param page - Playwright page
 */
export async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "Presets" })).toBeVisible();
}

/**
 * Switch to the Presets tab and wait for its picker.
 * @param page - Playwright page
 */
export async function openPresetsTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Presets" }).click();
  await expect(page.getByTestId("preset-select")).toBeVisible();
}

/**
 * Read the stored preset list back out of localStorage. Presets persist on
 * click rather than on the footer Save, so this is what the assertions check.
 * @param page - Playwright page
 * @returns The stored presets, or [] when nothing has been written
 */
export async function readPresets(page: Page): Promise<StoredPreset[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);

    return raw == null ? [] : (JSON.parse(raw) as StoredPreset[]);
  }, PRESETS_STORAGE_KEY);
}

/**
 * Create a preset with the given name from the current settings, leaving it
 * selected. The create form is the only way in — a seeded list wouldn't prove
 * the write path works.
 * @param page - Playwright page
 * @param name - Preset name to create
 * @param description - Optional description to type into the draft
 */
export async function createPreset(
  page: Page,
  name: string,
  description?: string,
): Promise<void> {
  await page.getByTestId("preset-new").click();
  await page.getByTestId("preset-name-input").fill(name);

  if (description != null) {
    await page.getByTestId("preset-description-input").fill(description);
  }

  await page.getByTestId("preset-create-confirm").click();
  await expect(page.getByTestId("preset-update")).toBeVisible();
}
