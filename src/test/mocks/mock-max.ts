// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `max-api` mock standing in for Node for Max. `test-setup.ts` installs it
// globally; a test that cares what V8 "returns" calls setMcpResponse() or
// setMcpResponder() instead of building its own Max.outlet.

import { vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";

/** One `mcp_request` the mock saw, as V8 would have received it. */
export interface McpRequest {
  requestId: string;
  tool: string;
  argsJSON: string;
  contextJSON: string | undefined;
}

/** The `mcp_response` params for one request, or null to never reply at all. */
type McpResponder = () => string[] | null;

/** What V8 returns for a tool call that did its job and had nothing to say. */
const BARE_SUCCESS = { content: [{ type: "text", text: "{}" }] };

const defaultResponder: McpResponder = () => responseParams(BARE_SUCCESS);

let responder = defaultResponder;

/** Every `mcp_request` since the last reset, in order. */
export const mcpRequests: McpRequest[] = [];

/**
 * Replies to every tool call with one payload, instead of the bare success the
 * mock returns by default.
 * @param payload - The MCP response body V8 should return
 */
export function setMcpResponse(payload: unknown): void {
  responder = () => responseParams(payload);
}

/** Accepts requests and never replies, so the adapter's timeout path fires. */
export function neverRespondToMcp(): void {
  responder = () => null;
}

/**
 * The parsed `contextJSON` of the most recent request — the seam per-request
 * overrides (timeoutMs, compactOutput, notation) travel through to reach V8.
 * @returns The parsed context blob, or null if there is none to read
 */
export function lastMcpContext(): Record<string, unknown> | null {
  const json = mcpRequests.at(-1)?.contextJSON;

  return json == null ? null : (JSON.parse(json) as Record<string, unknown>);
}

type McpResponseHandler = (requestId: string, ...params: string[]) => void;

// Held separately so resetMaxMock() can put it back: tests that need a Max.outlet
// the responder API can't express still replace it outright, and without a
// restore the next test's setMcpResponse() would quietly do nothing.
const defaultOutlet = vi.fn(
  (
    message: string,
    requestId: string,
    tool: string,
    argsJSON: string,
    contextJSON?: string,
  ): Promise<void> => {
    if (message !== "mcp_request" || !Max.mcpResponseHandler) {
      return Promise.resolve();
    }

    const handler = Max.mcpResponseHandler;
    const params = responder();

    mcpRequests.push({ requestId, tool, argsJSON, contextJSON });

    // Defer the reply: the code inside the Promise callLiveApi() returns has
    // not run yet, so pendingRequests isn't in the state the handler needs.
    if (params != null) setTimeout(() => handler(requestId, ...params), 1);

    return Promise.resolve();
  },
);

export class Max {
  static post = vi.fn();

  static POST_LEVELS = {
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
  };

  static mcpResponseHandler: McpResponseHandler | null = null;
  static defaultMcpResponseHandler: McpResponseHandler | null = null; // Store the default handler
  static handlers: Map<string, (...args: unknown[]) => unknown> = new Map(); // Store all handlers

  static addHandler = vi.fn(
    (message: string, handler: (...args: unknown[]) => unknown) => {
      // Store all handlers in a map for tests to access
      Max.handlers.set(message, handler);

      if (message === "mcp_response") {
        Max.mcpResponseHandler = handler;

        // Save the first handler registered (from createExpressApp) as the default
        Max.defaultMcpResponseHandler ??= Max.mcpResponseHandler;
      }
    },
  );

  static outlet = defaultOutlet;
}

/**
 * The params a `mcp_response` carries after the request id: result chunks, then
 * MAX_ERROR_DELIMITER, then any Max console errors (none, here).
 * @param payload - The MCP response body V8 would send
 * @returns Params to pass after the request id
 */
function responseParams(payload: unknown): string[] {
  return [JSON.stringify(payload), MAX_ERROR_DELIMITER];
}

/** Puts the mock back to a bare-success default and clears recorded requests. */
export function resetMaxMock(): void {
  responder = defaultResponder;
  mcpRequests.length = 0;
  Max.outlet = defaultOutlet;
  defaultOutlet.mockClear();

  // Restore the default handler if it was saved
  if (Max.defaultMcpResponseHandler) {
    Max.mcpResponseHandler = Max.defaultMcpResponseHandler;
  }
}
