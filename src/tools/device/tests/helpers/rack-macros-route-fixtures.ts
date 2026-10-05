// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A stand-in for the remote script's rack macros route. The test file mocks
// node-request-v8-protocol.ts itself.

import { vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  RACK_MACROS_ROUTE,
  type RackMacrosEntry,
} from "#src/tools/shared/remote-script/rack-macros-contract.ts";

/**
 * Have the remote script say which macros are mapped on each rack asked about.
 * @param racks - What it says about each rack
 */
export function remoteScriptSays(...racks: RackMacrosEntry[]): void {
  vi.mocked(requestNode).mockResolvedValue({
    success: true,
    result: { available: true, result: { racks } },
  });
}

/**
 * The paths each macros request asked about.
 * @returns One list per request
 */
export function pathsAsked(): unknown[] {
  return vi
    .mocked(requestNode)
    .mock.calls.filter(([route]) => route === RACK_MACROS_ROUTE)
    .map(([, args]) => (args as { devicePaths: string[] }).devicePaths);
}
