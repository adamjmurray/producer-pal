// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { PLAIN_HTTP_KEYS_DOCS_URL } from "#webui/lib/config";

/**
 * A calm note under the API key field when the page isn't a secure context
 * (plain HTTP at a network address). Nothing on localhost or HTTPS.
 * @returns Note element, or null on a secure page
 */
export function InsecurePageNote() {
  if (globalThis.isSecureContext) {
    return null;
  }

  return (
    <p
      className="mt-1 text-xs text-zinc-500 dark:text-zinc-300"
      data-testid="insecure-page-note"
    >
      This page is loaded over plain HTTP, so the connection to it isn't
      encrypted. A tunnel gives you an encrypted connection.{" "}
      <a
        href={PLAIN_HTTP_KEYS_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        Learn more
      </a>
    </p>
  );
}
