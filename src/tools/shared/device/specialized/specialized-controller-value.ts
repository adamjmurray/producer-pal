// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { formatParamName, readParameter } from "../helpers/param-reading.ts";
import { type PseudoParam } from "./specialized-device-types.ts";

/**
 * A device param's current display value, as read-device reports it. Reads the
 * device itself, so it works for a param a param search left out of the list.
 * @param device - LiveAPI device object
 * @param pseudoParams - The device's pseudo-params, checked first
 * @param name - Display name of the param
 * @returns The value, or undefined when the device has no such param
 */
export function readControllerValue(
  device: LiveAPI,
  pseudoParams: PseudoParam[],
  name: string,
): unknown {
  const pseudo = pseudoParams.find((param) => param.name === name);

  if (pseudo != null) {
    return pseudo.read(device);
  }

  let value: unknown;

  device.someChild("parameters", (param) => {
    if (formatParamName(param) !== name) {
      return false;
    }

    value = readParameter(param).value;

    return true;
  });

  return value;
}
