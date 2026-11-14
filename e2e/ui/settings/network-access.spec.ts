// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// "Allow other computers to connect" on the Installation tab against a stubbed
// /network-access. The page is served from localhost, so turning it on is
// offered; what the server answers (its real state, or a refusal) is what the
// box then shows.

import { type Page, expect, test } from "@playwright/test";
import { installStubs } from "../ui-test-helpers";
import { loadSettings, openInstallationTab } from "./settings-test-helpers";

/**
 * Stub /network-access: GET answers `state`, PUT answers `put` and records its
 * body.
 * @param page - Playwright page
 * @param state - What GET reports
 * @param put - How the PUT answers
 * @param put.status - HTTP status
 * @param put.body - JSON body
 * @returns The bodies the PUT received
 */
async function stubNetworkAccess(
  page: Page,
  state: boolean,
  put: { status: number; body: unknown },
): Promise<unknown[]> {
  const sent: unknown[] = [];

  await page.route("**/network-access", (route) => {
    if (route.request().method() === "PUT") {
      sent.push(route.request().postDataJSON());

      return route.fulfill({
        status: put.status,
        contentType: "application/json",
        body: JSON.stringify(put.body),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ allowNetwork: state }),
    });
  });

  return sent;
}

test.describe("Settings — allow other computers (stubbed backend)", () => {
  test("warns, and turns on when the server says it did", async ({ page }) => {
    await installStubs(page);
    const sent = await stubNetworkAccess(page, false, {
      status: 200,
      body: { allowNetwork: true },
    });

    await loadSettings(page);
    await openInstallationTab(page);

    const box = page.getByTestId("allow-network");

    await expect(box).not.toBeChecked();
    await expect(page.getByTestId("network-access-option")).toContainText(
      "Warning: anyone on that network can control Live, and there's no password",
    );

    // click, not check(): the box only flips once the server answers.
    await box.click();

    await expect(box).toBeChecked();
    expect(sent).toStrictEqual([{ allowNetwork: true }]);
  });

  test("shows the state the server reports, not the one asked for", async ({
    page,
  }) => {
    await installStubs(page);
    await stubNetworkAccess(page, false, {
      status: 200,
      body: {
        allowNetwork: false,
        message: "Couldn't change it, so only this computer can connect.",
      },
    });

    await loadSettings(page);
    await openInstallationTab(page);
    // Playwright's check() would fail on a box that stays unchecked.
    await page.getByTestId("allow-network").click();

    await expect(page.getByTestId("allow-network-message")).toHaveText(
      "Couldn't change it, so only this computer can connect.",
    );
    await expect(page.getByTestId("allow-network")).not.toBeChecked();
  });

  test("shows the server's refusal and goes back", async ({ page }) => {
    await installStubs(page);
    await stubNetworkAccess(page, false, {
      status: 403,
      body: { error: "Only from the computer running Live." },
    });

    await loadSettings(page);
    await openInstallationTab(page);
    await page.getByTestId("allow-network").click();

    await expect(page.getByTestId("allow-network-message")).toHaveText(
      "Only from the computer running Live.",
    );
    await expect(page.getByTestId("allow-network")).not.toBeChecked();
  });

  test("turns off from a state the server reports as on", async ({ page }) => {
    await installStubs(page);
    const sent = await stubNetworkAccess(page, true, {
      status: 200,
      body: { allowNetwork: false },
    });

    await loadSettings(page);
    await openInstallationTab(page);

    const box = page.getByTestId("allow-network");

    await expect(box).toBeChecked();
    await box.click();

    await expect(box).not.toBeChecked();
    expect(sent).toStrictEqual([{ allowNetwork: false }]);
  });

  test("follows the server when the window regains focus", async ({ page }) => {
    await installStubs(page);

    let reported = false;

    await page.route("**/network-access", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ allowNetwork: reported }),
      }),
    );

    await loadSettings(page);
    await openInstallationTab(page);

    const box = page.getByTestId("allow-network");

    await expect(box).not.toBeChecked();

    // Someone flips the toggle on the device.
    reported = true;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(box).toBeChecked();

    reported = false;
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(box).not.toBeChecked();
  });
});
