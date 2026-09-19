// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type BrowserItem } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { validateParamEntries } from "#src/tools/device/update/helpers/params/param-entry-validation.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import {
  invalidateDevicePathCache,
  withDevicePathCache,
} from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type WriteResult,
  writeFanOut,
} from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  createBrowserDevices,
  resolveBrowserDevice,
} from "./helpers/browser-devices.ts";
import {
  type CreateDeviceResult,
  createdDeviceEntry,
  insertionPosition,
  insertRefusal,
  insertRefusalCause,
  labelCreatedDevice,
  resolveCreationTarget,
} from "./helpers/device-creation.ts";
import { validateInsertionOrder } from "./helpers/device-insertion-order.ts";

interface CreateDeviceArgs {
  deviceName?: string;
  path?: string;
  name?: string;
  params?: ParamEntry[];
  focus?: boolean;
}

/**
 * Refuse a list-mode call that also carries create-only args.
 *
 * Without deviceName the call lists the catalog and creates nothing, so a path
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
      `${sent.join(", ")} ${verb} deviceName; omit ${pronoun} to list available devices`,
    );
  }
}

/**
 * Creates a Live device on a track or chain, or lists the native devices. A
 * deviceName that isn't native is looked up in Live's browser (plug-ins, Max for
 * Live devices) when the Producer Pal remote script is running.
 * @param args - The device parameters
 * @param args.deviceName - Device name, omit to list available devices
 * @param args.path - Device path(s), comma-separated for multiple (required when deviceName provided)
 * @param args.name - Name for all, or comma-separated for each
 * @param args.params - {name, value} entries applied to each created device (e.g. Simpler: {name:"sample", value:"<file path>"})
 * @param args.focus - Select the device and show device detail view
 * @param _context - Internal context object (unused)
 * @returns Device list, or object(s) naming each created device
 */
export async function createDevice(
  { deviceName, path, name, params, focus }: CreateDeviceArgs = {},
  _context: Partial<ToolContext> = {},
): Promise<typeof VALID_DEVICES | WriteResult<CreateDeviceResult>> {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    validateListModeArgs({ path, name, params });

    return VALID_DEVICES;
  }

  const browserItem = await findBrowserItem(deviceName);

  if (path == null || path.trim() === "") {
    throw new Error("path is required when creating a device");
  }

  const paramEntries = validateParamEntries(params);

  validateListLengths([
    { param: "path", value: path },
    { param: "name", value: name },
  ]);

  const paths = targetEntries(path, "path");
  const targets = paths.map((value): NamedTarget => ({ param: "path", value }));

  // Every path in the batch climbs the same prefix — sixteen `t0/d0/c<n>`
  // paths share track 0 and the rack. Resolve each one once for the whole call,
  // so the order check reads the same objects the inserts go on to use. The
  // cache can't span an await, so browser loads resolve their paths uncached.
  const result =
    browserItem == null
      ? withDevicePathCache(() =>
          createDevicesAtPaths(
            deviceName,
            targets,
            name,
            checkedNames(paths, deviceName, name),
            paramEntries,
          ),
        )
      : await createBrowserDevices({
          item: browserItem,
          deviceName,
          targets,
          name,
          parsedNames: withDevicePathCache(() =>
            checkedNames(paths, deviceName, name),
          ),
          params: paramEntries,
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
 * Look up a deviceName that isn't native in Live's browser.
 * @param deviceName - Device name
 * @returns The browser item, or null for a native device
 * @throws Error listing the native devices when the remote script isn't
 *   answering, since without it they are all there is
 * @throws Error when the item is Producer Pal itself
 */
async function findBrowserItem(
  deviceName: string,
): Promise<BrowserItem | null> {
  if (ALL_VALID_DEVICES.includes(deviceName)) {
    return null;
  }

  const item = await resolveBrowserDevice(deviceName);

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
      `invalid deviceName "${deviceName}". Valid devices - ${validList}`,
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

/**
 * Refuse a path list spelled through its own inserts, then pair its names.
 * @param paths - The path entries, in order
 * @param deviceName - Device name
 * @param name - The call's name arg
 * @returns Comma-separated display names, or null
 */
function checkedNames(
  paths: string[],
  deviceName: string,
  name: string | undefined,
): ListEntries | null {
  validateInsertionOrder(paths, deviceName);

  return pairLabels({ noun: "device", count: paths.length, name }).parsedNames;
}

/**
 * Create a device at every path the call named.
 * @param deviceName - Device name
 * @param targets - One target per path, in the order the call named them
 * @param baseName - Base display name
 * @param parsedNames - Comma-separated display names, or null
 * @param params - {name, value} entries applied to each created device
 * @returns The device when one path was named, otherwise one entry per path
 */
function createDevicesAtPaths(
  deviceName: string,
  targets: NamedTarget[],
  baseName: string | undefined,
  parsedNames: ListEntries | null,
  params: ParamEntry[] | undefined,
): WriteResult<CreateDeviceResult> {
  return writeFanOut(targets, (target, i) => {
    const { device, entry } = createDeviceAtPath(deviceName, target.value);
    const displayName = getNameForIndex(baseName, i, parsedNames);

    return labelCreatedDevice(device, entry, displayName, params);
  });
}

/**
 * Create device at a path (track or chain)
 * @param deviceName - Device name
 * @param path - Device path
 * @returns The device and its result entry
 */
function createDeviceAtPath(
  deviceName: string,
  path: string,
): { device: LiveAPI; entry: CreateDeviceResult } {
  const target = resolveCreationTarget(path);
  const { container } = target;
  const { position, deviceCount } = insertionPosition(target, path, deviceName);

  const result =
    position != null
      ? (container.call("insert_device", deviceName, position) as [
          string,
          string | number,
        ])
      : (container.call("insert_device", deviceName) as [
          string,
          string | number,
        ]);

  // A positioned insert shifts every later device down a slot; an append can
  // too, when Live re-sorts the chain around it.
  if (position != null || appendMovesSiblings(deviceName, deviceCount)) {
    invalidateDevicePathCache();
  }

  const rawId = result[1];
  const id = rawId ? String(rawId) : null;
  const device = id ? LiveAPI.from(`id ${id}`) : null;

  if (!id || !device?.exists()) {
    // Live refuses an insert by giving back no id and no device. The usual
    // cause is a second instrument in a chain that already has one — that's
    // Live, not a bug, and an audio effect on the same chains succeeds — so
    // name it when the container shows it.
    throw new Error(
      insertRefusal(
        deviceName,
        target.position,
        path,
        insertRefusalCause(deviceName, container),
      ),
    );
  }

  return { device, entry: createdDeviceEntry(id, device, target) };
}

/**
 * Whether appending this device can renumber the ones already there.
 *
 * Live keeps a chain sorted by device type, so an instrument lands ahead of the
 * audio effects and a MIDI effect ahead of everything: both push siblings down
 * a slot, and paths cached before the insert stop naming what they named. Only
 * an audio effect is guaranteed to land at the end.
 * @param deviceName - Device being inserted
 * @param deviceCount - Devices in the chain before the insert
 * @returns True when the append can move a sibling
 */
function appendMovesSiblings(deviceName: string, deviceCount: number): boolean {
  return (
    deviceCount > 0 &&
    !(VALID_DEVICES.audioEffects as readonly string[]).includes(deviceName)
  );
}
