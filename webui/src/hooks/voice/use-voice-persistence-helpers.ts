// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";

/**
 * Combine a previously-saved voice transcript with the current live session
 * history. The Realtime SDK can re-seed `message` items via
 * `session.updateHistory` but explicitly refuses to re-add `function_call` /
 * `mcp_call` items. Without this merge, continuing an old conversation would
 * silently drop every historical tool call from the saved record.
 *
 * Strategy: keep `prior` in its original order (so historical function calls
 * stay where they were), then append `live` items whose ids aren't already in
 * `prior` (i.e. genuinely new turns from this session).
 *
 * Dedup by `itemId` is safe across a Stop → Talk re-seed because the SDK
 * preserves item ids when priming: `session.updateHistory` →
 * `transport.resetHistory` sends `conversation.item.create` with `id: itemId`
 * (not a server-minted id) and diffs history by `itemId`, and the Realtime API
 * echoes the client-supplied id back. So seeded prior messages return with
 * their original ids and match `prior` here instead of appending as duplicates.
 * (Verified against @openai/agents-realtime 0.11.4 — see openaiRealtimeBase
 * resetHistory and utils diffRealtimeHistory.)
 *
 * @param prior - Items loaded from the saved record (full, with tool calls)
 * @param live - Current session history (messages only after priming)
 * @returns Merged history with historical tool calls preserved
 */
export function mergeVoiceHistory(
  prior: RealtimeItem[],
  live: RealtimeItem[],
): RealtimeItem[] {
  if (prior.length === 0) return live;
  const priorIds = new Set(prior.map((i) => i.itemId));
  const additions = live.filter((i) => !priorIds.has(i.itemId));

  return [...prior, ...additions];
}
