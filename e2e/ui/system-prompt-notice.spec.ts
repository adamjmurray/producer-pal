// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  makeConversation,
  openHistoryPanel,
  seedConversations,
  sendChatMessage,
  setupConsoleCapture,
  setupUiTest,
} from "./ui-test-helpers";
import { setupSubagentTest } from "./subagent/subagent-test-helpers";

const captured = setupConsoleCapture();

test.describe("System prompt notice (stubbed backend)", () => {
  test("its customize link opens the context editor on the Instructions tab", async ({
    page,
  }) => {
    await setupUiTest(page, [
      makeConversation({
        id: "with-messages",
        title: "Has messages",
        updatedAt: 100,
        messages: [
          { role: "user", content: "FIXTURE_USER_PROMPT" },
          { role: "assistant", content: "FIXTURE_ASSISTANT_REPLY" },
        ],
      }),
    ]);

    await page.getByTestId("conversation-item").click();

    // The notice sits above the first bubble; the caveat lives in its tooltip.
    const customize = page.getByRole("button", {
      name: "Customize system prompt",
    });

    await expect(customize).toHaveAttribute("title", /new chats/);
    await customize.click();

    const instructionsTab = page.getByRole("button", {
      name: "Instructions",
      exact: true,
    });

    await expect(instructionsTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/only that chat uses it/i)).toBeVisible();

    expectNoConsoleOutput(captured);
  });

  test("warns about an imported conversation's different prompt, even after a reload", async ({
    page,
  }) => {
    await setupUiTest(page, [
      makeConversation({
        id: "local",
        title: "Local chat",
        updatedAt: 100,
        messages: [{ role: "user", content: "hi" }],
      }),
    ]);

    // Import through the real picker so the record is marked by the importer.
    const exported = {
      version: 1,
      conversations: [
        makeConversation({
          id: "from-file",
          title: "From a file",
          updatedAt: 200,
          messages: [{ role: "user", content: "hi" }],
          systemInstruction: "FIXTURE_IMPORTED_PROMPT line one.\nline two.",
          imported: false,
        }),
      ],
    };
    const chooser = page.waitForEvent("filechooser");

    await page.getByRole("button", { name: "Import conversations" }).click();
    await (
      await chooser
    ).setFiles({
      name: "export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });

    const imported = page
      .getByTestId("conversation-item")
      .filter({ hasText: "From a file" });

    await imported.click();
    await expect(page.getByRole("alert")).toContainText(
      "system prompt differs",
    );
    // The whole prompt is shown, not just its first line.
    await expect(page.getByText(/line two\./)).toBeVisible();

    // The URL hash reopens the same conversation after a reload.
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(
      "system prompt differs",
    );

    expectNoConsoleOutput(captured);
  });

  test("does not warn about a local conversation whose prompt differs", async ({
    page,
  }) => {
    await setupUiTest(page, [
      makeConversation({
        id: "local",
        title: "Local chat",
        updatedAt: 100,
        messages: [{ role: "user", content: "hi" }],
        systemInstruction: "A prompt from before the user edited theirs.",
      }),
    ]);

    await page.getByTestId("conversation-item").click();

    await expect(
      page.getByText("System prompt", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);

    expectNoConsoleOutput(captured);
  });

  test("keeps warning after the first send in an imported conversation", async ({
    page,
  }) => {
    // The send re-locks the conversation under the imported prompt, which then
    // keeps running — so the warning has to stay.
    const harness = await setupSubagentTest(page, () => ({
      text: "FIXTURE_MODEL_REPLY",
    }));

    await seedConversations(page, [
      makeConversation({
        id: "from-file",
        title: "From a file",
        updatedAt: 200,
        provider: "custom",
        model: "stub-model",
        messages: [{ role: "user", content: "hi" }],
        systemInstruction: "FIXTURE_IMPORTED_PROMPT line one.\nline two.",
        imported: true,
      }),
    ]);
    await page.reload();
    await openHistoryPanel(page);
    await page.getByTestId("conversation-item").click();
    await expect(page.getByRole("alert")).toContainText(
      "system prompt differs",
    );

    await sendChatMessage(page, "continue");

    await expect(page.getByText("FIXTURE_MODEL_REPLY")).toBeVisible();
    expect(harness.calls[0]?.system).toContain("FIXTURE_IMPORTED_PROMPT");
    await expect(page.getByRole("alert")).toContainText(
      "system prompt differs",
    );

    expectNoConsoleOutput(captured);
  });
});
