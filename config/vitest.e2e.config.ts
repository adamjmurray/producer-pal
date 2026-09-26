// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#src": join(__dirname, "../src"),
      "#evals": join(__dirname, "../evals"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["e2e/mcp/**/*.test.ts"],
    // Deliberately NOT the main setup file - don't want the Live API mocks.
    // This one only swaps in a sane fetch dispatcher; see the file for why.
    setupFiles: [
      join(__dirname, "../evals/shared/install-fetch-dispatcher.ts"),
      join(__dirname, "../evals/shared/log-e2e-retries.ts"),
    ],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30000, // Longer timeout for MCP connections
    // One retry covers a dropped MCP connection (device restarted mid-test).
    // log-e2e-retries.ts prints every pass that needed it. Tests sharing one
    // Live Set (setupMcpTestContext's `once`) fail the retry on purpose: it
    // would start from the failed attempt's leftovers.
    retry: 1,
    // beforeAll opens Ableton and waits for the Set to serve MCP. Has to clear
    // open-live-set.ts's own stop+start budget so its error wins over a bare
    // hook timeout, which says nothing about what Live was doing.
    hookTimeout: 120000,
    // Run test files sequentially - they share a single Ableton instance
    fileParallelism: false,
    // No coverage thresholds - e2e tests are optional
  },
});
