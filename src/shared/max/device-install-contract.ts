// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The V8 → Node route the device uses to say where its own .amxd file is.
 * Node can't see that, and the Live Set references the device by this path.
 */
export const DEVICE_REPORT_ROUTE = "device.report";

/** Args of {@link DEVICE_REPORT_ROUTE}. */
export interface DeviceReportArgs {
  /** The patcher's `filepath`, in Max's own form (`Macintosh HD:/Users/…`) */
  filepath: string;
}
