import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js", "webui/**/*.test.js", "webui/**/*.test.jsx"],
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
        "**/.DS_Store",

        // ignore typedefs:
        "**/*.d.ts",

        // ignore static assets:
        "**/*.css",
        "**/*.svg",

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
