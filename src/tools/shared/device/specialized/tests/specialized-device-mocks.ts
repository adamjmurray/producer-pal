// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One mock builder for the specialized devices whose pseudo-params are read
// and written straight off the device, with no children to register.

import "#src/live-api-adapter/live-api-extensions.ts";

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";

/**
 * Build the registrar for one device's mock.
 * @param id - Mock id the device registers under
 * @param type - The device's Live object type
 * @param defaults - What it reports at factory defaults
 * @returns A function taking property overrides and returning the device
 */
export function specializedDeviceMock(
  id: string,
  type: LiveObjectType,
  defaults: Record<string, unknown>,
): (properties?: Record<string, unknown>) => LiveAPI {
  return (properties: Record<string, unknown> = {}) => {
    registerMockObject(id, {
      type,
      properties: { ...defaults, ...properties },
    });

    return LiveAPI.from(`id ${id}`);
  };
}

/**
 * Build the registrar for a device read through the read-device tool: it sits
 * at t0/d0 and reports everything read-device needs of any device.
 * @param id - Mock id the device registers under
 * @param className - What it reports as its name and class_display_name
 * @param deviceType - Live's device type code (1 instrument, 2 audio effect)
 * @param defaults - The pseudo-param properties it reports
 * @returns A function taking property overrides
 */
export function readableDeviceMock(
  id: string,
  className: string,
  deviceType: number,
  defaults: Record<string, unknown>,
): (properties?: Record<string, unknown>) => void {
  return (properties: Record<string, unknown> = {}) => {
    registerMockObject(id, {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: {
        name: className,
        class_display_name: className,
        type: deviceType,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        is_active: 1,
        parameters: [],
        ...defaults,
        ...properties,
      },
    });
  };
}
