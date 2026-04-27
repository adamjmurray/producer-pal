// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import DOMPurify, { type Config } from "dompurify";
import { marked } from "marked";

// Explicit allowlist for markdown-rendered HTML. Pinned here so a future
// DOMPurify default change can't widen what we accept from LLM output.
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "rel", "target"],
};

/**
 * Render markdown to sanitized HTML (block-level).
 * Combines marked rendering with DOMPurify sanitization to prevent XSS.
 * @param input - Markdown string
 * @returns Sanitized HTML string
 */
export function sanitizeMarkdown(input: string): string {
  return DOMPurify.sanitize(marked(input) as string, SANITIZE_CONFIG);
}

/**
 * Render markdown to sanitized HTML (inline-only, no wrapping `<p>` tags).
 * @param input - Markdown string
 * @returns Sanitized inline HTML string
 */
export function sanitizeMarkdownInline(input: string): string {
  return DOMPurify.sanitize(
    marked.parseInline(input) as string,
    SANITIZE_CONFIG,
  );
}
