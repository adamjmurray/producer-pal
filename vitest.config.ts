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

        // evals: Targeted exclusions for code requiring live LLM/MCP connections.
        // Tested: assertions/{helpers,tool-call,response,state}.ts,
        //         chat/shared/formatting.ts, eval/helpers/judge-response-parser.ts

        // Chat CLI - LLM provider implementations (require live APIs)
        "evals/chat/anthropic.ts",
        "evals/chat/anthropic/**",
        "evals/chat/gemini.ts",
        "evals/chat/gemini/**",
        "evals/chat/openai/**",
        "evals/chat/openrouter/**",
        "evals/chat/index.ts",

        // Chat CLI - shared code requiring MCP/LLM connections
        "evals/chat/shared/mcp.ts",
        "evals/chat/shared/api/chat-api-base.ts",
        "evals/chat/shared/api/responses-api-base.ts",
        "evals/chat/shared/api/chat-streaming.ts",
        "evals/chat/shared/api/responses-streaming.ts",
        "evals/chat/shared/tool-execution.ts",
        "evals/chat/shared/message-source.ts",
        "evals/chat/shared/readline.ts",
        "evals/chat/shared/thinking-maps.ts",
        "evals/chat/shared/types.ts",

        // Eval orchestration (integration code)
        "evals/scenarios/index.ts",
        "evals/scenarios/config-profiles.ts",
        "evals/scenarios/run-scenario.ts",
        "evals/scenarios/eval-session.ts",
        "evals/scenarios/open-live-set.ts",
        "evals/scenarios/load-scenarios.ts",
        "evals/scenarios/types.ts",

        // LLM-dependent assertions
        "evals/scenarios/assertions/llm-judge.ts",
        "evals/scenarios/assertions/index.ts",

        // LLM-dependent session helpers and eval output
        "evals/scenarios/helpers/anthropic-session.ts",
        "evals/scenarios/helpers/eval-session-base.ts",
        "evals/scenarios/helpers/openai-session.ts",
        "evals/scenarios/helpers/report-table.ts",
        "evals/scenarios/helpers/result-printer.ts",

        // Judge helpers (require live LLM APIs)
        "evals/scenarios/helpers/judge/**",

        // Scenario definitions (test data, not logic)
        "evals/scenarios/defs/**",

        // Ableton Live Set files (binary project files)
        "evals/live-sets/**",

        // Shared LLM utilities
        "evals/shared/**",
      ],
      reportOnFailure: true,

      // IMPORTANT: Do NOT let test coverage drop:
      thresholds: {
        statements: 98.4, // Keep above 98
        branches: 94, // Keep above 94
        functions: 98.4, // Keep above 98
        lines: 98.7, // Keep above 98
      },
    },
  },
});
