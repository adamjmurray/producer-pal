// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import preact from "@preact/preset-vite";
import { join } from "path";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

// Node 25+ enables webstorage by default, which conflicts with happy-dom's mock.
// Disable it for tests. The flag doesn't exist in Node 24, so only add it for 25+.
// See: https://github.com/vitest-dev/vitest/issues/8757
const nodeMajorVersion = parseInt(process.versions.node.split(".")[0], 10);
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
      include: ["src/**", "webui/**", "evals/**"],
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

        // test helper functions
        "**/*-test-helpers.ts",

        // type definition only files (no executable code)
        "src/notation/types.ts",

        // ignore the bundle entry scripts:
        "src/live-api-adapter/live-api-adapter.ts",
        "src/mcp-server/mcp-server.ts",
        "src/portal/producer-pal-portal.ts",

        // ignore V8 protocol code (runs in Max's V8, depends on LiveAPI globals):
        "src/live-api-adapter/code-exec-v8-protocol.ts",

        // ignore disabled stubs (build-time substitutions, not runtime code):
        "src/tools/clip/code-exec/*-disabled.ts",

        // ignore loggers:
        "src/portal/file-logger.ts",

        // ignore test infrastructure:
        "src/test/mocks/**",
        "src/test/helpers/**",

        "evals/**",
      ],
      reportOnFailure: true,

      // IMPORTANT: Do NOT let test coverage drop:
      thresholds: {
        statements: 98.4, // Keep above 98
        branches: 94, // Keep above 94
        functions: 99.6, // Keep above 99
        lines: 98.7, // Keep above 98
      },
    },
  },
});
