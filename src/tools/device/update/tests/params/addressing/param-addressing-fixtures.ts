// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  children,
  livePath,
  registerMockObject,
} from "../../update-device-test-helpers.ts";

/**
 * Register the device under test at t0/d0, holding the given params.
 * @param paramIds - Parameter mock ids, in the device's parameter order
 */
export function registerDevice(...paramIds: string[]): void {
  registerMockObject("123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children(...paramIds) },
  });
}
