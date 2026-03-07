// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import DOMPurify from "dompurify";
import { marked } from "marked";

/**
 * Render markdown to sanitized HTML (block-level).
 * Combines marked rendering with DOMPurify sanitization to prevent XSS.
 * @param input - Markdown string
 * @returns Sanitized HTML string
 */
export function sanitizeMarkdown(input: string): string {
  return DOMPurify.sanitize(marked(input) as string);
}

/**
 * Render markdown to sanitized HTML (inline-only, no wrapping `<p>` tags).
 * @param input - Markdown string
 * @returns Sanitized inline HTML string
 */
export function sanitizeMarkdownInline(input: string): string {
  return DOMPurify.sanitize(marked.parseInline(input) as string);
}
