// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** A resolved parameter reference with its index, name, and value range. */
export interface ResolvedParam {
  index: number;
  name: string;
  min: number;
  max: number;
}

/** Function that fetches a device by path and returns its parameter list. */
export type DeviceLookup = (devicePath: string) => Promise<{
  parameters: { name: string; min: number; max: number }[];
}>;

/**
 * Resolve a device parameter by name or index, returning its index, name, and min/max range.
 * @param devicePath - Live API path to the device (e.g. "t0/d0")
 * @param parameter - Parameter name (string) or zero-based index (number)
 * @param lookup - Injected function that fetches the device by path
 * @returns Resolved parameter reference with index, name, min, and max
 */
export async function resolveParam(
  devicePath: string,
  parameter: string | number,
  lookup: DeviceLookup,
): Promise<ResolvedParam> {
  const dev = await lookup(devicePath);
  const params = dev.parameters;
  let index: number;

  if (typeof parameter === "number") {
    if (!Number.isInteger(parameter)) {
      throw new Error(`Parameter-Index muss ganzzahlig sein (war ${parameter})`);
    }

    if (parameter < 0 || parameter >= params.length) {
      throw new Error(`Parameter-Index ${parameter} ausserhalb 0..${params.length - 1}`);
    }

    index = parameter;
  } else {
    index = params.findIndex((p) => p.name === parameter);

    if (index === -1) {
      throw new Error(
        `Parameter "${parameter}" nicht gefunden. verfuegbar: ${params.map((p) => p.name).join(", ")}`,
      );
    }
  }

  const p = params[index];

  return { index, name: p.name, min: p.min, max: p.max };
}
