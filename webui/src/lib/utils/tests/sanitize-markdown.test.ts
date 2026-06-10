// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  sanitizeMarkdown,
  sanitizeMarkdownInline,
} from "#webui/lib/utils/sanitize-markdown";

describe("sanitizeMarkdown", () => {
  it("renders bold markdown", () => {
    expect(sanitizeMarkdown("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders italic markdown", () => {
    expect(sanitizeMarkdown("*italic*")).toContain("<em>italic</em>");
  });

  it("renders code blocks", () => {
    expect(sanitizeMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("renders links", () => {
    const result = sanitizeMarkdown("[link](https://example.com)");

    expect(result).toContain("<a");
    expect(result).toContain('href="https://example.com"');
  });

  it("opens links in a new window (target + rel hardening)", () => {
    const result = sanitizeMarkdown("[link](https://example.com)");

    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("strips script tags", () => {
    const result = sanitizeMarkdown('<script>alert("xss")</script>safe text');

    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("safe text");
  });

  it("strips onerror attributes", () => {
    const result = sanitizeMarkdown('<img src=x onerror="alert(1)">');

    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert");
  });

  it("strips onclick attributes", () => {
    const result = sanitizeMarkdown('<div onclick="alert(1)">text</div>');

    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("strips javascript: URLs from links (the threat this sanitizer exists to stop)", () => {
    // DOMPurify's default URI allowlist blocks javascript:, but the config pins
    // ALLOWED_ATTR (incl. href) and nothing tested that the scheme is rejected.
    const fromMarkdown = sanitizeMarkdown("[click](javascript:alert)");

    expect(fromMarkdown).not.toContain("javascript:");
    expect(fromMarkdown).toContain("click"); // link text is preserved

    const fromHtml = sanitizeMarkdown(
      '<a href="javascript:alert(1)">click</a>',
    );

    expect(fromHtml).not.toContain("javascript:");
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

  it("strips script tags in inline mode", () => {
    const result = sanitizeMarkdownInline('<script>alert("xss")</script>safe');

    expect(result).not.toContain("<script");
    expect(result).toContain("safe");
  });

  it("opens inline links in a new window", () => {
    const result = sanitizeMarkdownInline("[link](https://example.com)");

    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("strips javascript: URLs in inline mode", () => {
    expect(sanitizeMarkdownInline("[click](javascript:alert)")).not.toContain(
      "javascript:",
    );
  });

  it("handles empty string", () => {
    expect(sanitizeMarkdownInline("")).toBe("");
  });
});
