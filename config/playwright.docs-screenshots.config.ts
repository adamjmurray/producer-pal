// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Regenerates the chat UI screenshots in docs/public/img from the stubbed
// chat UI (see e2e/ui/settings/docs-screenshots). Not a test suite: it overwrites the
// images, so it never runs in CI.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e/ui/settings/docs-screenshots",
  // `.screenshots.ts`, not `.spec.ts`, keeps these out of `ui:test`.
  testMatch: "*.screenshots.ts",
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost",
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
