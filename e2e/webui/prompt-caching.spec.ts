// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live verification of Anthropic prompt caching. Drives a real 2-turn
// Anthropic conversation through the device + chat UI and reads the cache token
// counts back out of the Anthropic API responses, confirming the static prefix
// is written once (cold) then read on later requests. Requires Ableton running
// with a debug build of the device, and ANTHROPIC_KEY in .env.

import { expect, test } from "@playwright/test";
import { navigateToChat } from "./webui-test-helpers";

interface CacheStat {
  input: number;
  creation: number;
  read: number;
}

/**
 * Pull the input/cache token counts out of an Anthropic SSE response body.
 * @param body - Raw SSE text from a /v1/messages response
 * @returns The cache stat, or null if no usage block was found
 */
function parseUsage(body: string): CacheStat | null {
  const input = /"input_tokens":(\d+)/.exec(body);
  const creation = /"cache_creation_input_tokens":(\d+)/.exec(body);
  const read = /"cache_read_input_tokens":(\d+)/.exec(body);

  if (!input) return null;

  return {
    input: Number(input[1]),
    creation: creation ? Number(creation[1]) : 0,
    read: read ? Number(read[1]) : 0,
  };
}

test.describe("Anthropic prompt caching", () => {
  test.setTimeout(120000);

  test("static prefix is written once then read on later requests", async ({
    page,
  }) => {
    const apiKey = process.env.ANTHROPIC_KEY;

    if (!apiKey) {
      throw new Error("ANTHROPIC_KEY is required in .env");
    }

    // Capture every Anthropic Messages API response body (SSE) in order.
    const pending: Array<Promise<CacheStat | null>> = [];

    page.on("response", (response) => {
      if (response.url().includes("api.anthropic.com/v1/messages")) {
        pending.push(
          response
            .text()
            .then(parseUsage)
            .catch(() => null),
        );
      }
    });

    await navigateToChat(page);

    // Configure Anthropic + enable the token-usage display via localStorage.
    await page.evaluate(
      ({ apiKey, model }) => {
        localStorage.setItem("producer_pal_current_provider", "anthropic");
        localStorage.setItem("producer_pal_settings_configured", "true");
        localStorage.setItem("producer_pal_show_token_usage", "true");
        localStorage.setItem(
          "producer_pal_provider_anthropic",
          JSON.stringify({
            apiKey,
            model,
            thinking: "Default",
            temperature: 1.0,
            showThoughts: false,
          }),
        );
      },
      { apiKey, model: "claude-sonnet-4-6" },
    );

    await page.reload();

    const stopButton = page.getByRole("button", { name: "Stop" });
    const assistantBubble = page.getByTestId("assistant-message-bubble");

    // Turn 1: Quick Connect runs ppal-connect, loading the big static prefix
    // (system + skills blob + tool defs) for the first time — a cold cache write.
    const quickConnect = page.getByRole("button", { name: "Quick Connect" });

    await expect(quickConnect).toBeVisible({ timeout: 15000 });
    await quickConnect.click();

    await expect(async () => {
      expect(await assistantBubble.count()).toBeGreaterThan(0);
      await expect(stopButton).toBeHidden();
    }).toPass({ timeout: 60000 });

    // Turn 2: a follow-up message reuses the cached prefix — a warm cache read.
    const textarea = page.getByPlaceholder(/Type a message/);

    await textarea.fill("In one sentence, what is the project tempo?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(async () => {
      expect(await assistantBubble.count()).toBeGreaterThan(1);
      await expect(stopButton).toBeHidden();
    }).toPass({ timeout: 60000 });

    // Let the last response body finish buffering, then report.
    await page.waitForTimeout(1500);
    const stats = (await Promise.all(pending)).filter(
      (s): s is CacheStat => s != null,
    );

    console.log(
      "\n=== Anthropic /v1/messages cache usage (in request order) ===",
    );
    stats.forEach((s, i) => {
      console.log(
        `  req ${i + 1}: input(uncached)=${s.input}  cacheWrite=${s.creation}  cacheRead=${s.read}`,
      );
    });
    const totalRead = stats.reduce((n, s) => n + s.read, 0);
    const totalWrite = stats.reduce((n, s) => n + s.creation, 0);

    console.log(`  TOTAL cacheWrite=${totalWrite}  cacheRead=${totalRead}`);

    // The UI should also show the cached count on at least one assistant message.
    expect((await page.textContent("body"))?.toLowerCase()).toContain("cached");

    // Caching engaged: something got written, and later requests read it back.
    expect(totalWrite, "expected a cold cache write").toBeGreaterThan(0);
    expect(
      totalRead,
      "expected later requests to read the cached prefix",
    ).toBeGreaterThan(0);
  });
});
