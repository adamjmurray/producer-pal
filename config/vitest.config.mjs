import preact from "@preact/preset-vite";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
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
        "text", // Also display in console
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
        "**/tsconfig.json",
        "webui/src/types/**",

        // ignore static assets:
        "**/*.html",
        "**/*.css",
        "**/*.svg",

        // peggy grammars
        "**/*.peggy",

        // ignore the bundle entry scripts:
        "src/live-api-adapter/live-api-adapter.js",
        "src/mcp-server/mcp-server.js",
        "src/portal/producer-pal-portal.js",

        // ignore disabled tool definitions:
        "src/tools/device/read-device.def.js",

        // ignore loggers:
        "src/portal/file-logger.js",
        "src/shared/v8-max-console.js",

        // ignore test helpers:
        "**/*-test-helpers.js",

        // ignore other hard-to-test files:
        "src/test/mock-task.js",
        "src/test/mock-chat-ui-html.js",
      ],
      reportOnFailure: true,

      // do not let test coverage drop:
      thresholds: {
        statements: 89.2, // TODO: try to get to 90
        branches: 83.7, // TODO: try to get to 85
        functions: 89.5, // TODO: try to get to 90
        lines: 89.8, // TODO: try to get to 90
      },
    },
  },
});
