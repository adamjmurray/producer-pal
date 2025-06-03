// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js"],
    setupFiles: ["./test-setup.js"],
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
      include: ["src/**"],
      exclude: ["src/main.js", "src/console.js", "src/mcp-server.js", "src/mock-*"],
      reportOnFailure: true,
    },
  },
});
