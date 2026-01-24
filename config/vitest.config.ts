import preact from "@preact/preset-vite";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Node 25+ enables webstorage by default, which conflicts with happy-dom's mock.
// Disable it for tests. The flag doesn't exist in Node 24, so only add it for 25+.
// See: https://github.com/vitest-dev/vitest/issues/8757
const nodeMajorVersion = parseInt(process.versions.node.split(".")[0], 10);
const execArgv = nodeMajorVersion >= 25 ? ["--no-webstorage"] : [];

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "#webui": join(__dirname, "../webui/src"),
      "#src": join(__dirname, "../src"),
      "#evals": join(__dirname, "../evals"),
      "virtual:chat-ui-html": join(
        __dirname,
        "../src/test/mocks/mock-chat-ui-html.ts",
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

        // ignore loggers:
        "src/portal/file-logger.ts",

        // ignore test mocks:
        "src/test/mocks/**",

        // evals: Exclude most evals code since it requires live LLM/MCP connections.
        // Tests exist for: assertions/helpers.ts, assertions/tool-call.ts, assertions/response.ts
        "evals/chat/**",
        "evals/scenarios/eval.ts",
        "evals/scenarios/index.ts",
        "evals/scenarios/run-scenario.ts",
        "evals/scenarios/eval-session.ts",
        "evals/scenarios/open-live-set.ts",
        "evals/scenarios/load-scenarios.ts",
        "evals/scenarios/types.ts",
        "evals/scenarios/assertions/llm-judge.ts",
        "evals/scenarios/assertions/state.ts",
        "evals/scenarios/assertions/index.ts",
        "evals/scenarios/helpers/**",
        "evals/scenarios/scenario-defs/**",
        "evals/shared/**",
      ],
      reportOnFailure: true,

      // IMPORTANT: Do NOT let test coverage drop:
      thresholds: {
        statements: 98.3, // Keep above 98
        branches: 94.1, // Keep above 94
        functions: 98.8, // Keep above 98.8
        lines: 98.65, // Keep above 98
      },
    },
  },
});
