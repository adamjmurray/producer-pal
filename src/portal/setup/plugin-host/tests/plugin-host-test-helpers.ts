// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { PLUGIN_HOST_WRAPPERS } from "../plugin-host-wrappers.ts";

export const EFFECT = "PPal Plug-in Effect.amxd";
export const INSTRUMENT = "PPal Plug-in Instrument.amxd";

/**
 * @param version - Text that makes the bytes differ between "versions"
 * @returns A wrapper source with different bytes for each wrapper
 */
export function fakeSource(version = "v1"): Record<string, string> {
  return Object.fromEntries(
    PLUGIN_HOST_WRAPPERS.map(({ fileName }) => [
      fileName,
      Buffer.from(`${version} ${fileName}`).toString("base64"),
    ]),
  );
}
