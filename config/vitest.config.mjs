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

        // test helper functions
        "**/*-test-helpers.js",
        "**/*-test-helpers.ts",

        // ignore the bundle entry scripts:
        "src/live-api-adapter/live-api-adapter.js",
        "src/mcp-server/mcp-server.js",
        "src/portal/producer-pal-portal.js",

        // ignore disabled tool definitions:
        "src/tools/device/read-device.def.js",

        // ignore loggers:
        "src/portal/file-logger.js",

        // ignore other hard-to-test files:
        "src/test/mock-task.js",
        "src/test/mock-chat-ui-html.js",

        // voice chat files rely on browser APIs (AudioContext, AudioWorklet, MediaDevices)
        // that aren't available in the Node.js test environment:
        "webui/src/hooks/audio-recorder.ts",
        "webui/src/hooks/audio-streamer.ts",
        "webui/src/hooks/audio-worklet-sources.ts",
        "webui/src/hooks/use-voice-chat.ts",
        "webui/src/hooks/voice-chat-mcp-helpers.ts",
        "webui/src/hooks/voice-chat-message-handler.ts",
      ],
      reportOnFailure: true,

      // Do not let test coverage drop:
      thresholds: {
        statements: 87.4, // TODO: get to 90
        branches: 81.7, // TODO: get to 85
        functions: 88.5, // TODO: get to 90
        lines: 87.9, // TODO: get to 90
      },
    },
  },
});
