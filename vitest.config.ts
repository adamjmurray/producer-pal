// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { join } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

// Node 25+ enables webstorage by default, which conflicts with happy-dom's mock.
// Disable it for tests. The flag doesn't exist in Node 24, so only add it for 25+.
// See: https://github.com/vitest-dev/vitest/issues/8757
// split(".") on a non-empty version string always yields at least one element.
const nodeMajorVersion = Number.parseInt(
  process.versions.node.split(".")[0] as string,
  10,
);
const execArgv = nodeMajorVersion >= 25 ? ["--no-webstorage"] : [];

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "#webui": join(__dirname, "webui/src"),
      "#src": join(__dirname, "src"),
      "#evals": join(__dirname, "evals"),
      "virtual:chat-ui-html": join(
        __dirname,
        "src/test/mocks/mock-chat-ui-html.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    env: {
      ENABLE_WARP_MARKERS: "true",
    },
    include: [
      "src/**/*.test.ts",
      "webui/**/*.test.ts",
      "webui/**/*.test.tsx",
      "evals/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    setupFiles: ["src/test/test-setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    execArgv,
    coverage: {
      provider: "v8",
      reporter: [
        ["text", { file: "coverage-summary.txt" }],
        "text-summary", // Minimal console output (just totals)
        "json-summary",
        "json",
        "html",
      ],
      // Coverage measures the user-facing product code. scripts/, e2e/, and
      // evals/ have tests that run (see test.include above) but are not
      // measured — they are dev tooling, not code the product ships.
      include: ["src/**", "webui/**"],
      exclude: [
        // ignore files that are not feasible to test

        // ignore OS metadata files and git placeholders
        "**/.DS_Store",
        "**/.gitkeep",

        // ignore typedefs:
        "**/*.d.ts",

        // ignore type definition files (pure TypeScript interfaces/types):
        "**/jsconfig.json",
        "**/tsconfig.json",
        "webui/src/types/**",

        // ignore static assets:
        "**/*.html",
        "**/*.css",
        "**/*.svg",

        // peggy grammars and generated parsers
        "**/*.peggy",
        "**/*-parser.js",

        // ignore test files and test infrastructure. Vitest already keeps the
        // suites themselves out of the report; these are the fixtures, mocks
        // and helpers around them. The list is the project's one definition of
        // a test file — see src/test/helpers/test-file-classification.ts, which
        // the meta test holds this in step with.
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.spec.tsx",
        "**/*-test-cases.ts",
        "**/*-test-helpers.ts",
        "**/*-test-helpers.tsx",
        "**/test/**",
        "**/tests/**",
        "**/test-cases/**",
        "**/test-utils/**",

        // type definition only files (no executable code)
        "src/notation/types.ts",

        // Bundle entry scripts: importing them runs module-load side effects
        // wired to the Max / Node-for-Max runtime (e.g. live-api-adapter.ts
        // emits outlet(0, "started") and registers message handlers at import
        // time). They are the wiring, exercised by the e2e suites, not the unit
        // tests — excluded so the threshold measures the libraries they compose,
        // not the entry point itself.
        "src/live-api-adapter/live-api-adapter.ts",
        "src/mcp-server/mcp-server.ts",
        "src/portal/producer-pal-portal.ts",

        // V8↔Node code-exec round-trip glue, driven by the Max globals LiveAPI /
        // Task / outlet. NOT untestable: its pure paths ARE unit-tested (see
        // tests/code-exec-v8-protocol.test.ts — the oversized-IPC guard). But
        // covering every function would mean reconstructing the async Node
        // round-trip for thin orchestration, so it stays threshold-excluded and
        // is integration-tested via e2e instead.
        "src/live-api-adapter/code-exec-v8-protocol.ts",

        // ignore disabled stubs (build-time substitutions, not runtime code):
        "src/tools/clip/code-exec/*-disabled.ts",

        // ignore loggers:
        "src/portal/file-logger.ts",
      ],
      reportOnFailure: true,

      // IMPORTANT: Do NOT let test coverage drop:
      thresholds: {
        statements: 99.6,
        branches: 97.9,
        functions: 100,
        lines: 99.7,
      },
    },
  },
});
