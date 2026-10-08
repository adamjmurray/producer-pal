// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { withDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  type ListEntries,
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { REMOTE_SCRIPT_SETUP } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { type WrittenContainer } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type MaybePromise,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { resolveBrowserDevice } from "../browser-devices.ts";
import {
  presetScopeForDevice,
  resolveBrowserPreset,
} from "../browser-presets.ts";
import { validateInsertionOrder } from "../device-insertion-order.ts";
import { type BrowserItem } from "../remote-script-contract.ts";
import { type CreateCall, type CreatePayload } from "./parse-create-call.ts";

/** What one path creates, and where that device comes from. */
export interface DevicePlan {
  path: string;
  /** The device as the call named it */
  device: string;
  /** The item to load from Live's browser, or null for a native insert */
  item: BrowserItem | null;
}

/** A device a target created, to name it again once the call is done. */
export interface PlacedDevice {
  device: LiveAPI;
  written: WrittenContainer;
}

/** A create-device call, checked and ready to write. */
export interface CreateChecked {
  /** One per target, in the order named */
  plans: DevicePlan[];
  /** The call's name arg, and it paired with the targets when it is a list */
  name: string | undefined;
  names: ListEntries | null;
  params: ParamEntry[] | undefined;
  focus: boolean | undefined;
  /** The devices created so far, by id */
  placed: Map<string, PlacedDevice>;
}

/**
 * Stage 3: find what each path creates, refuse a path list spelled through its
 * own inserts, and pair the names, all before anything is made. A device that
 * isn't native is looked up in Live's browser first, so a name that matches
 * nothing, or several things, fails the call with nothing changed.
 * @param call - The create-device call
 * @param targets - The call's targets
 * @param deadline - The request deadline
 * @returns The call, checked; a promise when it names anything to look up
 * @throws Error when the call names no path, or a name isn't a device
 */
export function checkCreateCall(
  call: CreateCall,
  targets: Array<Target<CreatePayload>>,
  deadline: number | null | undefined,
): MaybePromise<CreateChecked> {
  if (call.path == null) {
    return refuseMissingPath(call, deadline);
  }

  const paths = targets.map(({ named }) => named.value);

  const checked = (plans: DevicePlan[]): CreateChecked => {
    // A native call is under the one path cache its inserts use, so the order
    // check reads the same objects. A load can't be: a cache can't span an
    // await.
    const refuse = (): void => validateInsertionOrder(plans);

    if (call.native) {
      refuse();
    } else {
      withDevicePathCache(refuse);
    }

    return {
      plans,
      name: call.name,
      names: pairLabels({
        noun: "device",
        count: plans.length,
        name: call.name,
      }).parsedNames,
      params: call.params,
      focus: call.focus,
      placed: new Map(),
    };
  };

  return call.native
    ? checked(nativePlans(call, paths))
    : devicePlans(call, paths, deadline).then(checked);
}

// --- Helpers below main export ---

/**
 * Refuse a call with no path. A name Live doesn't have is the mistake to
 * report first; with no path there is nothing to pair a list against.
 * @param call - The create-device call
 * @param deadline - The request deadline
 * @returns Never: it always throws
 */
async function refuseMissingPath(
  call: CreateCall,
  deadline: number | null | undefined,
): Promise<never> {
  if (call.device != null && call.preset == null) {
    await findBrowserItem(call.device, deadline);
  }

  throw new Error("path is required when creating a device");
}

// What each path creates when every device is native: nothing to look up.
function nativePlans(call: CreateCall, paths: string[]): DevicePlan[] {
  const devices = perPath(call.device, paths, "device");

  return paths.map((path, i) => ({
    path,
    device: devices[i] as string,
    item: null,
  }));
}

// What each path creates: its device, and the browser item to load when that
// device isn't native or comes from a preset. A name is looked up once however
// many paths want it.
async function devicePlans(
  call: CreateCall,
  paths: string[],
  deadline: number | null | undefined,
): Promise<DevicePlan[]> {
  const devices = perPath(call.device, paths, "device");
  const presets = perPath(call.preset, paths, "preset");
  const found = new Map<string, BrowserItem | null>();
  const plans: DevicePlan[] = [];

  const cached = async (
    key: string,
    look: () => Promise<BrowserItem | null>,
  ): Promise<BrowserItem | null> => {
    if (!found.has(key)) {
      found.set(key, await look());
    }

    return found.get(key) as BrowserItem | null;
  };

  for (const [index, path] of paths.entries()) {
    const deviceName = devices[index];
    const presetName = presets[index];
    const deviceItem =
      deviceName == null
        ? null
        : await cached(deviceName, () => findBrowserItem(deviceName, deadline));

    if (presetName == null) {
      plans.push({ path, device: deviceName as string, item: deviceItem });
      continue;
    }

    const scope =
      deviceName == null
        ? undefined
        : presetScopeForDevice(deviceName, deviceItem);
    const item = await cached(`${deviceName ?? ""}\n${presetName}`, () =>
      resolveBrowserPreset(presetName, scope, deadline),
    );

    plans.push({ path, device: presetName, item });
  }

  return plans;
}

/**
 * One value per path from a list arg. The lists agreed before anything ran, so
 * a split names one per path.
 * @param value - The arg, or undefined when the call didn't send it
 * @param paths - The paths
 * @param param - The arg's name, for errors
 * @returns Each path's value
 */
function perPath(
  value: string | undefined,
  paths: string[],
  param: string,
): Array<string | undefined> {
  const parsed = splitList(value, paths.length, param);

  return paths.map((_path, i) => valueForIndex(value, i, parsed));
}

/**
 * Look up a device that isn't native in Live's browser.
 * @param deviceName - Device name
 * @param deadline - The request deadline
 * @returns The browser item, or null for a native device
 * @throws Error listing the native devices when the remote script isn't
 *   answering or is out of date, since without it they are all there is
 * @throws Error when the item is Producer Pal itself
 */
async function findBrowserItem(
  deviceName: string,
  deadline: number | null | undefined,
): Promise<BrowserItem | null> {
  if (ALL_VALID_DEVICES.includes(deviceName)) {
    return null;
  }

  const item = await resolveBrowserDevice(deviceName, deadline);

  if ("available" in item) {
    const validList =
      `Instruments: ${VALID_DEVICES.instruments.join(", ")} | ` +
      `MIDI Effects: ${VALID_DEVICES.midiEffects.join(", ")} | ` +
      `Audio Effects: ${VALID_DEVICES.audioEffects.join(", ")}`;

    throw new Error(
      `invalid device "${deviceName}". Valid devices - ${validList}. ` +
        (item.outdated == null
          ? "A plug-in or Max for Live device loads only with the Producer " +
            `Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`
          : `A plug-in or Max for Live device can't load: ${item.outdated}`),
    );
  }

  if (isProducerPalBrowserItem(item)) {
    throw new Error(
      "cannot create the Producer Pal device: it is already running in this " +
        "Set, and a second copy would break the connection this tool runs on",
    );
  }

  return item;
}

/**
 * Whether a browser item is the Producer Pal device.
 *
 * The browser reports the name with or without the file extension, and a
 * renamed entry still sits at the .amxd, so check both.
 * @param item - The item the browser lookup resolved
 * @returns True when loading it would add a second Producer Pal
 */
function isProducerPalBrowserItem(item: BrowserItem): boolean {
  const name = item.name.replace(/\.amxd$/i, "").toLowerCase();

  return (
    name === "producer_pal" ||
    item.path.toLowerCase().endsWith("producer_pal.amxd")
  );
}
