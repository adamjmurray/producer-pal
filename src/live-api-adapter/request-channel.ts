// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The V8 side of a request/response pair with Node: one message out the outlet,
// one answer back, with a timeout in case none comes. Both the node_request and
// code_exec protocols run on one of these.

import { maxError } from "#src/shared/max/v8-max-console.ts";
import { suspendWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
import { errorMessage } from "#src/shared/error-message.ts";

declare const Task: new (callback: () => void) => {
  schedule: (ms: number) => void;
};

/** How long V8 waits for Node's answer before giving up, unless a call says otherwise. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Every answer Node sends back says whether it worked. */
interface ChannelResult {
  success: boolean;
  error?: string;
  /** No answer came in time, so the request may or may not have run. */
  timedOut?: true;
  /** The request was never sent, so nothing ran. */
  notRun?: true;
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
  /**
   * Mark a failure with `timedOut` (it may have run) or `notRun` (it never
   * went out), so a caller can tell them apart from an answered failure.
   */
  markOutcomes?: boolean;
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
          const fail = (error: string, mark?: "timedOut" | "notRun"): void => {
            resolve({
              success: false,
              error,
              ...(spec.markOutcomes && mark != null && { [mark]: true }),
            } as T);
          };

          if (refusal != null) {
            fail(refusal, "notRun");

            return;
          }

          const task = new Task(() => {
            if (pending.delete(requestId)) {
              fail(`${subject} timed out after ${timeoutMs}ms`, "timedOut");
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
            pending.delete(requestId);
            task.schedule(-1);

            if (!spec.reportSendFailure) {
              throw error;
            }

            fail(`Failed to send ${subject}: ${asMessage(error)}`, "notRun");
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
        maxError(
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
  return errorMessage(error);
}
