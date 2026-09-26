// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Creating one device per path, where not every path wants the same device.
// Native inserts run together under one path cache; a browser load has to be
// awaited, so a call holding one runs `writeFanOut`'s rules by hand.

import { errorMessage } from "#src/shared/error-message.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { withDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import {
  type NamedTarget,
  type TargetSkip,
  skipEntry,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type WriteResult,
  writeFanOut,
} from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { type RequestTiming, createBrowserDevice } from "./browser-devices.ts";
import {
  type CreateDeviceResult,
  insertNativeDevice,
  labelCreatedDevice,
} from "./device-creation.ts";
import { validateInsertionOrder } from "./device-insertion-order.ts";
import { type BrowserItem } from "./remote-script-contract.ts";

/** What one path creates, and where that device comes from. */
export interface DevicePlan {
  path: string;
  /** The device as the call named it */
  device: string;
  /** The item to load from Live's browser, or null for a native insert */
  item: BrowserItem | null;
}

interface CreateDevicesArgs {
  plans: DevicePlan[];
  /** The call's name arg */
  name: string | undefined;
  params: ParamEntry[] | undefined;
  /** The request's time limits, which browser loads stay inside */
  timing?: RequestTiming;
}

/** The call's display names and params, which every path shares. */
interface DeviceLabels {
  name: string | undefined;
  parsedNames: ListEntries | null;
  params: ParamEntry[] | undefined;
}

/**
 * Create every path's device, refusing a path list spelled through its own
 * inserts before any of them runs.
 * @param args - The per-path plans and the args every path shares
 * @param args.plans - One plan per path, in the order the call named them
 * @param args.name - The call's name arg
 * @param args.params - {name, value} entries applied to each created device
 * @param args.timing - The request's time limits, which browser loads stay inside
 * @returns The device when one path was named, otherwise one entry per path
 */
export async function createDevicesAtPaths({
  plans,
  name,
  params,
  timing = {},
}: CreateDevicesArgs): Promise<WriteResult<CreateDeviceResult>> {
  // Every path in the batch climbs the same prefix — sixteen `t0/d0/c<n>`
  // paths share track 0 and the rack. Resolve each one once for the whole call,
  // so the order check reads the same objects the inserts go on to use. The
  // cache can't span an await, so browser loads resolve their paths uncached.
  if (plans.every((plan) => plan.item == null)) {
    return withDevicePathCache(() =>
      insertDevices(plans, {
        name,
        parsedNames: checkedNames(plans, name),
        params,
      }),
    );
  }

  const parsedNames = withDevicePathCache(() => checkedNames(plans, name));

  return await loadDevices(plans, { name, parsedNames, params }, timing);
}

// --- Helpers below main exports ---

// Refuse a path list spelled through its own inserts, then pair its names.
function checkedNames(
  plans: DevicePlan[],
  name: string | undefined,
): ListEntries | null {
  validateInsertionOrder(plans);

  return pairLabels({ noun: "device", count: plans.length, name }).parsedNames;
}

// Insert every path's device, none of which has to be awaited.
function insertDevices(
  plans: DevicePlan[],
  labels: DeviceLabels,
): WriteResult<CreateDeviceResult> {
  const targets = plans.map(({ path }): NamedTarget => ({
    param: "path",
    value: path,
  }));

  return writeFanOut(targets, (_target, index) => {
    const plan = plans[index] as DevicePlan;

    return labeled(insertNativeDevice(plan.device, plan.path), index, labels);
  });
}

// The same, where at least one device loads from the browser and is awaited.
async function loadDevices(
  plans: DevicePlan[],
  labels: DeviceLabels,
  timing: RequestTiming,
): Promise<WriteResult<CreateDeviceResult>> {
  // A lone path throws, as a native insert does: nothing was created, so there
  // is no list for an entry to hold a place in. A blank `path` was already
  // refused, so there is always at least one plan.
  if (plans.length < 2) {
    return await createOne(plans[0] as DevicePlan, 0, labels, timing);
  }

  const entries: Array<CreateDeviceResult | TargetSkip> = [];

  for (const [index, plan] of plans.entries()) {
    try {
      entries.push(await createOne(plan, index, labels, timing));
    } catch (error) {
      entries.push(
        skipEntry({ param: "path", value: plan.path }, errorMessage(error)),
      );
    }
  }

  return entries;
}

// One path's device, whichever way it arrives.
async function createOne(
  plan: DevicePlan,
  index: number,
  labels: DeviceLabels,
  timing: RequestTiming,
): Promise<CreateDeviceResult> {
  const created =
    plan.item == null
      ? insertNativeDevice(plan.device, plan.path)
      : await createBrowserDevice(plan.item, plan.device, plan.path, timing);

  return labeled(created, index, labels);
}

// Apply the call's name for this path, and its params, to a created device.
function labeled(
  { device, entry }: { device: LiveAPI; entry: CreateDeviceResult },
  index: number,
  labels: DeviceLabels,
): CreateDeviceResult {
  return labelCreatedDevice(
    device,
    entry,
    getNameForIndex(labels.name, index, labels.parsedNames),
    labels.params,
  );
}
