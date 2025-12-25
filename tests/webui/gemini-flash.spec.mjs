import { expect, test } from "@playwright/test";

test.describe("Gemini 3 Flash", () => {
  test("Quick Connect with Gemini 3 Flash", async ({ page }) => {
    const apiKey = process.env.GEMINI_KEY;

    if (!apiKey) {
      throw new Error(
        "GEMINI_KEY environment variable is required. Add it to your .env file.",
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
    // Select Google provider
    const providerSelect = page.locator("select").first();
    await providerSelect.selectOption("gemini");

    // Select Gemini 3 Flash model (before API key to avoid state reset)
    const modelSelect = page.locator("select").nth(1);
    await modelSelect.selectOption("gemini-3-flash-preview");

    // Enter API key (after model selection, for some reason it doesn't actually get set if we do this first)
    const apiKeyInput = page.locator('input[type="password"]');
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

    const messageList = page.locator(".space-y-4");

    // Wait for user message to appear
    await expect(messageList.getByText("Connect to Ableton.")).toBeVisible();

    // Wait for assistant response - should contain some indication of success
    // Allow up to 30 seconds for the AI response
    await expect(async () => {
      const assistantMessages = messageList.locator(
        ".bg-gray-100, .dark\\:bg-gray-800",
      );
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

    console.log("Test passed: Gemini 3 Flash Quick Connect successful");

    // Uncomment to pause and inspect the final state in headed mode:
    // await page.pause();
  });
});
