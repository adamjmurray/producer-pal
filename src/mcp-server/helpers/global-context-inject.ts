// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../create-mcp-server.ts";
import { type McpResponse, type RequestOverrides } from "../max-api-adapter.ts";
import { readGlobalContext } from "./global-context-store.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the
 * machine-global user context (~/.producer-pal/context.md) as a distinct,
 * clearly-labeled content block. V8 has no filesystem access, so this is
 * injected here on the Node side — the only path that reaches external MCP
 * clients (Claude Desktop, LM Studio), which see context solely through the
 * connect result. The V8 connect body still carries the device's per-project
 * context (memoryContent); the two scopes stay separately labeled.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that appends global context to ppal-connect results
 */
export function withGlobalContext(
  inner: CallLiveApiFunction,
): (
  tool: string,
  args: object,
  overrides?: RequestOverrides,
) => Promise<McpResponse> {
  return async (
    tool: string,
    args: object,
    overrides?: RequestOverrides,
  ): Promise<McpResponse> => {
    const result = (await inner(tool, args, overrides)) as McpResponse;

    if (tool === "ppal-connect" && !result.isError) {
      // Trim here (not in the store) so the raw file stays byte-faithful for
      // the editor's GET/PUT round-trip while the injected block is clean.
      const globalContext = readGlobalContext().trim();

      if (globalContext) {
        result.content.push({
          type: "text",
          text:
            "Global context — persistent user preferences and facts that " +
            "apply across ALL projects (distinct from this Live Set's " +
            `per-project context):\n\n${globalContext}`,
        });
      }
    }

    return result;
  };
}
