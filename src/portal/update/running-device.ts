// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** The Producer Pal device the bridge is connected to, as the update sees it. */
export interface RunningDevice {
  /** Connect to the device's server; throws until it answers */
  connect: () => Promise<void>;
  /** The version the connected server reported, if it did */
  version: () => string | undefined;
  /** Drop the connection, so the next connect asks whatever answers now */
  reset: () => void;
  /** Tell the client to re-list tools, which may differ between versions */
  toolsChanged: () => void;
}
