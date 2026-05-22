// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Node-side dispatcher for V8 → Node RPC requests.
 * Routes are registered by name; handlers receive parsed args
 * and return any value (or a Promise of one). Errors are caught
 * and surfaced as { success: false, error } responses.
 */

import Max from "max-api";
import {
  MAX_ERROR_DELIMITER,
  planChunks,
} from "#src/shared/mcp-response-utils.ts";
import * as console from "../node-for-max-logger.ts";

export type NodeRouteHandler = (args: unknown) => unknown;

/**
 * Max time a route handler may run before we synthesize a timeout failure.
 * Slightly longer than the V8-side request timeout (10s) so the V8 side
 * times out first in the common case; this is a backstop that ensures Node
 * stops holding the handler's closure state and pending args indefinitely
 * if the handler itself hangs (e.g. SQLite deadlock).
 */
const NODE_HANDLER_TIMEOUT_MS = 15_000;

/** Registry of route name → handler */
const routes = new Map<string, NodeRouteHandler>();

/**
 * Register a route handler. Throws if the name is already registered.
 *
 * @param name - Route name (e.g. "library.searchSamples")
 * @param handler - Handler called with parsed args, returning the route's result
 */
export function registerNodeRoute(
  name: string,
  handler: NodeRouteHandler,
): void {
  if (routes.has(name)) {
    throw new Error(`Route '${name}' is already registered`);
  }

  routes.set(name, handler);
}

/**
 * Clear all registered routes. Intended for tests.
 */
export function clearNodeRoutes(): void {
  routes.clear();
}

/**
 * Handle a node_request message from V8.
 * Parses the request, dispatches to the registered route, and
 * sends the result back via node_response.
 *
 * @param requestId - The request ID to correlate with the response
 * @param requestJson - JSON string with { route, args }
 */
export async function handleNodeRequest(
  requestId: string,
  requestJson: string,
): Promise<void> {
  let route: string;
  let args: unknown;

  try {
    const parsed = JSON.parse(requestJson) as { route: string; args: unknown };

    route = parsed.route;
    args = parsed.args;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(
      `Failed to parse node_request: ${message} [requestId=${requestId}]`,
    );

    await sendNodeResponse(requestId, {
      success: false,
      error: `Failed to parse request: ${message}`,
    });

    return;
  }

  const handler = routes.get(route);

  if (!handler) {
    await sendNodeResponse(requestId, {
      success: false,
      error: `Unknown route: ${route}`,
    });

    return;
  }

  try {
    const result = await runWithTimeout(
      () => handler(args),
      NODE_HANDLER_TIMEOUT_MS,
      route,
      requestId,
    );

    await sendNodeResponse(requestId, { success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await sendNodeResponse(requestId, {
      success: false,
      error: message,
    });
  }
}

/**
 * Race a handler invocation against a timeout. The handler promise is not
 * cancellable — on timeout we abandon it (the race result is the timeout
 * rejection) but the underlying work keeps running until it settles. Logs
 * once on timeout so a hung handler is visible.
 *
 * @param invoke - Thunk that calls the route handler
 * @param timeoutMs - Timeout in milliseconds
 * @param route - Route name (for the log message)
 * @param requestId - Request ID (for the log message)
 * @returns Handler's result, or throws if the timeout fires first
 */
async function runWithTimeout(
  invoke: () => unknown,
  timeoutMs: number,
  route: string,
  requestId: string,
): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const message = `Route '${route}' timed out after ${timeoutMs}ms`;

      console.error(`${message} [requestId=${requestId}]`);
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => invoke()),
      timeoutPromise,
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/**
 * Send a node_response back to V8.
 *
 * @param requestId - The request ID
 * @param response - The response payload
 * @param response.success - Whether the route succeeded
 * @param response.result - The route's return value (on success)
 * @param response.error - Error message (on failure)
 */
async function sendNodeResponse(
  requestId: string,
  response: { success: boolean; result?: unknown; error?: string },
): Promise<void> {
  const jsonString = JSON.stringify(response);
  const plan = planChunks(jsonString);
  const chunks =
    plan.tooLargeError == null
      ? plan.chunks
      : [JSON.stringify({ success: false, error: plan.tooLargeError })];

  try {
    await Max.outlet(
      "node_response",
      requestId,
      ...chunks,
      MAX_ERROR_DELIMITER,
    );
  } catch (error) {
    console.error(
      `Failed to send node_response: ${String(error)} [requestId=${requestId}]`,
    );
  }
}
