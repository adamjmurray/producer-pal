// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about a device's name and on/off state, which Max's
// Live API can't read on a CC Control but the Producer Pal remote script
// (remote-script/) can. The result is the remote script's own JSON.

/** The Node route V8 calls to reach the remote script's `/device/basics`. */
export const DEVICE_BASICS_ROUTE = "remoteScript.device.basics";

/** The most devices one `/device/basics` call takes; more are asked in chunks. */
export const MAX_DEVICES_PER_CALL = 200;

/** The devices to ask about: each one's Live path. */
export interface DeviceBasicsRequest {
  devicePaths: string[];
}

/** A device's name and on/off state as the remote script reads them. */
export interface DeviceBasicsEntry {
  /** The name the user sees, or Live's default one */
  name: string;
  is_active: boolean;
}

export interface DeviceBasicsResult {
  /** One per path asked, in order */
  devices: Array<DeviceBasicsEntry | { error: string }>;
}
