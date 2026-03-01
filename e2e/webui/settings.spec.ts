// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";

let consoleErrors: string[] = [];
let consoleWarnings: string[] = [];
let consoleLogs: string[] = [];

test.beforeEach(({ page }) => {
  consoleErrors = [];
  consoleWarnings = [];
  consoleLogs = [];

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();

    if (type === "error") {
      // Filter expected 405 on /mcp (stateless endpoint)
      if (!text.includes("405")) {
        consoleErrors.push(text);
      }
    } else if (type === "warning") {
      consoleWarnings.push(text);
    } else if (type === "log") {
      consoleLogs.push(text);
    }
  });

  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
});

test.describe("Settings", () => {
  test("saves and restores settings across tabs", async ({ page }) => {
    // Navigate to /chat with empty localStorage — settings screen appears (first-time setup)
    await page.goto("/chat");

    // Wait for the settings screen to be visible
    const settingsHeading = page.getByText("Producer Pal Chat Settings");

    await expect(settingsHeading).toBeVisible({ timeout: 10000 });

    // --- Connection tab (default active) ---

    const providerSelect = page.getByTestId("provider-select");

    await providerSelect.selectOption("openai");
    await expect(providerSelect).toHaveValue("openai");

    const apiKeyInput = page.getByTestId("api-key-input");

    await apiKeyInput.fill("test-key-12345");
    await expect(apiKeyInput).toHaveValue("test-key-12345");

    // Model should have switched to OpenAI's default
    const modelSelect = page.getByTestId("model-select");

    await expect(modelSelect).toBeVisible();

    // --- Behavior tab ---

    await page.getByRole("button", { name: "Behavior" }).click();

    const randomnessSlider = page.locator('input[type="range"]');

    await expect(randomnessSlider).toBeVisible();
    await randomnessSlider.fill("1.4");
    await expect(randomnessSlider).toHaveValue("1.4");

    // --- Tools tab ---

    await page.getByRole("button", { name: "Tools" }).click();

    // Wait for tools to load from MCP (requires Ableton to be running)
    const disableAllButton = page.getByRole("button", { name: "Disable all" });

    await expect(disableAllButton).toBeVisible({ timeout: 15000 });

    // Disable all tools
    await disableAllButton.click();

    // ppal-connect is always enabled, so check a different tool is unchecked
    const readClipCheckbox = page.locator("#tool-ppal-read-clip");

    await expect(readClipCheckbox).not.toBeChecked();

    // Re-enable ppal-read-clip specifically
    await readClipCheckbox.check();
    await expect(readClipCheckbox).toBeChecked();

    // --- Appearance tab ---

    await page.getByRole("button", { name: "Appearance" }).click();

    const themeSelect = page.locator("#theme-select");

    await themeSelect.selectOption("dark");
    await expect(themeSelect).toHaveValue("dark");

    // --- Save ---

    await page.getByRole("button", { name: "Save" }).click();

    // Should now be on the chat screen — wait for the settings button in the header
    const settingsButton = page.getByRole("button", { name: /Settings/ });

    await expect(settingsButton).toBeVisible({ timeout: 5000 });

    // --- Reopen settings ---

    await settingsButton.click();
    await expect(settingsHeading).toBeVisible({ timeout: 5000 });

    // --- Verify Connection tab ---

    await expect(providerSelect).toHaveValue("openai");

    // --- Verify Behavior tab ---

    await page.getByRole("button", { name: "Behavior" }).click();
    await expect(randomnessSlider).toHaveValue("1.4");

    // --- Verify Tools tab ---

    await page.getByRole("button", { name: "Tools" }).click();
    await expect(disableAllButton).toBeVisible({ timeout: 15000 });

    // ppal-read-clip should still be enabled (we re-enabled it)
    await expect(readClipCheckbox).toBeChecked();

    // A different tool should still be disabled (we disabled all, only re-enabled ppal-read-clip)
    // ppal-connect is always enabled, so check another tool
    const updateToolCheckbox = page.locator("#tool-ppal-update-clip");

    await expect(updateToolCheckbox).not.toBeChecked();

    // --- Verify Appearance tab ---

    await page.getByRole("button", { name: "Appearance" }).click();
    await expect(themeSelect).toHaveValue("dark");

    // --- Verify no unexpected console output ---

    expect(consoleErrors, "Unexpected console errors").toEqual([]);
    expect(consoleWarnings, "Unexpected console warnings").toEqual([]);
    expect(consoleLogs, "Unexpected console logs").toEqual([]);
  });
});
