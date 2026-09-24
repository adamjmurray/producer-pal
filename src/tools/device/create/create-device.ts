// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type BrowserItem } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { validateParamEntries } from "#src/tools/device/update/helpers/params/param-entry-validation.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { splitList } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { type WriteResult } from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { resolveBrowserDevice } from "./helpers/browser-devices.ts";
import {
  type DevicePlan,
  createDevicesAtPaths,
} from "./helpers/create-devices-at-paths.ts";
import { type CreateDeviceResult } from "./helpers/device-creation.ts";

interface CreateDeviceArgs {
  device?: string;
  /** Deprecated spelling of `device`. */
  deviceName?: string;
  path?: string;
  name?: string;
  params?: ParamEntry[];
  focus?: boolean;
}

/**
 * Refuse a list-mode call that also carries create-only args.
 *
 * Without a device the call lists the catalog and creates nothing, so a path
 * or params sent alongside it are dropped — and the catalog comes back looking
 * like the call worked. The args say a create was meant, so answer the create
 * that can't run rather than the list that wasn't asked for.
 * @param args - The create-only args, none of which list mode can act on
 */
function validateListModeArgs(args: {
  path?: string;
  name?: string;
  params?: ParamEntry[];
}): void {
  const sent = (["path", "name", "params"] as const).filter(
    (key) => args[key] != null,
  );

  if (sent.length > 0) {
    const verb = sent.length === 1 ? "requires" : "require";
    const pronoun = sent.length === 1 ? "it" : "them";

    throw new Error(
      `${sent.join(", ")} ${verb} device; omit ${pronoun} to list available devices`,
    );
  }
}

/**
 * Creates a Live device on a track or chain, or lists the native devices. A
 * device that isn't native is looked up in Live's browser (plug-ins, Max for
 * Live devices) when the Producer Pal remote script is running.
 * @param args - The device parameters
 * @param args.device - Device for all, or comma-separated one per path, in
 *   order; omit to list available devices
 * @param args.deviceName - Deprecated spelling of `device`
 * @param args.path - Device path(s), comma-separated for multiple (required when device provided)
 * @param args.name - Name for all, or comma-separated for each
 * @param args.params - {name, value} entries applied to each created device (e.g. Simpler: {name:"sample", value:"<file path>"})
 * @param args.focus - Select the device and show device detail view
 * @param context - Internal context object, for the request deadline
 * @returns Device list, or object(s) naming each created device
 */
export async function createDevice(
  {
    device,
    deviceName: deprecatedDeviceName,
    path,
    name,
    params,
    focus,
  }: CreateDeviceArgs = {},
  context: Partial<ToolContext> = {},
): Promise<typeof VALID_DEVICES | WriteResult<CreateDeviceResult>> {
  const deviceArg = device ?? deprecatedDeviceName;
  const { deadline } = context;

  // List mode: return valid devices when no device is named
  if (deviceArg == null) {
    validateListModeArgs({ path, name, params });

    return VALID_DEVICES;
  }

  if (path == null || path.trim() === "") {
    // A name Live doesn't have is the mistake to report first, as it always
    // was; with no path there is nothing to pair a list against.
    await findBrowserItem(deviceArg, deadline);

    throw new Error("path is required when creating a device");
  }

  const paramEntries = validateParamEntries(params);

  validateListLengths([
    { param: "path", value: path, target: true },
    { param: "device", value: deviceArg },
    { param: "name", value: name },
  ]);

  const plans = await devicePlans(
    deviceArg,
    targetEntries(path, "path"),
    deadline,
  );
  const result = await createDevicesAtPaths({
    plans,
    name,
    params: paramEntries,
    deadline,
  });

  if (focus) {
    // Focus follows the call, not a target, so it lands on the last device the
    // call actually created — a skip has no device to select.
    const lastCreated = createdEntries(result).at(-1);

    if (lastCreated != null) {
      focusSelect({ id: lastCreated.id, detailView: "device" });
    }
  }

  return result;
}

// What each path creates: its device, and the browser item to load when that
// device isn't native. A name is looked up once however many paths want it.
async function devicePlans(
  value: string,
  paths: string[],
  deadline: number | null | undefined,
): Promise<DevicePlan[]> {
  // The lists agreed before anything ran, so a split names one device per path.
  const devices =
    splitList(value, paths.length, "device") ?? paths.map(() => value);
  const found = new Map<string, BrowserItem | null>();
  const plans: DevicePlan[] = [];

  for (const [index, path] of paths.entries()) {
    const deviceName = devices[index] as string;
    let item = found.get(deviceName);

    if (item === undefined) {
      item = await findBrowserItem(deviceName, deadline);
      found.set(deviceName, item);
    }

    plans.push({ path, device: deviceName, item });
  }

  return plans;
}

/**
 * The devices a call created, dropping the targets it skipped.
 * @param result - What the fan-out returned
 * @returns The created devices, in the order the call named them
 */
function createdEntries(
  result: WriteResult<CreateDeviceResult>,
): CreateDeviceResult[] {
  const entries = Array.isArray(result) ? result : [result];

  return entries.filter(
    (entry): entry is CreateDeviceResult => !("ok" in entry),
  );
}

/**
 * Look up a device that isn't native in Live's browser.
 * @param deviceName - Device name
 * @param deadline - The request deadline
 * @returns The browser item, or null for a native device
 * @throws Error listing the native devices when the remote script isn't
 *   answering, since without it they are all there is
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

  if (item != null && isProducerPalBrowserItem(item)) {
    throw new Error(
      "cannot create the Producer Pal device: it is already running in this " +
        "Set, and a second copy would break the connection this tool runs on",
    );
  }

  if (item == null) {
    const validList =
      `Instruments: ${VALID_DEVICES.instruments.join(", ")} | ` +
      `MIDI Effects: ${VALID_DEVICES.midiEffects.join(", ")} | ` +
      `Audio Effects: ${VALID_DEVICES.audioEffects.join(", ")}`;

    throw new Error(
      `invalid device "${deviceName}". Valid devices - ${validList}`,
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
