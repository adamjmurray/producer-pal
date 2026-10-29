// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Shared setup for the docs screenshots: the chat UI's stubs, plus a fully
// installed Producer Pal, the release toolset, and seeded settings, so each
// shot only states what differs.

import { readFileSync } from "node:fs";
import { type Locator, type Page } from "@playwright/test";
import { loadSettings, stubStatusAndInstall } from "../settings-test-helpers";
import { installStubs } from "../../ui-test-helpers";

export const OUT_DIR = new URL("../../../../docs/public/img/", import.meta.url)
  .pathname;

const USER_LIBRARY = "/Users/you/Music/Ableton/User Library";
const DEVICE_PATH = `${USER_LIBRARY}/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd`;

export const VERSION = (
  JSON.parse(
    readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

/** Any 39 characters; the field only ever shows dots. */
export const FAKE_KEY = "x".repeat(39);

type Body = Record<string, unknown>;

/**
 * Device install status: the User Library copy, unless overridden.
 * @param overrides - Fields to change
 * @returns The /device-install response body
 */
export function deviceStatus(overrides: Body = {}): Body {
  return {
    source: DEVICE_PATH,
    problem: null,
    userLibrary: USER_LIBRARY,
    path: DEVICE_PATH,
    inUserLibrary: true,
    state: "same",
    version: VERSION,
    installedVersion: VERSION,
    otherCopies: [],
    swap: {
      allowed: false,
      reason: "This device is already the User Library copy.",
    },
    ...overrides,
  };
}

/**
 * Remote script status: not installed, unless overridden.
 * @param overrides - Fields to change
 * @returns The /remote-script response body
 */
export function remoteScriptStatus(overrides: Body = {}): Body {
  return {
    userLibrary: USER_LIBRARY,
    installed: false,
    installedVersion: null,
    bundledVersion: VERSION,
    running: false,
    runningVersion: null,
    liveVersion: "12.4.7",
    otherOnPort: null,
    updateAvailable: false,
    installedNewer: false,
    ...overrides,
  };
}

export const REMOTE_SCRIPT_RUNNING = remoteScriptStatus({
  installed: true,
  installedVersion: VERSION,
  running: true,
  runningVersion: VERSION,
});

// The UI adds Live API and Subagent itself.
const TOOLS = [
  ["ppal-connect", "Connect"],
  ["ppal-context", "Context"],
  ["ppal-manage", "Manage"],
  ["ppal-playback", "Playback"],
  ["ppal-library", "Library"],
  ["ppal-select", "Select"],
  ["ppal-delete", "Delete"],
  ["ppal-duplicate", "Duplicate"],
  ["ppal-read-live-set", "Read Live Set"],
  ["ppal-update-live-set", "Update Live Set"],
  ["ppal-read-track", "Read Track"],
  ["ppal-create-track", "Create Track"],
  ["ppal-update-track", "Update Track"],
  ["ppal-read-scene", "Read Scene"],
  ["ppal-create-scene", "Create Scene"],
  ["ppal-update-scene", "Update Scene"],
  ["ppal-read-clip", "Read Clip"],
  ["ppal-create-clip", "Create Clip"],
  ["ppal-update-clip", "Update Clip"],
  ["ppal-read-device", "Read Device"],
  ["ppal-create-device", "Create Device"],
  ["ppal-update-device", "Update Device"],
].map(([name, title]) => ({
  name,
  title,
  description: title,
  inputSchema: { type: "object", properties: {} },
}));

// API keys are seeded as cleartext, which the app still reads as legacy keys,
// so nothing shows as unsaved.
const BASE_STORAGE: Body = {
  producer_pal_settings_configured: "true",
  producer_pal_current_provider: "gemini",
  producer_pal_provider_gemini: {
    apiKey: FAKE_KEY,
    model: "gemini-3.8-flash",
    thinking: "Default",
  },
  producer_pal_provider_openai: {
    apiKey: FAKE_KEY,
    model: "gpt-6.1-sol",
    thinking: "Default",
  },
};

export interface ScreenshotSetup {
  /** /device-install response; defaults to the User Library copy. */
  device?: Body;
  /** /remote-script response; defaults to installed and running. */
  remoteScript?: Body;
  /** localStorage entries on top of the base settings. */
  storage?: Body;
}

/**
 * Stub everything, seed settings, load the chat UI, and open settings.
 * @param page - Playwright page
 * @param setup - What differs from a fully installed, configured app
 */
export async function setupScreenshot(
  page: Page,
  setup: ScreenshotSetup = {},
): Promise<void> {
  await installStubs(page);
  await stubToolList(page);
  await stubStatusAndInstall(
    page,
    "device-install",
    setup.device ?? deviceStatus(),
    { status: 200, body: {} },
  );
  await stubStatusAndInstall(
    page,
    "remote-script",
    setup.remoteScript ?? REMOTE_SCRIPT_RUNNING,
    { status: 200, body: {} },
  );
  await page.route("http://localhost:11434/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [{ name: "gemma4", model: "gemma4" }] }),
    }),
  );

  const storage = Object.fromEntries(
    Object.entries({ ...BASE_STORAGE, ...setup.storage }).map(([k, v]) => [
      k,
      typeof v === "string" ? v : JSON.stringify(v),
    ]),
  );

  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) {
      localStorage.setItem(k, v);
    }
  }, storage);
  await loadSettings(page);
}

/**
 * The settings dialog, border included.
 * @param page - Playwright page
 * @returns The dialog's locator
 */
export function settingsDialog(page: Page): Locator {
  return page
    .getByRole("heading", { name: "Producer Pal Chat Settings" })
    .locator("xpath=../..");
}

/**
 * Save a screenshot of a page region into the docs images.
 * @param page - Playwright page
 * @param file - Image file name
 * @param region - Region to capture, before padding
 * @param region.x - Left edge
 * @param region.y - Top edge
 * @param region.width - Width
 * @param region.height - Height
 * @param pad - Margin around the region
 */
export async function saveScreenshot(
  page: Page,
  file: string,
  region: { x: number; y: number; width: number; height: number },
  pad = 6,
): Promise<void> {
  await page.mouse.move(0, 0);
  // Let hover and focus transitions settle.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT_DIR}${file}`,
    clip: {
      x: region.x - pad,
      y: region.y - pad,
      width: region.width + pad * 2,
      height: region.height + pad * 2,
    },
  });
}

/**
 * Save a screenshot of the settings dialog into the docs images.
 * @param page - Playwright page
 * @param file - Image file name
 */
export async function saveDialogScreenshot(
  page: Page,
  file: string,
): Promise<void> {
  const box = await settingsDialog(page).boundingBox();

  if (box == null) {
    throw new Error(`Settings dialog not visible for ${file}`);
  }

  await saveScreenshot(page, file, box);
}

async function stubToolList(page: Page): Promise<void> {
  // Registered after installStubs, so it runs first; anything but tools/list
  // falls through to the shared stub.
  await page.route("**/mcp", async (route) => {
    const body = route.request().postDataJSON() as {
      id?: number;
      method?: string;
    } | null;

    if (body?.method !== "tools/list") {
      return route.fallback();
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "mcp-session-id": "ui-test-session" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: TOOLS },
      }),
    });
  });
}
