// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, test } from "@playwright/test";
import {
  DEFAULT_MODELS,
  OPENROUTER_MODELS,
} from "../../webui/src/lib/constants/models";

let consoleErrors: string[] = [];
let consoleWarnings: string[] = [];
let consoleLogs: string[] = [];

test.beforeEach(({ page }) => {
  consoleErrors = [];
  consoleWarnings = [];
  consoleLogs = [];

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();

    if (type === "error") {
      // Filter expected 405 on /mcp (stateless endpoint)
      if (!text.includes("405")) {
        consoleErrors.push(text);
      }
    } else if (type === "warning") {
      consoleWarnings.push(text);
    } else if (type === "log") {
      consoleLogs.push(text);
    }
  });

  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
});

// Generate OpenRouter configs from the shared models list (paid models only)
// Free models are excluded due to rate limits - test those manually
const OPENROUTER_CONFIGS = OPENROUTER_MODELS.filter(
  (m) => m.value !== "OTHER" && !m.value.includes(":free"),
).map((m) => ({
  provider: "openrouter",
  providerLabel: "OpenRouter",
  model: m.value,
  modelLabel: m.label,
  envKey: "OPENROUTER_KEY",
}));

// Provider/model configurations to test
const TEST_CONFIGS = [
  {
    provider: "gemini",
    providerLabel: "Google",
    model: DEFAULT_MODELS.gemini,
    modelLabel: "Default",
    envKey: "GEMINI_KEY",
  },
  {
    provider: "openai",
    providerLabel: "OpenAI",
    model: DEFAULT_MODELS.openai,
    modelLabel: "Default",
    envKey: "OPENAI_KEY",
  },
  {
    provider: "mistral",
    providerLabel: "Mistral",
    model: DEFAULT_MODELS.mistral,
    modelLabel: "Default",
    envKey: "MISTRAL_KEY",
  },
  ...OPENROUTER_CONFIGS,
];

for (const config of TEST_CONFIGS) {
  test.describe(`${config.providerLabel} ${config.modelLabel}`, () => {
    // AI responses can be slow (especially with tool calls), so allow plenty of time
    test.setTimeout(90000);

    test("Quick Connect", async ({ page }) => {
      const apiKey = process.env[config.envKey];

      if (!apiKey) {
        throw new Error(
          `${config.envKey} environment variable is required. Add it to your .env file.`,
        );
      }

      // Navigate to the chat UI (served by the Producer Pal device)
      try {
        await page.goto("/chat");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(
          "Could not connect to Producer Pal. Make sure:\n" +
            "1. Ableton Live is running with the Producer Pal device active\n" +
            "2. The device is built with `npm run build:all`\n\n" +
            `Original error: ${message}`,
        );
      }

      // Configure settings via localStorage to avoid race conditions between
      // Playwright's fill() and Preact's deferred state batching. Preact
      // defers re-renders via microtask, so useCallback closures in the
      // settings form may capture stale state if Save is clicked before the
      // render completes.
      await page.evaluate(
        (settings) => {
          localStorage.setItem(
            "producer_pal_current_provider",
            settings.provider,
          );
          localStorage.setItem("producer_pal_settings_configured", "true");
          localStorage.setItem(
            `producer_pal_provider_${settings.provider}`,
            JSON.stringify({
              apiKey: settings.apiKey,
              model: settings.model,
              thinking: "Default",
              temperature: 1.0,
              showThoughts: true,
            }),
          );
        },
        { provider: config.provider, apiKey, model: config.model },
      );

      // Reload so the app picks up the settings from localStorage
      await page.reload();

      // Now on Chat screen - wait for MCP connection
      // Quick Connect button appears when MCP is connected
      const quickConnectButton = page.getByRole("button", {
        name: "Quick Connect",
      });

      await expect(quickConnectButton).toBeVisible({ timeout: 10000 });

      // Click Quick Connect
      await quickConnectButton.click();

      // Wait for the AI response to complete.
      // Instead of watching the Stop button (which can appear and disappear too
      // quickly for fast responses), we wait for the assistant message bubble to
      // appear and the Stop button to be gone (indicating the response finished).
      const stopButton = page.getByRole("button", { name: "Stop" });
      const assistantBubble = page.getByTestId("assistant-message-bubble");

      await expect(async () => {
        const count = await assistantBubble.count();

        expect(count).toBeGreaterThan(0);
        await expect(stopButton).toBeHidden();
      }).toPass({ timeout: 60000 });

      // Verify the response indicates a successful connection.
      // AI responses are non-deterministic, so check for a broad set of keywords
      // that typically appear when ppal-connect succeeds, and require only 1 match.
      const pageContent = (await page.textContent("body")) ?? "";
      const lowerContent = pageContent.toLowerCase();

      // Ensure no error messages in the response
      expect(lowerContent).not.toContain("no api key configured");
      expect(lowerContent).not.toContain("failed to initialize");

      const keywords = [
        "connected",
        "live",
        "tempo",
        "track",
        "ableton",
        "bpm",
        "session",
        "producer pal",
      ];
      const matchCount = keywords.filter((kw) =>
        lowerContent.includes(kw),
      ).length;

      expect(
        matchCount,
        `Expected at least 1 of [${keywords.join(", ")}] in response`,
      ).toBeGreaterThanOrEqual(1);

      // Verify no unexpected console output
      expect(consoleErrors, "Unexpected console errors").toEqual([]);
      expect(consoleWarnings, "Unexpected console warnings").toEqual([]);
      expect(consoleLogs, "Unexpected console logs").toEqual([]);

      console.log(
        `Test passed: ${config.providerLabel} ${config.modelLabel} Quick Connect successful`,
      );
    });
  });
}
