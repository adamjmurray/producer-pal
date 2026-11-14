// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { LOCAL_MODEL_URL_HEADER, isLocalModelUrl } from "#src/shared/config";
import { getLocalModelProxyUrl } from "#webui/utils/mcp-url";

/**
 * The fetch a provider should use for its base URL: one that goes through the
 * Producer Pal server when the provider is `custom` and its URL is on this
 * computer, or undefined to call the URL directly. A local model server
 * (DwarfStar's ds4-server, for one) may send no CORS headers, which blocks the
 * browser from calling it. LM Studio and Ollama send them, so they stay direct,
 * and so does any URL that isn't on this computer.
 *
 * The page must be on this computer too: the proxy only answers a page served
 * from loopback, and a page opened over the LAN or a tunnel means `localhost`
 * in the URL is the browsing device, which the browser can call directly.
 * @param provider - Provider identifier
 * @param baseUrl - The provider's configured base URL
 * @returns A proxying fetch, or undefined for a direct call
 */
export function proxyFetchFor(
  provider: string,
  baseUrl: string | undefined,
): typeof fetch | undefined {
  return provider === "custom" &&
    baseUrl != null &&
    isLocalModelUrl(baseUrl) &&
    pageIsOnThisComputer()
    ? localModelProxyFetch
    : undefined;
}

// Same host rule as the proxy's targets, applied to the page's own origin.
function pageIsOnThisComputer(): boolean {
  return (
    typeof window !== "undefined" && isLocalModelUrl(window.location.origin)
  );
}

/**
 * Fetch through the Producer Pal server's local model proxy. The real URL goes
 * in a header; method, body, abort signal and the model server's auth header
 * pass through.
 * @param input - The model server URL
 * @param init - Fetch options
 * @returns The model server's response (or the proxy's own error)
 */
async function localModelProxyFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : undefined;
  const url = input instanceof Request ? input.url : String(input);
  const method = init?.method ?? request?.method ?? "GET";
  const headers = new Headers(init?.headers ?? request?.headers);

  headers.set(LOCAL_MODEL_URL_HEADER, new URL(url).href);

  // A Request carries its own body, which `init` overrides as in plain fetch.
  const body =
    init?.body ??
    (request != null && method !== "GET" && method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined);

  return await fetch(getLocalModelProxyUrl(), {
    method,
    body,
    signal: init?.signal ?? request?.signal,
    headers,
  });
}
