import preact from "@preact/preset-vite";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "#webui": join(__dirname, "../webui/src"),
      "#src": join(__dirname, "../src"),
      "virtual:chat-ui-html": join(
        __dirname,
        "../src/test/mock-chat-ui-html.js",
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js", "webui/**/*.test.ts", "webui/**/*.test.tsx"],
    setupFiles: ["src/test/test-setup.js"],
    clearMocks: true,
    restoreMocks: true,
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
        "**/*-parser.js",

        // test helper functions
        "**/*-test-helpers.js",
        "**/*-test-helpers.ts",

        // ignore the bundle entry scripts:
        "src/live-api-adapter/live-api-adapter.js",
        "src/mcp-server/mcp-server.js",
        "src/portal/producer-pal-portal.js",

        // ignore loggers:
        "src/portal/file-logger.js",

        // ignore test mocks:
        "src/test/mock-*.js",
      ],
      reportOnFailure: true,

      // IMPORTANT: Do NOT let test coverage drop:
      thresholds: {
        statements: 97.8, // Keep above 97
        branches: 93.8, // Keep above 93
        functions: 98.6, // Keep above 98
        lines: 98.1, // Keep above 98
      },
    },
  },
});
