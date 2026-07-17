// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Stubbed, CI-runnable chat-UI suite. Serves the built single-file chat UI via
// Playwright route fulfillment (no static server) and stubs /mcp, /config, and
// the GitHub release check, so it needs neither Ableton nor API keys. The live
// suite (real device + LLM) is config/playwright.webui.config.ts (e2e/webui).

import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e/ui",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // The JSON report feeds the CI e2e stats summary (scripts/stats/e2e-stats.ts).
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: join(
          import.meta.dirname,
          "../test-reports/playwright-ui.json",
        ),
      },
    ],
  ],
  use: {
    // The document, /mcp, /config, and the update check are all fulfilled by
    // route handlers (see e2e/ui/ui-test-helpers.ts), so the origin is
    // synthetic — nothing actually listens here.
    baseURL: "http://localhost",
    trace: "on-first-retry",
    // Nothing should slip past our route stubs to a real service worker.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        },
      },
    },
  ],
});
