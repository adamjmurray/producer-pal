// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device's name and on/off state. Max's Live API can't read either on a CC
// Control; the Producer Pal remote script reads them through Live's Python API.

import {
  type Unreadable,
  askAboutDevices,
} from "#src/tools/shared/remote-script/device-batch-route.ts";
import {
  DEVICE_BASICS_ROUTE,
  MAX_DEVICES_PER_CALL,
  type DeviceBasicsResult,
} from "#src/tools/shared/remote-script/device-basics/device-basics-contract.ts";

/** A device's name and on/off state. */
export interface DeviceBasics {
  name: string;
  active: boolean;
}

/**
 * Ask the remote script for each device's name and on/off state, a chunk of
 * devices at a time. Never throws: a device it can't answer for carries the
 * reason.
 * @param devices - The devices to ask about
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one for each call, for a
 *   caller that can do without the answer
 * @returns One answer per device, in order; null when the remote script isn't
 *   running at the first call, so there is nothing to ask. If it goes missing
 *   later, the ones it hadn't answered for carry that as their reason.
 */
export function lookUpDeviceBasics(
  devices: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs?: number,
): Promise<Array<DeviceBasics | Unreadable> | null> {
  return askAboutDevices<DeviceBasicsResult, DeviceBasics>(
    {
      route: DEVICE_BASICS_ROUTE,
      maxPerCall: MAX_DEVICES_PER_CALL,
      missing: "the Producer Pal remote script isn't running",
      entries: (result) =>
        result.devices.map((entry) =>
          "error" in entry
            ? entry
            : { name: entry.name, active: entry.is_active },
        ),
    },
    devices,
    deadline,
    maxWaitMs,
  );
}
