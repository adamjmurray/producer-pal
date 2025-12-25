import { expect, test } from "@playwright/test";

let consoleErrors = [];
let consoleWarnings = [];
let consoleLogs = [];

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

// Provider/model configurations to test
const TEST_CONFIGS = [
  {
    provider: "gemini",
    providerLabel: "Google",
    model: "gemini-3-flash-preview",
    modelLabel: "Gemini 3 Flash",
    envKey: "GEMINI_KEY",
  },
  {
    provider: "openai",
    providerLabel: "OpenAI",
    model: "gpt-5.2-2025-12-11",
    modelLabel: "GPT-5.2",
    envKey: "OPENAI_KEY",
  },
];

for (const config of TEST_CONFIGS) {
  test.describe(`${config.providerLabel} ${config.modelLabel}`, () => {
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
        throw new Error(
          "Could not connect to Producer Pal. Make sure:\n" +
            "1. Ableton Live is running with the Producer Pal device active\n" +
            "2. The device is built with `npm run build:all`\n\n" +
            `Original error: ${error.message}`,
        );
      }

      // Settings screen should be shown on first load
      await expect(page.getByText("Producer Pal Chat Settings")).toBeVisible();

      // Configure provider settings
      const providerSelect = page.getByTestId("provider-select");
      await providerSelect.selectOption(config.provider);

      // Select model (before API key to avoid state reset)
      const modelSelect = page.getByTestId("model-select");
      await modelSelect.selectOption(config.model);

      // Enter API key (after model selection)
      const apiKeyInput = page.getByTestId("api-key-input");
      await apiKeyInput.fill(apiKey);

      // Save settings
      await page.getByRole("button", { name: "Save" }).click();

      // Now on Chat screen - wait for MCP connection
      // Quick Connect button appears when MCP is connected
      const quickConnectButton = page.getByRole("button", {
        name: "Quick Connect",
      });
      await expect(quickConnectButton).toBeVisible({ timeout: 10000 });

      // Click Quick Connect
      await quickConnectButton.click();

      // Wait for response to complete (Stop button disappears when done)
      const stopButton = page.getByRole("button", { name: "Stop" });
      await expect(stopButton).toBeVisible({ timeout: 10000 }); // Response started
      await expect(stopButton).toBeHidden({ timeout: 60000 }); // Response finished

      const messageList = page.getByTestId("message-list");

      // Wait for user message to appear
      await expect(messageList.getByText("Connect to Ableton.")).toBeVisible();

      // Wait for assistant response - should contain some indication of success
      // Allow up to 30 seconds for the AI response
      await expect(async () => {
        const assistantMessages = page.getByTestId("assistant-message-bubble");
        const count = await assistantMessages.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 30000 });

      // Verify the response contains expected content
      // The response typically mentions connection or Ableton
      const pageContent = await page.textContent("body");

      expect(
        (pageContent.includes("connected") ||
          pageContent.includes("Connected")) &&
          pageContent.includes("Live") &&
          (pageContent.includes("Tempo") || pageContent.includes("tempo")),
      ).toBe(true);

      // Final snapshot for Playwright UI (response already complete at this point)
      await expect(page.locator("body")).toBeVisible();

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
