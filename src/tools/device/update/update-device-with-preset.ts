// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type BrowserItem } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import {
  hotswapPreset,
  presetScopeForTarget,
  resolveBrowserPreset,
} from "#src/tools/device/create/helpers/browser-presets.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WriteResult } from "#src/tools/shared/validation/lists/write-fan-out.ts";
import {
  type PresetOutcome,
  resolveNamedTarget,
} from "./helpers/update-multiple-targets.ts";
import { isDeviceType } from "./helpers/update-target-types.ts";
import {
  type DeviceUpdatePlan,
  type UpdateDeviceArgs,
  planDeviceUpdate,
  runDeviceUpdate,
  updateDevice,
} from "./update-device.ts";

/**
 * update-device's entry point. A `preset` loads onto each target device first,
 * through the Producer Pal remote script, and the rest of the update then runs
 * on the device that's there. Without one, the update runs as it always has,
 * with nothing to await.
 * @param args - The update-device args
 * @param context - Internal context object, for the request deadline
 * @returns Updated object info(s)
 */
export function updateDeviceWithPreset(
  args: UpdateDeviceArgs,
  context: Partial<ToolContext> = {},
):
  | WriteResult<Record<string, unknown>>
  | Promise<WriteResult<Record<string, unknown>>> {
  return args.preset == null
    ? updateDevice(args, context)
    : loadPresetsThenUpdate(args, context.deadline);
}

/** A plan that updates targets rather than wrapping them. */
type TargetsPlan = Exclude<DeviceUpdatePlan, { wrap: unknown }>;

// --- Helpers below main export ---

/**
 * Check the whole call, load every target's preset, then run the rest.
 * @param args - The update-device args, with a preset
 * @param deadline - The request deadline
 * @returns Updated object info(s)
 */
async function loadPresetsThenUpdate(
  args: UpdateDeviceArgs,
  deadline: number | null | undefined,
): Promise<WriteResult<Record<string, unknown>>> {
  // Refuses a bad call before any preset loads, wrapInRack with a preset
  // included, so this plan never wraps.
  const plan = planDeviceUpdate(args) as TargetsPlan;

  const devices = plan.items.map(targetDevice);
  const presets = plan.items.map((_item, i) => plan.lists.valuesAt(i).preset);
  // Every name is looked up before anything loads, so one that matches no
  // preset, or several, fails the call with nothing changed.
  const found = await findPresets(devices, presets, deadline);
  const outcomes: Array<PresetOutcome | undefined> = [];
  const items: NamedTarget[] = [];

  for (const [i, item] of plan.items.entries()) {
    const device = devices[i];
    const preset = found[i];

    if (device == null || preset == null) {
      outcomes.push(undefined);
      items.push(item);
      continue;
    }

    const loaded = await loadOnto(device, preset, deadline);

    outcomes.push(loaded.outcome);
    // A new device has a new id, so an id-named target is renamed to it.
    items.push(
      loaded.id != null && item.param === "id"
        ? { param: "id", value: loaded.id }
        : item,
    );
  }

  return runDeviceUpdate({ ...plan, items }, outcomes);
}

/**
 * The device a target names, when it names one. Anything else (a chain, a pad,
 * nothing) gets no preset, and its entry says why.
 * @param item - The target
 * @returns The device, or null
 */
function targetDevice(item: NamedTarget): LiveAPI | null {
  try {
    const resolved = resolveNamedTarget(item);

    return resolved.kind === "object" && isDeviceType(resolved.target.type)
      ? resolved.target
      : null;
  } catch {
    // The target's entry reports why it resolves to nothing.
    return null;
  }
}

/**
 * Look up each target's preset, once per name and device kind.
 * @param devices - Each target's device, or null
 * @param presets - Each target's preset, or undefined
 * @param deadline - The request deadline
 * @returns Each target's browser item, or undefined where it gets none
 */
async function findPresets(
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
 * @returns What its entry should say, and the new device's id when Live
 *   replaced it
 */
async function loadOnto(
  device: LiveAPI,
  item: BrowserItem,
  deadline: number | null | undefined,
): Promise<{ outcome: PresetOutcome; id?: string }> {
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
    ...(swapped.replaced ? { id: swapped.device.id } : {}),
  };
}
