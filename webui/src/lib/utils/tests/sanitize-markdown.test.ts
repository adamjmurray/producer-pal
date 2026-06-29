// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Runs in the default node environment (no DOM): marked is a pure string->string
// renderer, and DOMPurify is mocked to a pass-through here so these tests verify
// OUR pipeline (marked rendering, the sanitize config wiring, and the link
// hardening hook) without a DOM. The real sanitization (stripping <script>,
// javascript: URLs, etc.) is DOMPurify's job and is exercised against a real
// browser DOM in the Playwright suite (e2e/ui/assistant-markdown.spec.ts) — the
// only environment DOMPurify supports (happy-dom is explicitly unsupported and
// mis-walks the DOM, which is why these tests do not run there).
import DOMPurify from "dompurify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hardenLink,
  sanitizeMarkdown,
  sanitizeMarkdownInline,
} from "#webui/lib/utils/sanitize-markdown";

// Override only sanitize (pass-through) and addHook (no-op); keep the rest of
// the real module so the typed mock factory satisfies the full DOMPurify shape.
vi.mock(import("dompurify"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    default: {
      ...actual.default,
      sanitize: vi.fn((html: string) => html),
      addHook: vi.fn(),
      // Cast past DOMPurify's overloaded sanitize signature (string | TrustedHTML);
      // the pass-through returns a plain string, which is all these tests need.
    } as unknown as typeof actual.default,
  };
});

const mockSanitize = vi.mocked(DOMPurify.sanitize);

beforeEach(() => {
  mockSanitize.mockClear();
});

describe("sanitizeMarkdown", () => {
  it("renders bold markdown", () => {
    expect(sanitizeMarkdown("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders italic markdown", () => {
    expect(sanitizeMarkdown("*italic*")).toContain("<em>italic</em>");
  });

  it("renders code", () => {
    expect(sanitizeMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("renders headings", () => {
    expect(sanitizeMarkdown("# Heading")).toContain("<h1>Heading</h1>");
  });

  it("renders lists", () => {
    const result = sanitizeMarkdown("- item 1\n- item 2");

    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item 1</li>");
  });

  it("renders links", () => {
    const result = sanitizeMarkdown("[link](https://example.com)");

    expect(result).toContain("<a");
    expect(result).toContain('href="https://example.com"');
  });

  it("passes marked output through DOMPurify with the pinned allowlist", () => {
    sanitizeMarkdown("# Heading");

    expect(mockSanitize).toHaveBeenCalledTimes(1);
    const [html, config] = mockSanitize.mock.calls[0]!;

    expect(html).toContain("<h1>Heading</h1>");
    expect(config).toMatchObject({
      ALLOWED_TAGS: expect.arrayContaining(["a", "strong", "h1", "ul", "li"]),
      ALLOWED_ATTR: expect.arrayContaining(["href", "rel", "target"]),
    });
    // The allowlist must NOT permit script or event-handler vectors.
    expect((config as { ALLOWED_TAGS: string[] }).ALLOWED_TAGS).not.toContain(
      "script",
    );
  });

  it("handles empty string", () => {
    expect(sanitizeMarkdown("")).toBe("");
  });
});

describe("sanitizeMarkdownInline", () => {
  it("renders inline markdown without wrapping p tag", () => {
    const result = sanitizeMarkdownInline("**bold** text");

    expect(result).toContain("<strong>bold</strong>");
    expect(result).not.toMatch(/^<p>/);
  });

  it("passes inline marked output through DOMPurify with the pinned allowlist", () => {
    sanitizeMarkdownInline("**bold**");

    expect(mockSanitize).toHaveBeenCalledTimes(1);
    const [html, config] = mockSanitize.mock.calls[0]!;

    expect(html).toContain("<strong>bold</strong>");
    expect(config).toMatchObject({
      ALLOWED_ATTR: expect.arrayContaining(["href", "rel", "target"]),
    });
  });

  it("handles empty string", () => {
    expect(sanitizeMarkdownInline("")).toBe("");
  });
});

describe("hardenLink", () => {
  /**
   * Build a minimal fake element exposing only the DOM surface hardenLink
   * touches, so the hook can be tested without a DOM. Records setAttribute calls.
   * @param tagName - The element's tagName (e.g. "A", "P")
   * @param hasHref - Whether the element reports an href attribute
   * @returns A fake node plus its setAttribute spy
   */
  function makeNode(tagName: string, hasHref: boolean) {
    const setAttribute = vi.fn();
    const node = {
      tagName,
      hasAttribute: (name: string) => name === "href" && hasHref,
      setAttribute,
    } as unknown as Element;

    return { node, setAttribute };
  }

  it("forces links with an href to open in a new window", () => {
    const { node, setAttribute } = makeNode("A", true);

    hardenLink(node);

    expect(setAttribute).toHaveBeenCalledWith("target", "_blank");
    expect(setAttribute).toHaveBeenCalledWith("rel", "noopener noreferrer");
  });

  it("ignores anchors without an href", () => {
    const { node, setAttribute } = makeNode("A", false);

    hardenLink(node);

    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("ignores non-anchor elements", () => {
    const { node, setAttribute } = makeNode("P", true);

    hardenLink(node);

    expect(setAttribute).not.toHaveBeenCalled();
  });
});
