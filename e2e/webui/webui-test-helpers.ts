// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Page, expect, test } from "@playwright/test";

interface ConsoleLogs {
  errors: string[];
  warnings: string[];
  logs: string[];
}

/**
 * Set up console capture for Playwright tests.
 * Registers a beforeEach hook that captures console output and page errors.
 * @returns Object with captured console arrays (reset before each test)
 */
export function setupConsoleCapture(): ConsoleLogs {
  const captured: ConsoleLogs = { errors: [], warnings: [], logs: [] };

  test.beforeEach(({ page }) => {
    captured.errors = [];
    captured.warnings = [];
    captured.logs = [];

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === "error") {
        // Filter expected network errors:
        // - 405 on /mcp (stateless endpoint)
        // - 403/429 from API providers (fake keys in tests)
        if (
          !text.includes("405") &&
          !text.includes("403") &&
          !text.includes("429")
        ) {
          captured.errors.push(text);
        }
      } else if (type === "warning") {
        // Filter a benign warning emitted by @openrouter/ai-sdk-provider
        // itself during the AI SDK's multi-step tool-call loop: when reasoning
        // is enabled and the model emits reasoning blocks lacking signatures,
        // the SDK strips them before re-sending on the next step and logs this.
        // It is benign (the SDK drops the unsigned reasoning and continues).
        // The real fix lives upstream; drop this allowlist once it lands. See
        // https://github.com/OpenRouterTeam/ai-sdk-provider/issues/423 and
        // https://github.com/OpenRouterTeam/ai-sdk-provider/issues/418
        if (!(
          text.includes("reasoning_details") &&
          text.includes("missing signatures")
        )) {
          captured.warnings.push(text);
        }
      } else if (type === "log") {
        captured.logs.push(text);
      }
    });

    page.on("pageerror", (error) => {
      captured.errors.push(error.message);
    });
  });

  return captured;
}

/**
 * Assert that no unexpected console output was captured.
 * @param captured - Console logs from setupConsoleCapture
 */
export function expectNoConsoleOutput(captured: ConsoleLogs): void {
  expect(captured.errors, "Unexpected console errors").toEqual([]);
  expect(captured.warnings, "Unexpected console warnings").toEqual([]);
  expect(captured.logs, "Unexpected console logs").toEqual([]);
}

/**
 * Navigate to /chat with error handling for connection failures.
 * @param page - Playwright page
 */
export async function navigateToChat(page: Page): Promise<void> {
  try {
    await page.goto("/chat");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      "Could not connect to Producer Pal. Make sure:\n" +
        "1. Ableton Live is running with the Producer Pal device active\n" +
        "2. The device is built with `npm run build:debug`\n\n" +
        `Original error: ${message}`,
      { cause: error },
    );
  }
}
