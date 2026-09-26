// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// V8 asks Node to run a named route and awaits the answer. Same channel as
// code-exec, dispatching by route name instead of eval.

import { REQUEST_TIMEOUT_MS, requestChannel } from "./request-channel.ts";

export interface NodeResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

const channel = requestChannel({
  idPrefix: "node-req-",
  requestMessage: "node_request",
  responseMessage: "node_response",
  // A Max IPC failure otherwise leaves the caller waiting out the whole
  // timeout — max-api-adapter.ts does the same for the Node→V8 direction.
  reportSendFailure: true,
});

/**
 * Invoke a named Node-side route with args, awaiting the response.
 * @param route - Route name registered on the Node side
 * @param args - Arguments to pass to the route handler
 * @param timeoutMs - How long to wait; a route that runs longer on purpose
 *   also registers a longer Node-side timeout
 * @returns Promise resolving to the route's response wrapper
 */
export function requestNode<T = unknown>(
  route: string,
  args: object = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<NodeResponse<T>> {
  return channel.send<NodeResponse<T>>(
    JSON.stringify({ route, args }),
    `node_request '${route}'`,
    null,
    timeoutMs,
  );
}

/**
 * Handle node_response message from Node.
 * @param requestId - Request identifier
 * @param responseJson - JSON string of NodeResponse
 */
export function handleNodeResponse(
  requestId: string,
  responseJson: string,
): void {
  channel.receive(requestId, responseJson);
}
