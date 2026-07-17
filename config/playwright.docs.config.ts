// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e/docs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2, // Limit workers to avoid overwhelming the system
  // The JSON report feeds the CI e2e stats summary (scripts/stats/e2e-stats.ts).
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: join(
          import.meta.dirname,
          "../test-reports/playwright-docs.json",
        ),
      },
    ],
  ],
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
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
  webServer: {
    command: "npm run docs:preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
