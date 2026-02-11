// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ConnectResult,
  NotesResult,
  SamplesResult,
} from "./session-helpers.ts";
import {
  handleConnect,
  handleReadNotes,
  handleSearchSamples,
  handleWriteNotes,
} from "./session-helpers.ts";

interface SessionArgs {
  action?: string;
  content?: string;
  search?: string;
}

type SessionResult = ConnectResult | NotesResult | SamplesResult;

/**
 * Unified session management tool for Producer Pal
 * @param args - The parameters
 * @param args.action - Action to perform (defaults to "connect")
 * @param args.content - Notes content (required for write-memory)
 * @param args.search - Search filter (for search-samples)
 * @param context - The context object
 * @returns Result varies by action
 */
export function session(
  { action = "connect", content, search }: SessionArgs = {},
  context: Partial<ToolContext> = {},
): SessionResult {
  switch (action) {
    case "connect":
      return handleConnect(context);
    case "read-memory":
      return handleReadNotes(context);
    case "write-memory":
      return handleWriteNotes(content, context);
    case "search-samples":
      return handleSearchSamples(search, context);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
