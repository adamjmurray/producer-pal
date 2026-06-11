// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live verification that prompt caching engages on the chat UI across providers.
// Anthropic needs explicit cache_control breakpoints (which we inject);
// OpenAI/Gemini cache automatically — here we confirm a 2-turn conversation
// actually reports a cache read on a later request, and that the UI surfaces it.
// Requires Ableton running with a debug build of the device, and the relevant
// provider key in .env.

import { expect, test } from "@playwright/test";
import { DEFAULT_MODELS } from "../../webui/src/lib/constants/models";
import { navigateToChat } from "./webui-test-helpers";

const CONFIGS = [
  {
    provider: "anthropic",
    label: "Anthropic",
    model: DEFAULT_MODELS.anthropic,
    envKey: "ANTHROPIC_KEY",
  },
  {
    provider: "openai",
    label: "OpenAI",
    model: DEFAULT_MODELS.openai,
    envKey: "OPENAI_KEY",
  },
  {
    provider: "gemini",
    label: "Google",
    model: DEFAULT_MODELS.gemini,
    envKey: "GEMINI_KEY",
  },
];

/**
 * Whether a URL is one of the LLM provider APIs whose usage we want to read.
 * @param url - Response URL
 * @returns True for Anthropic/OpenAI/Gemini/OpenRouter API hosts
 */
function isLlmApi(url: string): boolean {
  return /anthropic\.com|openai\.com|googleapis\.com|openrouter\.ai/.test(url);
}

/**
 * Extract the cache-read token count from a provider response body, trying each
 * provider's own usage field (Anthropic / OpenAI / Gemini).
 * @param body - Raw response text (JSON or SSE)
 * @returns The largest cache-read count found, or 0
 */
function parseCacheRead(body: string): number {
  const patterns = [
    /"cache_read_input_tokens":(\d+)/g, // Anthropic
    /"cached_tokens":(\d+)/g, // OpenAI
    /"cachedContentTokenCount":(\d+)/g, // Gemini
  ];
  let max = 0;

  for (const pattern of patterns) {
    for (const m of body.matchAll(pattern)) {
      max = Math.max(max, Number(m[1]));
    }
  }

  return max;
}

for (const config of CONFIGS) {
  test.describe(`Prompt caching — ${config.label}`, () => {
    test.setTimeout(120000);

    test("reports a cache read on a later request", async ({ page }) => {
      const apiKey = process.env[config.envKey];

      if (!apiKey) {
        throw new Error(`${config.envKey} is required in .env`);
      }

      const reads: Array<Promise<number>> = [];

      page.on("response", (response) => {
        if (isLlmApi(response.url())) {
          reads.push(
            response
              .text()
              .then(parseCacheRead)
              .catch(() => 0),
          );
        }
      });

      await navigateToChat(page);

      await page.evaluate(
        ({ provider, apiKey, model }) => {
          localStorage.setItem("producer_pal_current_provider", provider);
          localStorage.setItem("producer_pal_settings_configured", "true");
          localStorage.setItem("producer_pal_show_token_usage", "true");
          localStorage.setItem(
            `producer_pal_provider_${provider}`,
            JSON.stringify({
              apiKey,
              model,
              thinking: "Default",
              temperature: 1.0,
              showThoughts: false,
            }),
          );
        },
        { provider: config.provider, apiKey, model: config.model },
      );

      await page.reload();

      const stopButton = page.getByRole("button", { name: "Stop" });
      const assistantBubble = page.getByTestId("assistant-message-bubble");

      // Turn 1: Quick Connect loads the big static prefix (system + skills + tools).
      const quickConnect = page.getByRole("button", { name: "Quick Connect" });

      await expect(quickConnect).toBeVisible({ timeout: 15000 });
      await quickConnect.click();

      await expect(async () => {
        expect(await assistantBubble.count()).toBeGreaterThan(0);
        await expect(stopButton).toBeHidden();
      }).toPass({ timeout: 60000 });

      // Turn 2: a follow-up reuses the cached prefix.
      await page
        .getByPlaceholder(/Type a message/)
        .fill("In one sentence, what is the project tempo?");
      await page.getByRole("button", { name: "Send" }).click();

      await expect(async () => {
        expect(await assistantBubble.count()).toBeGreaterThan(1);
        await expect(stopButton).toBeHidden();
      }).toPass({ timeout: 60000 });

      await page.waitForTimeout(1500);
      const rawRead = (await Promise.all(reads)).reduce((n, r) => n + r, 0);
      const body = (await page.textContent("body")) ?? "";
      const cachedLabel = /[\d.]+\s*[kmbt]?\s+cached/i.exec(body);

      console.log(
        `[${config.label}] UI cached label=${cachedLabel?.[0] ?? "none"}  rawResponseCacheRead=${rawRead}`,
      );

      // End-to-end proof: the provider cached the prefix on a later request and
      // the UI surfaced it. The "<n> cached" label is driven by the AI SDK's
      // parsed usage and is reliable across providers; the raw-response number is
      // best-effort (not every provider's streamed body is buffered for capture).
      expect(
        cachedLabel,
        `${config.label}: expected a "<n> cached" usage label after turn 2`,
      ).not.toBeNull();
    });
  });
}
