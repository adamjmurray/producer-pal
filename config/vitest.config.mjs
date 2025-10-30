import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js", "webui/**/*.test.js"],
    setupFiles: ["src/test/test-setup.js"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
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

        // ignore typedefs:
        "**/*.d.ts",

        // ignore the bundle entry scripts:
        "src/live-api-adapter/live-api-adapter.js",
        "src/mcp-server/mcp-server.js",
        "src/portal/producer-pal-portal.js",

        // ignore disabled tool definitions:
        "src/tools/device/read-device.def.js",

        // ignore loggers:
        "src/portal/file-logger.js",
        "src/shared/v8-max-console.js",

        // ignore other hard-to-test files:
        "src/test/mock-task.js",
      ],
      reportOnFailure: true,
    },
  },
});
