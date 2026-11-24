// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Opened from a phone, `localhost` is the phone, so the chat reaches Ollama on
// Live's computer through the Producer Pal server's /local-ai relay. On Live's
// computer itself it calls Ollama directly.

import { expect, type Page, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  installStubs,
  sendChatMessage,
  setupConsoleCapture,
} from "../ui-test-helpers";

const captured = setupConsoleCapture();

const PHONE_PAGE = "http://192.168.1.20:3350";
const OLLAMA = "http://localhost:11434";

test.describe("local AI from another device", () => {
  test("chats with Ollama through the relay", async ({ page }) => {
    await installStubs(page);

    const relayed = await routeOllama(page, `${PHONE_PAGE}/local-ai/ollama`);
    const direct = await routeOllama(page, OLLAMA);

    await openOllamaChat(page, `${PHONE_PAGE}/chat-ui.html`);
    await sendChatMessage(page, "hello");
    await expect(page.getByText("reply from Ollama")).toBeVisible();

    expect(relayed).toContain("/v1/chat/completions");
    expect(direct).toStrictEqual([]);
    expectNoConsoleOutput(captured);
  });

  test("calls Ollama directly on Live's computer", async ({ page }) => {
    await installStubs(page);

    const relayed = await routeOllama(page, `${PHONE_PAGE}/local-ai/ollama`);
    const direct = await routeOllama(page, OLLAMA);

    await openOllamaChat(page, "/chat-ui.html");
    await sendChatMessage(page, "hello");
    await expect(page.getByText("reply from Ollama")).toBeVisible();

    expect(direct).toContain("/v1/chat/completions");
    expect(relayed).toStrictEqual([]);
    expectNoConsoleOutput(captured);
  });
});

/**
 * Point the chat at Ollama with its default URL, and load it.
 * @param page - Playwright page
 * @param url - Where the chat page is opened
 */
async function openOllamaChat(page: Page, url: string): Promise<void> {
  await page.addInitScript((baseUrl: string) => {
    localStorage.setItem("producer_pal_current_provider", "ollama");
    localStorage.setItem(
      "producer_pal_provider_ollama",
      JSON.stringify({
        apiKey: "",
        model: "qwen3.8",
        baseUrl,
        thinking: "Default",
      }),
    );
  }, OLLAMA);
  await page.goto(url);
}

/**
 * Answer as Ollama at `root`: an empty model list, a model that doesn't think,
 * and a short streamed chat reply.
 * @param page - Playwright page
 * @param root - Ollama's root URL, without `/v1`
 * @returns The paths asked for below `root`, filled in as requests arrive
 */
async function routeOllama(page: Page, root: string): Promise<string[]> {
  const paths: string[] = [];

  await page.route(`${root}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      new URL(root).pathname.replace(/\/$/, "").length,
    );

    paths.push(path);

    if (path === "/v1/chat/completions") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: chatReply(),
      });

      return;
    }

    const json =
      path === "/api/show" ? { capabilities: ["completion"] } : { models: [] };

    await route.fulfill({ status: 200, json });
  });

  return paths;
}

function chatReply(): string {
  const chunks = [
    { delta: { role: "assistant", content: "reply from Ollama" } },
    { delta: {}, finish_reason: "stop" },
  ].map((choice) => ({
    id: "stub",
    object: "chat.completion.chunk",
    created: 0,
    model: "qwen3.8",
    choices: [{ index: 0, finish_reason: null, ...choice }],
  }));

  return `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}data: [DONE]\n\n`;
}
