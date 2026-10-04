// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  hotswapPreset,
  presetScopeForTarget,
  resolveBrowserPreset,
} from "#src/tools/device/create/helpers/browser-presets.ts";
import { type BrowserItem } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { isDeviceClass } from "#src/tools/shared/device/is-device-class.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { type ResolvedTarget } from "./resolve-device-target.ts";

/**
 * What loading a target's preset did: replaced the device or kept it, or why
 * not. `changed` marks a failure after Live had already changed the device.
 */
export type PresetOutcome =
  | { replaced: boolean }
  | { error: string; changed?: true };

/** A loaded preset: what its entry should say, and the device Live put in the
 * old one's place when it replaced it. */
export interface PresetLoad {
  outcome: PresetOutcome;
  device?: LiveAPI;
}

/**
 * The device a target names, when it names one. Anything else (a chain, a pad)
 * gets no preset, and its entry says why.
 * @param resolved - The resolved target
 * @returns The device, or null
 */
export function presetDevice(resolved: ResolvedTarget): LiveAPI | null {
  return resolved.kind === "object" && isDeviceClass(resolved.target.type)
    ? resolved.target
    : null;
}

/**
 * Look up each target's preset, once per name and device kind. Every name is
 * looked up before anything loads, so one that matches no preset, or several,
 * fails the call with nothing changed.
 * @param devices - Each target's device, or null
 * @param presets - Each target's preset, or undefined
 * @param deadline - The request deadline
 * @returns Each target's browser item, or undefined where it gets none
 */
export async function lookUpPresets(
  devices: Array<LiveAPI | null>,
  presets: Array<string | undefined>,
  deadline: number | null | undefined,
): Promise<Array<BrowserItem | undefined>> {
  const cache = new Map<string, BrowserItem>();
  const found: Array<BrowserItem | undefined> = [];

  for (const [i, device] of devices.entries()) {
    const preset = presets[i];

    if (device == null || preset == null) {
      found.push(undefined);
      continue;
    }

    const scope = presetScopeForTarget(device);
    const key = [scope.type, scope.path, preset].join("\n");
    let item = cache.get(key);

    if (item == null) {
      item = await resolveBrowserPreset(preset, scope, deadline);
      cache.set(key, item);
    }

    found.push(item);
  }

  return found;
}

/**
 * Load a preset onto one device.
 * @param device - The target device
 * @param item - The preset
 * @param deadline - The request deadline
 * @returns What its entry should say, and the new device when Live replaced it
 */
export async function loadPreset(
  device: LiveAPI,
  item: BrowserItem,
  deadline: number | null | undefined,
): Promise<PresetLoad> {
  // Loading onto it, or a rack holding it, removes the device this tool runs on.
  if (isProducerPalDevice(device)) {
    return {
      outcome: { error: "the Producer Pal device can't load a preset" },
    };
  }

  const swapped = await hotswapPreset(device, item, deadline);

  if ("error" in swapped) {
    return { outcome: swapped };
  }

  return {
    outcome: { replaced: swapped.replaced },
    ...(swapped.replaced ? { device: swapped.device } : {}),
  };
}
