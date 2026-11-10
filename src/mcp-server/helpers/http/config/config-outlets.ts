// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { nodeError } from "../../../node-for-max-logger.ts";

/** One setting POST /config sends to the device. */
export interface ConfigOutlet<C extends object> {
  /** The POST /config field that caused this send. */
  field: string;
  /** The setting in Node's config this send carries. */
  configKey: keyof C & string;
  /** The device setting name, as sent to Max. */
  deviceKey: string;
  send: () => Promise<void>;
}

/**
 * Send every outlet, even after one fails. A setting the device never got is
 * rolled back in Node, so Node's config matches the device either way.
 *
 * @param config - Node's config, already holding the new values
 * @param before - Copy of the config taken before the new values went in
 * @param outlets - The sends, in order
 * @returns The request fields that did not reach the device (empty on success)
 */
export async function emitConfigOutlets<C extends object>(
  config: C,
  before: C,
  outlets: Array<ConfigOutlet<C>>,
): Promise<string[]> {
  const applied = new Map(
    outlets.map((o) => [o.configKey, config[o.configKey]]),
  );
  const reached = new Set<string>();
  const failed = new Set<string>();

  for (const outlet of outlets) {
    try {
      await outlet.send();
      reached.add(outlet.deviceKey);
    } catch (error) {
      failed.add(outlet.deviceKey);
      nodeError(
        `POST /config: sending ${outlet.deviceKey} to the device failed: ${errorMessage(error)}`,
      );
    }
  }

  // Outlets that share a device setting send the same value: one getting
  // through is enough.
  const lost = outlets.filter(
    (o) => failed.has(o.deviceKey) && !reached.has(o.deviceKey),
  );

  for (const { configKey } of lost) {
    // Skip if another request changed it while we were sending.
    if (config[configKey] === applied.get(configKey)) {
      config[configKey] = before[configKey];
    }
  }

  return [...new Set(lost.map((o) => o.field))];
}
