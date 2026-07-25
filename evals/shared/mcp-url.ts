// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The Producer Pal MCP endpoint every eval-side client connects to.
 *
 * Single source of truth: the chat CLI, the Codex CLI transport, the /config
 * helpers, and the Live Set launcher all read this, so `MCP_URL=...` reaches
 * every path instead of only whichever one happened to check the env var.
 */

export const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";
