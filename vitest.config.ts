// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["device/**/*.test.js"],
    setupFiles: ["./test-setup.js"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "html"],
      include: ["device/**"],
      exclude: [
        "device/main.js",
        "device/console.js",
        "device/mcp-server.mjs",
        "device/mock-*",
        "device/mcp-server/**",
      ],
      reportOnFailure: true,
    },
  },
});
