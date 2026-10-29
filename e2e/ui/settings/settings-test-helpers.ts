// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
  await loadSettings(page);
}

/**
 * Load the chat UI and open the settings modal, for a test that stubs an
 * endpoint first: the Installation tab reads its statuses as the settings
 * open, so a stub registered after that is too late.
 * @param page - Playwright page
 */
export async function loadSettings(page: Page): Promise<void> {
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
 * Switch to the Preferences tab and wait for its first control.
 * @param page - Playwright page
 */
export async function openPreferencesTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(page.getByTestId("max-tool-steps")).toBeVisible();
}

/**
 * Switch to the Installation tab and wait for the remote script's status line.
 * @param page - Playwright page
 */
export async function openInstallationTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Installation" }).click();
  await expect(page.getByTestId("remote-script-status")).toBeVisible();
}

/** How a stubbed install POST answers, and what it does to the status after. */
export interface InstallStub<Status> {
  status: number;
  body: unknown;
  /** Status fields the install changes, applied on a 200. */
  after?: Partial<Status>;
}

/**
 * Stub a status endpoint and its `/install` POST. A successful install rewrites
 * the status the next read answers with, as the real server would.
 * @param page - Playwright page
 * @param endpoint - The status route, e.g. "remote-script"
 * @param initial - What the first status read returns
 * @param install - How the install POST answers
 * @returns The bodies the install POST received
 */
export async function stubStatusAndInstall<Status extends object>(
  page: Page,
  endpoint: string,
  initial: Status,
  install: InstallStub<Status>,
): Promise<unknown[]> {
  let current = initial;
  const posted: unknown[] = [];

  await page.route(`**/${endpoint}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(current),
    }),
  );
  await page.route(`**/${endpoint}/install`, (route) => {
    posted.push(route.request().postDataJSON());

    if (install.status === 200) {
      current = { ...current, ...install.after };
    }

    return route.fulfill({
      status: install.status,
      contentType: "application/json",
      body: JSON.stringify(install.body),
    });
  });

  return posted;
}

/**
 * Commit the buffered settings through the footer Save and wait for the modal
 * to close.
 * @param page - Playwright page
 */
export async function saveSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("max-tool-steps")).toBeHidden();
}

/**
 * Read the stored tool-step budget. Null when the user has never set one, which
 * is not the same as storing the default — the chat falls back instead.
 * @param page - Playwright page
 * @returns The stored value verbatim, or null when unset
 */
export async function readMaxToolSteps(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    localStorage.getItem("producer_pal_max_tool_steps"),
  );
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
