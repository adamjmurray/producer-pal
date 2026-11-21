// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An OpenRouter chat with thinking Off reads OpenRouter's model list. When that
// fetch fails, the next send must not fetch it again (and wait out its timeout)
// straight away.

import { expect, type Page, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  installStubs,
  sendChatMessage,
  setupConsoleCapture,
} from "../ui-test-helpers";

const captured = setupConsoleCapture();

test.describe("OpenRouter model list", () => {
  test("isn't fetched again on the next send after it failed", async ({
    page,
  }) => {
    await installStubs(page);

    let modelFetches = 0;

    // Registered after installStubs, so it wins over the stub's empty list.
    await page.route("https://openrouter.ai/api/v1/models", async (route) => {
      modelFetches++;
      // A list with no data array fails like an outage, without a console error.
      await route.fulfill({ status: 200, json: { data: "unavailable" } });
    });
    await routeOpenRouterChat(page);
    await openOpenRouterChat(page, "anthropic/claude-sonnet-5.5");

    await sendChatMessage(page, "first");
    await expect(page.getByText("reply 1")).toBeVisible();
    await sendChatMessage(page, "second");
    await expect(page.getByText("reply 2")).toBeVisible();

    expect(modelFetches).toBe(1);
    expectNoConsoleOutput(captured);
  });

  test("reads a routing variant as its base model", async ({ page }) => {
    await installStubs(page);
    await page.route("https://openrouter.ai/api/v1/models", (route) =>
      route.fulfill({
        status: 200,
        json: {
          data: [
            {
              id: "anthropic/claude-sonnet-5.5",
              reasoning: { mandatory: true },
            },
          ],
        },
      }),
    );

    const bodies = await routeOpenRouterChat(page);

    await openOpenRouterChat(page, "anthropic/claude-sonnet-5.5:nitro");
    await sendChatMessage(page, "hello");
    await expect(page.getByText("reply 1")).toBeVisible();

    // Off can't turn mandatory reasoning off, so it asks for the least.
    expect(bodies[0]?.reasoning).toStrictEqual({ effort: "low" });
    expectNoConsoleOutput(captured);
  });
});

/**
 * Point the chat at OpenRouter with thinking Off, and load it.
 * @param page - Playwright page
 * @param model - The OpenRouter model id
 */
async function openOpenRouterChat(page: Page, model: string): Promise<void> {
  await page.addInitScript((modelId: string) => {
    localStorage.setItem("producer_pal_current_provider", "openrouter");
    localStorage.setItem(
      "producer_pal_provider_openrouter",
      JSON.stringify({ apiKey: "stub-key", model: modelId, thinking: "Off" }),
    );
  }, model);
  await page.goto("/chat-ui.html");
}

/**
 * Answer every OpenRouter chat request with a short text reply.
 * @param page - Playwright page
 * @returns The request bodies, filled in as requests arrive
 */
async function routeOpenRouterChat(
  page: Page,
): Promise<Array<{ reasoning?: unknown }>> {
  const bodies: Array<{ reasoning?: unknown }> = [];

  await page.route(
    "https://openrouter.ai/api/v1/chat/completions",
    async (route) => {
      bodies.push(route.request().postDataJSON() as { reasoning?: unknown });

      const replies = bodies.length;

      const chunks = [
        { delta: { role: "assistant", content: `reply ${replies}` } },
        { delta: {}, finish_reason: "stop" },
      ].map((choice) => ({
        id: "stub",
        object: "chat.completion.chunk",
        created: 0,
        model: "anthropic/claude-sonnet-5.5",
        choices: [{ index: 0, finish_reason: null, ...choice }],
      }));

      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}data: [DONE]\n\n`,
      });
    },
  );

  return bodies;
}
