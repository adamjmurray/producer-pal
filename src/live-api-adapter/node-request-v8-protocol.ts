// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * V8-side async utility for invoking Node-side routes.
 * V8 sends route + args to Node, awaits the result via Promise.
 * Mirrors the code-exec rails but dispatches by route name instead of eval.
 */

import * as console from "#src/shared/max/v8-max-console.ts";

declare const Task: new (callback: () => void) => {
  schedule: (ms: number) => void;
};

export interface NodeResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

interface PendingNodeRequest {
  resolve: (result: NodeResponse) => void;
  timeoutTask: { cancel: () => void };
}

/** Default timeout for awaiting a Node-side route response */
const NODE_REQUEST_TIMEOUT_MS = 10_000;

/** Map of pending requests by requestId */
const pendingNodeRequests = new Map<string, PendingNodeRequest>();

/** Counter for generating unique request IDs */
let nextRequestId = 1;

/**
 * Generate a unique request ID for a node_request.
 *
 * @returns Unique request ID string
 */
function generateRequestId(): string {
  return `node-req-${nextRequestId++}`;
}

/**
 * Invoke a named Node-side route with args, awaiting the response.
 *
 * @param route - Route name registered on the Node side
 * @param args - Arguments to pass to the route handler
 * @returns Promise resolving to the route's response wrapper
 */
export function requestNode<T = unknown>(
  route: string,
  args: object = {},
): Promise<NodeResponse<T>> {
  const requestId = generateRequestId();

  return new Promise((resolve) => {
    const timeoutCallback = (): void => {
      if (pendingNodeRequests.has(requestId)) {
        pendingNodeRequests.delete(requestId);
        resolve({
          success: false,
          error: `node_request '${route}' timed out after ${NODE_REQUEST_TIMEOUT_MS}ms`,
        });
      }
    };

    const task = new Task(timeoutCallback);

    task.schedule(NODE_REQUEST_TIMEOUT_MS);

    pendingNodeRequests.set(requestId, {
      resolve: resolve as (result: NodeResponse) => void,
      timeoutTask: { cancel: () => task.schedule(-1) },
    });

    const request = JSON.stringify({ route, args });

    // If outlet throws synchronously (Max IPC failure), cancel the timeout
    // and resolve immediately so the caller doesn't wait 10s for nothing —
    // mirrors max-api-adapter.ts which handles the Node→V8 direction the
    // same way.
    try {
      outlet(0, "node_request", requestId, request);
    } catch (error) {
      pendingNodeRequests.delete(requestId);
      task.schedule(-1);

      const message = error instanceof Error ? error.message : String(error);

      resolve({
        success: false,
        error: `Failed to send node_request '${route}': ${message}`,
      });
    }
  });
}

/**
 * Handle node_response message from Node.
 * Resolves the pending Promise for the matching request ID.
 *
 * @param requestId - Request identifier
 * @param responseJson - JSON string of NodeResponse
 */
export function handleNodeResponse(
  requestId: string,
  responseJson: string,
): void {
  const pending = pendingNodeRequests.get(requestId);

  if (!pending) {
    console.error(`Received node_response for unknown request: ${requestId}`);

    return;
  }

  pendingNodeRequests.delete(requestId);
  pending.timeoutTask.cancel();

  try {
    const response = JSON.parse(responseJson) as NodeResponse;

    pending.resolve(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    pending.resolve({
      success: false,
      error: `Failed to parse node_response: ${message}`,
    });
  }
}
