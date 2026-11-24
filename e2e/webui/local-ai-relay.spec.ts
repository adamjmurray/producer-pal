// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The chat opened from another device reaches Ollama on Live's computer
// through the device's /local-ai relay. Needs Ollama running on this computer
// with OLLAMA_MODEL pulled (default lfm2.5, a small model with tools); skips
// otherwise.

import { expect, type Page, test } from "@playwright/test";
import { DEFAULT_MCP_ORIGIN } from "#src/shared/config.ts";
import {
  expectNoConsoleOutput,
  setupConsoleCapture,
} from "./webui-test-helpers";

const captured = setupConsoleCapture();

// A documentation-only address (TEST-NET-1), so it's never a real device.
// Requests to it are sent to the device with this Host, as a phone's would be.
const PHONE_HOST = "192.0.2.10:3350";
const PHONE_ORIGIN = `http://${PHONE_HOST}`;
const OLLAMA = "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "lfm2.5";

test.describe("local AI from another device", () => {
  // A local model may need to load first.
  test.setTimeout(180_000);

  test.beforeEach(async () => {
    test.skip(
      !(await ollamaHasModel(MODEL)),
      `Needs Ollama running at ${OLLAMA} with ${MODEL} pulled`,
    );
  });

  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("Quick Connect with Ollama goes through the relay", async ({ page }) => {
    const relayed: string[] = [];
    const direct: string[] = [];

    await servePhonePage(page, relayed);
    await page.route(`${OLLAMA}/**`, async (route) => {
      direct.push(route.request().url());
      await route.abort();
    });

    await page.addInitScript((model: string) => {
      localStorage.setItem("producer_pal_settings_configured", "true");
      localStorage.setItem("producer_pal_current_provider", "ollama");
      localStorage.setItem(
        "producer_pal_provider_ollama",
        JSON.stringify({ apiKey: "", model, thinking: "Off" }),
      );
    }, MODEL);
    await page.goto(`${PHONE_ORIGIN}/chat`);

    await page.getByRole("button", { name: "Quick Connect" }).click();

    const stopButton = page.getByRole("button", { name: "Stop" });
    const assistantBubble = page.getByTestId("assistant-message-bubble");

    await expect(async () => {
      expect(await assistantBubble.count()).toBeGreaterThan(0);
      await expect(stopButton).toBeHidden();
    }).toPass({ timeout: 150_000 });

    const body = ((await page.textContent("body")) ?? "").toLowerCase();

    expect(body).not.toContain("couldn't reach ollama");
    expect(body).not.toContain("local ai relay");
    expect(relayed).toContain("/local-ai/ollama/v1/chat/completions");
    expect(direct).toStrictEqual([]);
    // Every chat opened from another device logs this: a new conversation
    // syncs small model mode to the device, which only takes device settings
    // from Live's computer. Not the relay's doing.
    captured.errors = captured.errors.filter(
      (error) =>
        !error.startsWith("POST /config (smallModelMode) returned 403"),
    );
    expectNoConsoleOutput(captured);
  });
});

/**
 * Send the page's requests for the phone address to the device, with the
 * phone's Host, and note the relay paths asked for.
 * @param page - Playwright page
 * @param relayed - Filled in with each /local-ai path as it's asked for
 */
async function servePhonePage(page: Page, relayed: string[]): Promise<void> {
  await page.route(`${PHONE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.startsWith("/local-ai/")) {
      relayed.push(url.pathname);
    }

    const response = await route.fetch({
      url: `${DEFAULT_MCP_ORIGIN}${url.pathname}${url.search}`,
      headers: { ...request.headers(), host: PHONE_HOST },
      timeout: 150_000,
    });

    await route.fulfill({ response });
  });
}

/**
 * Whether Ollama is running here with the model pulled.
 * @param model - Model name, with or without a tag
 * @returns True when the model is listed
 */
async function ollamaHasModel(model: string): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    const { models } = (await response.json()) as {
      models: Array<{ name: string }>;
    };
    const name = model.includes(":") ? model : `${model}:latest`;

    return models.some((m) => m.name === name);
  } catch {
    return false;
  }
}
