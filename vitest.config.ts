// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js"],
    setupFiles: ["./test-setup.js"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "html"],
      include: ["src/**"],
      exclude: ["src/main.js", "src/console.js", "src/mcp-server.mjs", "src/mock-*", "src/mcp-server/**"],
      reportOnFailure: true,
    },
  },
});
