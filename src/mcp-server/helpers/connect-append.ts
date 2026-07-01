// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared seam for enriching the ppal-connect result Node-side. V8 has no
// filesystem, so machine-global user content (skills overrides, global context)
// is read here and APPENDED as a distinct text block to a successful
// ppal-connect response — the same append seam the `WARNING:` relay uses. Each
// feature supplies a producer that returns its block (or null to skip); this
// helper owns the "only ppal-connect, only on success" guard so the wrappers
// stay tiny and consistent.

import { type CallLiveApiFunction } from "../create-mcp-server.ts";
import { type McpResponse, type RequestOverrides } from "../max-api-adapter.ts";

/** A wrapped callLiveApi with the same signature as the inner one. */
export type WrappedCallLiveApi = (
  tool: string,
  args: object,
  overrides?: RequestOverrides,
) => Promise<McpResponse>;

/**
 * Wrap a callLiveApi so a successful ppal-connect response gains an extra text
 * block produced by `produceBlock`. Non-connect tools, error responses, and a
 * null/empty producer result pass through untouched. Compose these to append
 * multiple blocks (e.g. skills then global context).
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param produceBlock - Returns the block text to append, or null to skip
 * @returns A callLiveApi that appends the block to ppal-connect results
 */
export function withConnectAppend(
  inner: CallLiveApiFunction,
  produceBlock: () => string | null,
): WrappedCallLiveApi {
  return async (
    tool: string,
    args: object,
    overrides?: RequestOverrides,
  ): Promise<McpResponse> => {
    const result = (await inner(tool, args, overrides)) as McpResponse;

    if (tool === "ppal-connect" && !result.isError) {
      const block = produceBlock();

      if (block) {
        result.content.push({ type: "text", text: block });
      }
    }

    return result;
  };
}
