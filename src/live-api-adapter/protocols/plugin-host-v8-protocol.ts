// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// V8 talks to a separate Max for Live "plug-in host" wrapper device (a patch
// hosting `vst~`). The request goes to every wrapper over a named Max bus; only
// the one whose own device id matches `deviceId` answers.

import { requestChannel } from "#src/live-api-adapter/protocols/request-channel.ts";
import {
  MAX_SINGLE_MESSAGE_BYTES,
  oversizedSingleMessageError,
} from "#src/shared/mcp-responses.ts";

/** Named Max bus the wrapper devices listen on. */
const REQUEST_BUS = "ppal-plugin-host-req";

/** Ops that answer fast. A missing wrapper never answers at all. */
const QUICK_TIMEOUT_MS = 3_000;

/** A big synth can take a while to load, and a display search samples a param many times. */
const SLOW_TIMEOUT_MS = 20_000;

/** How a timeout's error begins. A wrapper's own error never does. */
export const NO_ANSWER = "No plug-in host answered";

export type PluginHostOp =
  | "info"
  | "load"
  | "params"
  | "set"
  | "write"
  | "raw"
  | "map"
  | "unmap"
  | "slots";

export interface PluginHostResponse {
  success: boolean;
  error?: string;
  /** The request was too large for one Max message, so nothing was sent. */
  tooLarge?: true;
  [key: string]: unknown;
}

const channel = requestChannel({
  idPrefix: "plugin-host-",
  transmit: (requestId, payload) => {
    messnamed(REQUEST_BUS, "request", requestId, payload);
  },
  responseMessage: "plugin_host_response",
  timeoutError: (subject, timeoutMs) =>
    `${NO_ANSWER} for ${subject} within ${timeoutMs}ms. ` +
    "Check the device id and that the wrapper device is loaded.",
});

/**
 * Ask the plug-in host wrapper on one device and await its answer.
 * @param deviceId - Live id of the wrapper device
 * @param op - What to ask for
 * @param args - The op's own fields
 * @param maxWaitMs - Wait at most this long, when that is less than the op's usual wait
 * @returns The wrapper's reply, or a failure when none came
 */
export function requestPluginHost(
  deviceId: string,
  op: PluginHostOp,
  args: object = {},
  maxWaitMs = Infinity,
): Promise<PluginHostResponse> {
  const usual =
    op === "load" || op === "write" ? SLOW_TIMEOUT_MS : QUICK_TIMEOUT_MS;

  const payload = JSON.stringify({ deviceId, op, ...args });
  const subject = `device id ${deviceId} (${op})`;
  const tooLarge = tooLargeError(payload, subject);
  const sent = channel.send<PluginHostResponse>(
    payload,
    subject,
    tooLarge,
    Math.min(usual, maxWaitMs),
  );

  return tooLarge == null
    ? sent
    : sent.then((response) => ({ ...response, tooLarge: true }));
}

/**
 * Ask a device whether it is a plug-in host wrapper, and if so for one op, in
 * one go. A wrapper answers inside the same call, so a device that isn't one
 * costs nothing: no waiting out a timeout.
 * @param deviceId - Live id of the device
 * @param op - What to ask for
 * @param args - The op's own fields
 * @returns The wrapper's reply, or null when the device is not a wrapper. A
 *   request too large for one message is never sent: it fails with `tooLarge`.
 */
export function probePluginHost(
  deviceId: string,
  op: PluginHostOp,
  args: object = {},
): PluginHostResponse | null {
  const payload = JSON.stringify({ deviceId, op, ...args });
  const tooLarge = tooLargeError(payload, `device id ${deviceId} (${op})`);

  if (tooLarge != null) {
    return { success: false, error: tooLarge, tooLarge: true };
  }

  return channel.probe(payload) as PluginHostResponse | null;
}

/**
 * Handle plugin_host_response message from a wrapper device.
 * @param requestId - Request identifier
 * @param responseJson - JSON string of the reply
 */
export function handlePluginHostResponse(
  requestId: string,
  responseJson: string,
): void {
  channel.receive(requestId, responseJson);
}

/**
 * Max cuts a message past ~32 KB, and the wrapper then can't read it and says
 * nothing. So a big request is refused here instead of sent.
 * @param payload - The request, serialized
 * @param subject - What the request is, for the error text
 * @returns Why it can't be sent, or null when it fits
 */
function tooLargeError(payload: string, subject: string): string | null {
  return oversizedSingleMessageError(
    payload,
    subject,
    "Nothing was sent. Send less in one call.",
    MAX_SINGLE_MESSAGE_BYTES,
  );
}
