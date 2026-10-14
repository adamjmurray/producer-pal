// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { DEVICE_REPORT_ROUTE } from "#src/shared/max/device-install-contract.ts";
import { registerNodeRoute } from "../node-request-protocol.ts";
import { requireString } from "../route-string-args.ts";
import { syncDeviceInstallNotice } from "./device-install-notice.ts";
import { recordDeviceSource } from "./device-source.ts";

/**
 * Register the route the device uses to say where its .amxd file is. The
 * answer decides whether the device offers to install itself, so the notice
 * is settled as soon as the path is known.
 */
export function registerDeviceReportRoute(): void {
  registerNodeRoute(DEVICE_REPORT_ROUTE, reportDevice);
}

/**
 * @param args - `{ filepath }`, the patcher's path in Max's form
 * @returns Whether the path was usable
 */
function reportDevice(args: unknown): { recorded: boolean } {
  const recorded = recordDeviceSource(requireString(args, "filepath")) != null;

  // Only a new path can change the answer, and an unusable one would make
  // the status ask the device again, in a loop.
  if (recorded) {
    void syncDeviceInstallNotice();
  }

  return { recorded };
}
