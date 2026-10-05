// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about which rack macros are mapped, which only the
// Producer Pal remote script (remote-script/) can say. The result is the remote
// script's own JSON.

export {
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
  REMOTE_SCRIPT_ROUTE_TIMEOUT_MS,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";

/** The Node route V8 calls to reach the remote script's `/device/macros`. */
export const RACK_MACROS_ROUTE = "remoteScript.device.macros";

/** The most racks one `/device/macros` call takes; more are asked in chunks. */
export const MAX_RACKS_PER_CALL = 200;

/** The racks to ask about: each one's Live path, e.g. "live_set tracks 0 devices 1". */
export interface RackMacrosRequest {
  devicePaths: string[];
}

/** What the remote script says about one rack, or why it can't. */
export type RackMacrosEntry =
  | {
      /** The mapped macros' numbers, 1-based (macro 1 is the first) */
      mapped: number[];
    }
  | { error: string };

export interface RackMacrosResult {
  /** One per path asked, in order */
  racks: RackMacrosEntry[];
}
