// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The V8 side of a request/response pair with Node: one message out the outlet,
// one answer back, with a timeout in case none comes. Both the node_request and
// code_exec protocols run on one of these.

import * as console from "#src/shared/max/v8-max-console.ts";
import { suspendWarningCapture } from "#src/shared/max/v8-warning-capture.ts";

declare const Task: new (callback: () => void) => {
  schedule: (ms: number) => void;
};

/** How long V8 waits for Node's answer before giving up, unless a call says otherwise. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Every answer Node sends back says whether it worked. */
interface ChannelResult {
  success: boolean;
  error?: string;
}

/** How one protocol spells its messages. */
interface ChannelSpec {
  /** Prefix for this channel's request ids. */
  idPrefix: string;
  /** Message name sent out outlet 0. */
  requestMessage: string;
  /** Message name Node answers with, used in error text. */
  responseMessage: string;
  /**
   * Report a throw from `outlet` as a failed result instead of letting it
   * reject. Without it a Max IPC failure leaves the caller waiting out the
   * whole timeout for nothing.
   */
  reportSendFailure?: boolean;
}

/** One protocol's send and receive ends. */
interface RequestChannel {
  send: <T extends ChannelResult>(
    payload: string,
    subject: string,
    refusal?: string | null,
    timeoutMs?: number,
  ) => Promise<T>;
  receive: (requestId: string, responseJson: string) => void;
}

/**
 * Build one protocol's channel to Node.
 * @param spec - How this protocol spells its messages
 * @returns The channel's send and receive ends
 */
export function requestChannel(spec: ChannelSpec): RequestChannel {
  const pending = new Map<string, Pending>();
  let nextRequestId = 1;

  return {
    /**
     * Send one request and await Node's answer.
     * @param payload - The request body, already serialized
     * @param subject - What this call is, for the timeout and failure text
     * @param refusal - Why the request can't be sent at all, when it can't
     * @param timeoutMs - How long to wait for the answer
     * @returns The answer, or a failure when nothing usable came back
     */
    send<T extends ChannelResult>(
      payload: string,
      subject: string,
      refusal?: string | null,
      timeoutMs: number = REQUEST_TIMEOUT_MS,
    ): Promise<T> {
      const requestId = `${spec.idPrefix}${nextRequestId++}`;

      // Suspended across the await: another request can start while this one
      // waits, and its warnings must not be collected against ours. See
      // v8-warning-capture.
      return suspendWarningCapture(
        new Promise<T>((resolve) => {
          const fail = (error: string): void => {
            resolve({ success: false, error } as T);
          };

          if (refusal != null) {
            fail(refusal);

            return;
          }

          const task = new Task(() => {
            if (pending.delete(requestId)) {
              fail(`${subject} timed out after ${timeoutMs}ms`);
            }
          });

          task.schedule(timeoutMs);
          pending.set(requestId, {
            resolve: resolve as (result: ChannelResult) => void,
            cancelTimeout: () => task.schedule(-1),
          });

          try {
            outlet(0, spec.requestMessage, requestId, payload);
          } catch (error) {
            if (!spec.reportSendFailure) {
              throw error;
            }

            pending.delete(requestId);
            task.schedule(-1);
            fail(`Failed to send ${subject}: ${asMessage(error)}`);
          }
        }),
      );
    },

    /**
     * Hand Node's answer to the call that is waiting for it.
     * @param requestId - Request identifier
     * @param responseJson - The answer, as JSON
     */
    receive(requestId: string, responseJson: string): void {
      const waiting = pending.get(requestId);

      if (!waiting) {
        console.error(
          `Received ${spec.responseMessage} for unknown request: ${requestId}`,
        );

        return;
      }

      pending.delete(requestId);
      waiting.cancelTimeout();

      try {
        waiting.resolve(JSON.parse(responseJson) as ChannelResult);
      } catch (error) {
        waiting.resolve({
          success: false,
          error: `Failed to parse ${spec.responseMessage}: ${asMessage(error)}`,
        });
      }
    },
  };
}

/** One call waiting on Node. */
interface Pending {
  resolve: (result: ChannelResult) => void;
  cancelTimeout: () => void;
}

/**
 * The text of whatever was thrown.
 * @param error - The thrown value
 * @returns Its message
 */
function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
