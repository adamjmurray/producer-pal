// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isRedundantDeviceClassName } from "./device-reading.ts";
import {
  type HostedPlugin,
  isDefaultWrapperName,
} from "./params/hosted-plugin-reading.ts";

/**
 * The class a device reads as: a wrapper reads as the plug-in it hosts.
 * @param device - LiveAPI device object
 * @param hosted - The plug-in the device hosts, if it is a wrapper
 * @returns The class name
 */
export function deviceClassName(
  device: LiveAPI,
  hosted: HostedPlugin | null,
): string {
  return hosted?.label ?? (device.getProperty("class_display_name") as string);
}

/**
 * The fields that say which device this is.
 * @param device - LiveAPI device object
 * @param identity - The device's kind, class, path and hosted plug-in
 * @param identity.deviceType - The device's kind, like "instrument"
 * @param identity.className - The class it reads as
 * @param identity.path - The device's path, if it has one
 * @param identity.hosted - The plug-in the device hosts, if it is a wrapper
 * @returns The device's id, path, type, hosted marker and custom name
 */
export function describeDevice(
  device: LiveAPI,
  identity: {
    deviceType: string;
    className: string;
    path: string | null | undefined;
    hosted: HostedPlugin | null;
  },
): Record<string, unknown> {
  const { deviceType, className, path, hosted } = identity;
  const isRedundant = isRedundantDeviceClassName(deviceType, className);
  const userDisplayName = device.getName();
  const info: Record<string, unknown> = {
    id: device.id,
    ...(path && { path }),
    type: isRedundant ? deviceType : `${deviceType}: ${className}`,
    ...(hosted && { hosted: true }),
  };

  if (isCustomName(userDisplayName, className, hosted)) {
    info.name = userDisplayName;
  }

  return info;
}

/**
 * Whether a device's name is worth reporting: the user renamed it.
 * @param name - The device's name
 * @param className - The class it reads as
 * @param hosted - The plug-in the device hosts, if it is a wrapper
 * @returns True when the name is not the one it comes with
 */
function isCustomName(
  name: string,
  className: string,
  hosted: HostedPlugin | null,
): boolean {
  return name !== className && !(hosted != null && isDefaultWrapperName(name));
}
