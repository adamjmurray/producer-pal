// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Disabled stub for the MCP SDK's `pkce-challenge` dependency, aliased in at
 * build time. The portal only talks to a local HTTP server, so the SDK's OAuth
 * path is never reached — this keeps the dependency out of the bundle.
 *
 * IMPORTANT: If this file is renamed or moved, update the alias entry in
 * config/rolldown.config.mjs to match.
 */

/**
 * Stub: throws, since the portal never performs an OAuth handshake.
 * @returns Never — always throws
 */
export default function pkceChallenge(): never {
  throw new Error(
    "Authorization not supported - Producer Pal uses local HTTP communication only",
  );
}
