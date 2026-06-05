// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live chat-UI end-to-end suite: drives the REAL Producer Pal device + a real
// LLM (needs Ableton running and API keys in .env). NOT run in CI. The stubbed,
// CI-runnable suite lives in e2e/ui (config/playwright.ui.config.ts).

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e/webui",
  fullyParallel: true,
  forbidOnly: false,
  retries: 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3350",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
