// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
// sanitizeMarkdown is mocked: this component's only job is to render a .prose
// div and inject the sanitized HTML via dangerouslySetInnerHTML. The actual
// markdown->HTML rendering is unit-tested in
// webui/src/lib/utils/tests/sanitize-markdown.test.ts, and the real DOMPurify
// sanitization is verified in a real browser in e2e/ui/assistant-markdown.spec.ts.
// (happy-dom mis-walks the DOM under DOMPurify, so we don't run real
// sanitization here — see those files.)
import { render } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantText } from "#webui/components/chat/assistant/AssistantText";
import { sanitizeMarkdown } from "#webui/lib/utils/sanitize-markdown";

vi.mock(import("#webui/lib/utils/sanitize-markdown"), () => ({
  sanitizeMarkdown: vi.fn((input: string) => `<p>rendered:${input}</p>`),
}));

const mockSanitize = vi.mocked(sanitizeMarkdown);

beforeEach(() => {
  mockSanitize.mockClear();
});

describe("AssistantText", () => {
  it("renders a .prose div with the prose styling classes", () => {
    render(<AssistantText content="Test content" />);
    const div = document.querySelector(".prose");

    expect(div).not.toBeNull();
    expect(div!.className).toContain("prose");
    expect(div!.className).toContain("dark:prose-invert");
    expect(div!.className).toContain("prose-sm");
    expect(div!.className).toContain("max-w-none");
  });

  it("passes the content through sanitizeMarkdown and injects the result", () => {
    render(<AssistantText content="# Heading" />);
    const div = document.querySelector(".prose");

    expect(mockSanitize).toHaveBeenCalledWith("# Heading");
    expect(div!.innerHTML).toContain("rendered:# Heading");
  });
});
