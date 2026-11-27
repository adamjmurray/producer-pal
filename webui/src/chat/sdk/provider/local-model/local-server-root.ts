// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * A local server's root: the URL setting minus a trailing slash and `/v1`,
 * keeping any path prefix a proxy needs (`https://host/ollama/v1` gives
 * `https://host/ollama`). Append the server's own paths (`/api/tags`) to it.
 * Imports nothing, so evals can use it.
 * @param baseUrl - The URL setting, with or without `/v1`
 * @returns The root, without a trailing slash
 * @throws TypeError when the URL is invalid
 */
export function localServerRoot(baseUrl: string): string {
  const url = new URL(baseUrl);
  const prefix = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");

  return `${url.origin}${prefix}`;
}
