// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Asking the remote script to copy a device with Live's own duplicate_device,
// which Max for Live can't call.

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  type DeviceDuplication,
  REMOTE_SCRIPT_ROUTES,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  remoteScriptExpiry,
  remoteScriptWait,
} from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";

/**
 * What asking for a copy came to. `unfinished` marks a failure after which Live
 * may have made the copy anyway.
 */
export type RemoteDuplicate =
  | { kind: "unavailable" }
  | { kind: "copied"; index: number }
  | { kind: "failed"; reason: string; unfinished: boolean };

/**
 * Copy a device right after itself.
 * @param device - The device's Live API path and name
 * @param device.path - Where the device is
 * @param device.name - Its name now, so the remote script refuses when the
 *   device there has changed while the request queued
 * @param deadline - The request deadline from ToolContext
 * @returns Where the copy went, why there is none, or that there is no remote
 *   script to ask
 */
export async function duplicateOnRemoteScript(
  device: { path: string; name: string },
  deadline?: number | null,
): Promise<RemoteDuplicate> {
  const waitMs = remoteScriptWait(deadline);

  if (waitMs == null) {
    return { kind: "failed", reason: REQUEST_OUT_OF_TIME, unfinished: false };
  }

  const response = await requestNode<DeviceDuplication>(
    REMOTE_SCRIPT_ROUTES.duplicateDevice,
    {
      devicePath: device.path,
      deviceName: device.name,
      expiresInMs: remoteScriptExpiry(waitMs),
    },
    waitMs,
  );

  // Silence may be a request Live is still working through.
  if (!response.success || response.result == null) {
    return {
      kind: "failed",
      reason: response.error ?? "the remote script returned nothing",
      unfinished: true,
    };
  }

  const result = response.result;

  if (!result.available) {
    return { kind: "unavailable" };
  }

  return "error" in result
    ? {
        kind: "failed",
        reason: result.error,
        unfinished: result.unfinished === true,
      }
    : { kind: "copied", index: result.index };
}
