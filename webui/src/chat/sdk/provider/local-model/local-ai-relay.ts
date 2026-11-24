// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  LOCAL_AI_DEFAULT_URLS,
  type LocalAiServer,
  isLocalModelUrl,
} from "#src/shared/config";
import { getLocalAiRelayUrl } from "#webui/utils/mcp-url";

/**
 * The URL to call Ollama or Bionic / LM Studio at. On a page opened from a
 * phone or another computer, `localhost` means that device, so a URL at the
 * server's default address goes through the Producer Pal server's relay to
 * Live's computer instead. Any other URL, and any URL on Live's computer
 * itself, is returned unchanged. The relay only knows the default addresses,
 * since settings live in each browser.
 * @param provider - Provider identifier
 * @param url - The URL setting, with or without `/v1`
 * @returns The relay URL (keeping `/v1` when given), or `url`
 */
export function relayLocalAiUrl(provider: string, url: string): string {
  if (!Object.hasOwn(LOCAL_AI_DEFAULT_URLS, provider) || !isPageRemote()) {
    return url;
  }

  const server = provider as LocalAiServer;
  const path = defaultAddressPath(server, url);

  return path == null ? url : `${getLocalAiRelayUrl(server)}${path}`;
}

/**
 * The path of a URL at the server's default address on this computer: "" or
 * "/v1". Undefined for any other URL.
 * @param server - The local AI server
 * @param url - The URL setting
 * @returns The path, or undefined
 */
function defaultAddressPath(
  server: LocalAiServer,
  url: string,
): string | undefined {
  if (!isLocalModelUrl(url)) {
    return undefined;
  }

  const parsed = new URL(url.trim());
  const defaults = new URL(LOCAL_AI_DEFAULT_URLS[server]);
  const path = parsed.pathname.replace(/\/+$/, "");

  return parsed.protocol === defaults.protocol &&
    parsed.port === defaults.port &&
    parsed.search === "" &&
    (path === "" || path === "/v1")
    ? path
    : undefined;
}

// Opened from another device: there is a page, and it isn't on localhost.
function isPageRemote(): boolean {
  return (
    typeof window !== "undefined" && !isLocalModelUrl(window.location.origin)
  );
}
