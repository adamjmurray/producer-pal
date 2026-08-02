// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A spawned worker's system-prompt briefing: the skills its toolset needs, the
// Live Set it works in, and the user's context layers — fetched once at spawn
// from GET /subagent-briefing and appended to the system instruction it inherits.
//
// This replaces the ppal-connect call every worker used to make. That call cost
// an entire inference round per spawn and landed the whole skills blob in
// message history, where a fresh conversation can never amortize it. The system
// prompt is the one part of a worker's request that repeats byte-for-byte across
// spawns of the same profile, so it is where a cache hit is possible at all.
//
// Every failure path resolves to null and the worker keeps ppal-connect: a
// briefing is an optimization, and losing it must degrade to the old behavior
// rather than launch a worker that knows nothing about the Live Set.

import { BRIEFING_REQUEST_HEADER } from "#src/shared/config";
import { perRequestHeaders } from "#webui/chat/helpers/mcp-client-helpers";
import { type ChatClientConfig } from "#webui/chat/sdk/types";
import { getSubagentBriefingUrl } from "#webui/utils/mcp-url";

/**
 * The tools a briefed worker does without. `ppal-connect` is what the briefing
 * replaces; `ppal-context` reads and writes the user's context and memory, which
 * is the orchestrator's business — a worker gets the context it needs handed to
 * it, and letting a parallel fan-out of workers write to a
 * whole-document-replacing store is a race with the user's own notes as the
 * stake.
 *
 * Withholding them also shortens the briefing itself: the server drops the
 * skills fragments that teach a withheld tool, so the same list that removes
 * ppal-context removes its guidance.
 */
export const WORKER_WITHHELD_TOOLS = ["ppal-connect", "ppal-context"] as const;

/**
 * Fetch the briefing for a worker about to run under `config`.
 *
 * The profile — notation, small-model mode, withheld tools — is sent on the same
 * three headers the worker's own MCP requests carry, so the briefing describes
 * exactly the toolset and notation it will have. Pass the config AFTER
 * {@link withheldToolsApplied}, or the briefing will teach tools the worker
 * doesn't get.
 *
 * @param config - The resolved worker config
 * @returns The briefing text, or null when it could not be fetched
 */
export async function fetchSubagentBriefing(
  config: ChatClientConfig,
): Promise<string | null> {
  try {
    const response = await fetch(getSubagentBriefingUrl(config.mcpUrl), {
      headers: {
        ...perRequestHeaders(
          config.smallModelMode,
          config.enabledTools,
          config.notation,
        ),
        // Required by the route: a custom header is the one thing a markup-
        // driven cross-site GET can't produce. See BRIEFING_REQUEST_HEADER.
        [BRIEFING_REQUEST_HEADER]: "1",
      },
    });

    if (!response.ok) return null;

    const body: unknown = await response.json();
    const briefing = (body as { briefing?: unknown }).briefing;

    return typeof briefing === "string" && briefing.trim() !== ""
      ? briefing
      : null;
  } catch {
    // Server down, Live unreachable (502), malformed JSON — all the same
    // answer: no briefing, so the worker bootstraps itself the old way.
    return null;
  }
}

/**
 * The worker config with {@link WORKER_WITHHELD_TOOLS} switched off. Applied
 * BEFORE fetching, because the fetch reads the toolset off this config; applied
 * to the config the worker actually runs under only when a briefing came back.
 *
 * @param config - The worker config to narrow
 * @returns A copy with the briefing-replaced tools disabled
 */
export function withheldToolsApplied(
  config: ChatClientConfig,
): ChatClientConfig {
  const enabledTools = { ...config.enabledTools };

  for (const tool of WORKER_WITHHELD_TOOLS) enabledTools[tool] = false;

  return { ...config, enabledTools };
}

/**
 * The worker config with the briefing appended to its system instruction.
 *
 * Appended rather than replacing: the worker still inherits the orchestrator's
 * instruction (built-in or the user's custom one), and the briefing ends with
 * the subagent framing, so the parts of an inherited instruction written for a
 * user-facing chat — "suggest connecting", "call ppal-connect" — get the last
 * word overruling them.
 *
 * @param config - The worker config to brief
 * @param briefing - The briefing text
 * @returns A copy whose systemInstruction carries the briefing
 */
export function withBriefing(
  config: ChatClientConfig,
  briefing: string,
): ChatClientConfig {
  const inherited = config.systemInstruction?.trim();

  return {
    ...config,
    systemInstruction: inherited ? `${inherited}\n\n${briefing}` : briefing,
  };
}
