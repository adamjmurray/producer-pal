// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Page, expect, test } from "@playwright/test";

export interface ConsoleCapture {
  errors: string[];
  warnings: string[];
  logs: string[];
}

/**
 * Set up console capture in a beforeEach hook.
 * Captures console errors/warnings/logs and filters expected 405 errors.
 * @returns Mutable console capture object (reset each test)
 */
export function setupConsoleCapture(): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], warnings: [], logs: [] };

  test.beforeEach(({ page }) => {
    capture.errors = [];
    capture.warnings = [];
    capture.logs = [];

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();

      if (type === "error") {
        // Filter expected 405 on /mcp (stateless endpoint)
        if (!text.includes("405")) {
          capture.errors.push(text);
        }
      } else if (type === "warning") {
        capture.warnings.push(text);
      } else if (type === "log") {
        capture.logs.push(text);
      }
    });

    page.on("pageerror", (error) => {
      capture.errors.push(error.message);
    });
  });

  return capture;
}

/**
 * Assert no unexpected console output was captured.
 * @param capture - Console capture from setupConsoleCapture
 */
export function expectNoConsoleOutput(capture: ConsoleCapture): void {
  expect(capture.errors, "Unexpected console errors").toEqual([]);
  expect(capture.warnings, "Unexpected console warnings").toEqual([]);
  expect(capture.logs, "Unexpected console logs").toEqual([]);
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
        "2. The device is built with `npm run build:all`\n\n" +
        `Original error: ${message}`,
    );
  }
}
