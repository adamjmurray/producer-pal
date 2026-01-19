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
      "virtual:chat-ui-html": join(
        __dirname,
        "../src/test/mocks/mock-chat-ui-html.js",
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.test.js",
      "src/**/*.test.ts",
      "webui/**/*.test.ts",
      "webui/**/*.test.tsx",
    ],
    setupFiles: ["src/test/test-setup.js"],
    clearMocks: true,
    restoreMocks: true,
    execArgv,
    coverage: {
      provider: "v8",
      ignoreEmptyLines: true,
      reporter: [
        ["text", { file: "coverage-summary.txt" }],
        "text-summary", // Minimal console output (just totals)
        "json-summary",
        "json",
        "html",
      ],
      include: ["src/**", "webui/**"],
      exclude: [
        // ignore files that are not feasible to test

        // ignore OS metadata files
        "**/.DS_Store",

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
        "**/*-parser.{js,ts}",

        // test helper functions
        "**/*-test-helpers.{js,ts}",

        // type definition only files (no executable code)
        "src/notation/types.js",

        // ignore the bundle entry scripts:
        "src/live-api-adapter/live-api-adapter.{js,ts}",
        "src/mcp-server/mcp-server.{js,ts}",
        "src/portal/producer-pal-portal.{js,ts}",

        // ignore loggers:
        "src/portal/file-logger.{js,ts}",

        // ignore test mocks:
        "src/test/mocks/**",
      ],
      reportOnFailure: true,

      // IMPORTANT: Do NOT let test coverage drop:
      thresholds: {
        statements: 98.25, // Keep above 98
        branches: 94, // Keep above 94
        functions: 98.85, // Keep above 98
        lines: 98.6, // Keep above 98
      },
    },
  },
});
