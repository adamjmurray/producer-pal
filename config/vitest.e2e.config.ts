import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "#src": join(__dirname, "../src"),
      "#evals": join(__dirname, "../evals"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["e2e/mcp/**/*.test.ts"],
    // No setupFiles - don't want the Live API mocks
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30000, // Longer timeout for MCP connections
    hookTimeout: 60000, // beforeAll needs time to open Ableton + wait for MCP
    // Run test files sequentially - they share a single Ableton instance
    fileParallelism: false,
    // No coverage thresholds - e2e tests are optional
  },
});
