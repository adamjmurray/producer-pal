// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Docs screenshots of the settings tabs besides Installation.

import { test } from "@playwright/test";
import { openPreferencesTab, openPresetsTab } from "../settings-test-helpers";
import {
  FAKE_KEY,
  saveDialogScreenshot,
  saveScreenshot,
  setupScreenshot,
} from "./screenshot-setup";

test.use({
  colorScheme: "dark",
  deviceScaleFactor: 2,
  viewport: { width: 760, height: 1300 },
});

test("connection", async ({ page }) => {
  await setupScreenshot(page);
  await saveDialogScreenshot(page, "producer-pal-chat-settings-connection.png");
});

test("connection with Ollama", async ({ page }) => {
  await setupScreenshot(page, {
    storage: {
      producer_pal_current_provider: "ollama",
      producer_pal_provider_ollama: {
        apiKey: "",
        model: "gemma4",
        baseUrl: "http://localhost:11434",
        thinking: "Default",
      },
    },
  });
  await saveDialogScreenshot(
    page,
    "producer-pal-chat-settings-connection-ollama.png",
  );
});

test("voice settings", async ({ page }) => {
  await setupScreenshot(page, {
    storage: {
      producer_pal_current_provider: "openai",
      producer_pal_provider_openai: {
        apiKey: FAKE_KEY,
        model: "gpt-realtime-2.1",
        thinking: "Default",
      },
    },
  });
  await page.getByText("Voice Settings").click();

  // From the Voice label to the bottom of the expanded Voice Settings box.
  const top = await page.locator('label[for="voice-select"]').boundingBox();
  const box = await page.locator("details.disclosure").boundingBox();

  if (top == null || box == null) {
    throw new Error("Voice settings not visible");
  }

  await saveScreenshot(
    page,
    "producer-pal-chat-settings-voice.png",
    {
      x: box.x,
      y: top.y,
      width: box.width,
      height: box.y + box.height - top.y,
    },
    12,
  );
});

test("presets", async ({ page }) => {
  await setupScreenshot(page, {
    storage: {
      producer_pal_presets: [
        {
          id: "preset-luna",
          name: "GPT Luna read-only",
          description: "Cheap model for reading the Live Set",
          provider: "openai",
          model: "gpt-6-luna",
          thinking: "Default",
          smallModelMode: false,
        },
      ],
      producer_pal_subagent_preset: "preset-luna",
    },
  });
  await openPresetsTab(page);
  await page.getByTestId("preset-new").click();
  await page.getByTestId("preset-name-input").fill("GPT Sol everything");
  await page
    .getByTestId("preset-description-input")
    .fill("Strong model with all tools");
  await saveDialogScreenshot(page, "producer-pal-chat-settings-presets.png");
});

test("tools", async ({ page }) => {
  await setupScreenshot(page);
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByText("Available Tools").waitFor();
  await saveDialogScreenshot(page, "producer-pal-chat-settings-tools.png");
});

test("preferences", async ({ page }) => {
  await setupScreenshot(page);
  await openPreferencesTab(page);
  await saveDialogScreenshot(
    page,
    "producer-pal-chat-settings-preferences.png",
  );
});
