// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// V8 talks to a separate Max for Live "plug-in host" wrapper device (a patch
// hosting `vst~`). The request goes to every wrapper over a named Max bus; only
// the one whose own device id matches `deviceId` answers.

import { requestChannel } from "#src/live-api-adapter/protocols/request-channel.ts";

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

  return channel.send<PluginHostResponse>(
    JSON.stringify({ deviceId, op, ...args }),
    `device id ${deviceId} (${op})`,
    null,
    Math.min(usual, maxWaitMs),
  );
}

/**
 * Ask a device whether it is a plug-in host wrapper, and if so for one op, in
 * one go. A wrapper answers inside the same call, so a device that isn't one
 * costs nothing: no waiting out a timeout.
 * @param deviceId - Live id of the device
 * @param op - What to ask for
 * @param args - The op's own fields
 * @returns The wrapper's reply, or null when the device is not a wrapper
 */
export function probePluginHost(
  deviceId: string,
  op: PluginHostOp,
  args: object = {},
): PluginHostResponse | null {
  return channel.probe(
    JSON.stringify({ deviceId, op, ...args }),
  ) as PluginHostResponse | null;
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
