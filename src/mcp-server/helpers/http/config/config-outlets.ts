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

/** What POST /config could not deliver. */
export interface ConfigOutletFailures {
  /** Request fields that did not reach the device, all rolled back in Node. */
  fields: string[];
  /**
   * Fields whose settings reached the device before a sibling send failed, and
   * whose put-back to the old value failed too: the device may hold the new
   * value while Node holds the old one.
   */
  unrestored: string[];
}

/**
 * Send every outlet, even after one fails. A field is all-or-nothing: if any
 * send for it is lost, every setting it carries is rolled back in Node, and any
 * that already reached the device are sent back with their old value (best
 * effort). So Node's config matches the device either way.
 *
 * @param config - Node's config, already holding the new values
 * @param before - Copy of the config taken before the new values went in
 * @param outlets - The sends, in order
 * @returns The fields that failed (both empty on success)
 */
export async function emitConfigOutlets<C extends object>(
  config: C,
  before: C,
  outlets: Array<ConfigOutlet<C>>,
): Promise<ConfigOutletFailures> {
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
  const lostFields = new Set(
    outlets
      .filter((o) => failed.has(o.deviceKey) && !reached.has(o.deviceKey))
      .map((o) => o.field),
  );
  const undone = outlets.filter(
    (o) =>
      lostFields.has(o.field) &&
      // Another field's send that landed the same setting keeps it.
      !outlets.some(
        (p) =>
          !lostFields.has(p.field) &&
          p.configKey === o.configKey &&
          reached.has(p.deviceKey),
      ),
  );

  for (const { configKey } of undone) {
    // Skip if another request changed it while we were sending.
    if (config[configKey] === applied.get(configKey)) {
      config[configKey] = before[configKey];
    }
  }

  const unrestored = await putBackReached(undone, reached);

  return { fields: [...lostFields], unrestored };
}

/**
 * Send the rolled-back value of each setting that already reached the device.
 *
 * @param undone - Outlets whose setting was rolled back in Node
 * @param reached - Device settings that got their new value
 * @returns The fields whose put-back failed
 */
async function putBackReached<C extends object>(
  undone: Array<ConfigOutlet<C>>,
  reached: Set<string>,
): Promise<string[]> {
  const sent = new Set<string>();
  const unrestored = new Set<string>();

  for (const outlet of undone) {
    if (!reached.has(outlet.deviceKey) || sent.has(outlet.deviceKey)) {
      continue;
    }

    sent.add(outlet.deviceKey);

    try {
      await outlet.send();
    } catch (error) {
      unrestored.add(outlet.field);
      nodeError(
        `POST /config: putting ${outlet.deviceKey} back on the device failed: ${errorMessage(error)}`,
      );
    }
  }

  return [...unrestored];
}
