// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { defineConfig } from "vitest/config";

// The portal e2e suite. Separate from vitest.e2e.config.ts because nothing here
// needs Ableton Live: each test spawns the built portal against a stub device,
// so it runs in CI right after the build that produces the bundle.
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/portal/**/*.test.ts"],
    // Spawning a Node process per test is slower than a unit test, and CI
    // machines are slower still.
    testTimeout: 20000,
    // An offline stub device releases its port, so a stub in a parallel file
    // can claim it and get another test's portal traffic.
    fileParallelism: false,
    // The JSON report feeds the CI e2e stats summary (scripts/stats/e2e-stats.ts).
    reporters: ["default", "json"],
    outputFile: { json: "test-reports/vitest-portal.json" },
    // No coverage thresholds - e2e tests are optional
  },
});
