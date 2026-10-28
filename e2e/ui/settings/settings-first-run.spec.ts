// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Settings before chat is set up. Installation-only visitors (the device's
// "Finish installation" link) must be able to leave without setting up chat;
// chat asks for setup only when they try to use it.

import { type Page, expect, test } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";
import {
  openInstallationTab,
  openPreferencesTab,
  setupSettingsTest,
} from "./settings-test-helpers";

const SETUP_FLAG = "producer_pal_settings_configured";
const heading = (page: Page) =>
  page.getByRole("heading", { name: "Producer Pal Chat Settings" });
const closeButton = (page: Page) =>
  page.getByRole("button", { name: "Close", exact: true });
const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Save", exact: true });

/**
 * Read the stored "chat is set up" flag.
 * @param page - Playwright page
 * @returns The stored value, or null when never set
 */
function readSetupFlag(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SETUP_FLAG);
}

/**
 * Load the chat UI as a first visit: nothing stored, chat not set up.
 * @param page - Playwright page
 * @param path - Page to load
 */
async function firstVisit(page: Page, path = "/chat-ui.html"): Promise<void> {
  await installStubs(page, { chatSetUp: false });
  await page.goto(path);
}

/**
 * Assert chat is still not set up: nothing stored and setup on offer.
 * @param page - Playwright page
 */
async function expectNotSetUp(page: Page): Promise<void> {
  expect(await readSetupFlag(page)).toBeNull();
  await expect(page.getByRole("button", { name: "Set up chat" })).toBeVisible();
}

/**
 * Assert chat is set up: the flag is stored and Quick Connect is on offer.
 * @param page - Playwright page
 */
async function expectSetUp(page: Page): Promise<void> {
  expect(await readSetupFlag(page)).toBe("true");
  await expect(
    page.getByRole("button", { name: "Quick Connect" }),
  ).toBeVisible();
}

test.describe("Settings — before chat is set up (stubbed backend)", () => {
  test("opens on the Connection tab and closes without setting chat up", async ({
    page,
  }) => {
    await firstVisit(page);

    await expect(heading(page)).toBeVisible();
    await expect(page.getByTestId("api-key-input")).toBeVisible();

    await closeButton(page).click();

    await expect(heading(page)).toBeHidden();
    expect(await readSetupFlag(page)).toBeNull();
  });

  test("closes with Escape and with a backdrop click", async ({ page }) => {
    await firstVisit(page);
    await expect(heading(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(heading(page)).toBeHidden();

    await page.getByRole("button", { name: "Set up chat" }).click();
    await expect(heading(page)).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(heading(page)).toBeHidden();
  });

  test("asks for setup in the chat, and blocks sending, until chat is set up", async ({
    page,
  }) => {
    await firstVisit(page);
    await closeButton(page).click();
    await expect(heading(page)).toBeHidden();

    await expect(
      page.getByRole("button", { name: "Quick Connect" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(
      page.getByText("Set up chat in Settings to send messages..."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Set up chat" }).click();

    await expect(page.getByTestId("api-key-input")).toBeVisible();
  });

  test("saving with an API key sets chat up for good", async ({ page }) => {
    await firstVisit(page);

    // One click, no blur first: the field must already count as changed on
    // mouse-down, or the notice appears and moves Save out from under the click.
    await page.getByTestId("api-key-input").fill("test-key");
    await saveButton(page).click();
    await expect(heading(page)).toBeHidden();

    await expectSetUp(page);
    await expect(
      page.getByRole("button", { name: "Set up chat" }),
    ).toBeHidden();

    await page.reload();

    await expect(
      page.getByRole("button", { name: "Quick Connect" }),
    ).toBeVisible();
    await expect(heading(page)).toBeHidden();
  });

  test("a custom endpoint with a URL and no key sets chat up", async ({
    page,
  }) => {
    await firstVisit(page);

    await page.getByTestId("provider-select").selectOption("custom");
    await page
      .getByPlaceholder("https://api.example.com/v1")
      .fill("https://example.test/v1");
    await saveButton(page).click();
    await expect(heading(page)).toBeHidden();

    await expectSetUp(page);
  });

  test("a custom endpoint with no URL and no key leaves chat not set up", async ({
    page,
  }) => {
    await firstVisit(page);

    await page.getByTestId("provider-select").selectOption("custom");
    await saveButton(page).click();
    await expect(heading(page)).toBeHidden();

    await expectNotSetUp(page);
  });

  test("saving without an API key leaves chat not set up", async ({ page }) => {
    await firstVisit(page);

    await saveButton(page).click();
    await expect(heading(page)).toBeHidden();

    await expectNotSetUp(page);
  });

  test("an installation link opens that tab and can be closed", async ({
    page,
  }) => {
    await firstVisit(page, "/chat-ui.html?settings=installation");

    await expect(page.getByTestId("installation-tab")).toBeVisible();
    await expect(page.getByTestId("api-key-input")).toBeHidden();
    // Nothing to save on this tab, so Save is off and Close is the way out.
    await expect(saveButton(page)).toBeDisabled();

    await closeButton(page).click();

    await expect(heading(page)).toBeHidden();
    await expectNotSetUp(page);
  });

  test("Escape closes an installation link", async ({ page }) => {
    await firstVisit(page, "/chat-ui.html?settings=installation");
    await expect(page.getByTestId("installation-tab")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(heading(page)).toBeHidden();
    expect(await readSetupFlag(page)).toBeNull();
  });

  test("an unknown ?settings= value opens Connection and is cleared", async ({
    page,
  }) => {
    await firstVisit(page, "/chat-ui.html?settings=nope");

    await expect(page.getByTestId("api-key-input")).toBeVisible();
    await expect(page.getByTestId("installation-tab")).toBeHidden();
    expect(new URL(page.url()).search).toBe("");
  });
});

test.describe("Settings — Installation tab footer (stubbed backend)", () => {
  test("Save is off until another tab has unsaved changes", async ({
    page,
  }) => {
    await setupSettingsTest(page);
    await openInstallationTab(page);

    await expect(saveButton(page)).toBeDisabled();
    await expect(closeButton(page)).toBeEnabled();
    await expect(page.getByText("You have unsaved changes.")).toBeHidden();

    await openPreferencesTab(page);
    await page.getByTestId("max-tool-steps").fill("40");
    await openInstallationTab(page);

    await expect(saveButton(page)).toBeEnabled();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();
  });
});
