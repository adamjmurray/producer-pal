// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// V8 asks Node to run a named route and awaits the answer. Same channel as
// code-exec, dispatching by route name instead of eval.

import { requestChannel } from "./request-channel.ts";

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
 * @returns Promise resolving to the route's response wrapper
 */
export function requestNode<T = unknown>(
  route: string,
  args: object = {},
): Promise<NodeResponse<T>> {
  return channel.send<NodeResponse<T>>(
    JSON.stringify({ route, args }),
    `node_request '${route}'`,
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
