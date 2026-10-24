// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// V8 asks Node to run a named route and awaits the answer. Same channel as
// code-exec, dispatching by route name instead of eval.

import { oversizedSingleMessageError } from "#src/shared/mcp-responses.ts";
import { REQUEST_TIMEOUT_MS, requestChannel } from "./request-channel.ts";

export interface NodeResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  /** The request was too large for one Max message, so nothing was sent. */
  tooLarge?: true;
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
  const payload = JSON.stringify({ route, args });
  const subject = `node_request '${route}'`;
  // node_request isn't chunked, and Max would cut a long one short.
  const tooLarge = oversizedSingleMessageError(
    payload,
    subject,
    "Send less in one call.",
  );
  const sent = channel.send<NodeResponse<T>>(
    payload,
    subject,
    tooLarge,
    timeoutMs,
  );

  return tooLarge == null
    ? sent
    : sent.then((response) => ({ ...response, tooLarge: true }));
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
