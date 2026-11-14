// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A hosted plug-in's device: a Producer Pal wrapper loaded like any browser
// device, then told which plug-in to load. A wrapper that can't be given its
// plug-in is deleted again, so the call never leaves an empty one behind.

import { errorMessage } from "#src/shared/error-message.ts";
import { getDeviceInsertionPoint } from "#src/tools/device/update/helpers/wrap/wrapped-rack.ts";
import { errorWithChainsLeft } from "#src/tools/shared/device/helpers/path/chains-left.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { unreachedDetail } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type Step } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { createBrowserDevice } from "../browser-devices.ts";
import {
  type CreateDeviceResult,
  type CreatedDevice,
} from "../device-creation.ts";
import { loadPluginInto } from "../plugin-host-load.ts";
import { type CreateChecked, type DevicePlan } from "./check-create-call.ts";
import { placeCreatedDevice } from "./place-created-device.ts";

/**
 * Create one hosted plug-in's device: its wrapper, with the plug-in loaded into
 * it, then its name and params. The target only counts as created once the
 * plug-in is loaded.
 * @param plan - What the path creates
 * @param step - The call's state for this target
 * @returns The target's entry
 * @throws Error when the plug-in can't be loaded; the wrapper is deleted again
 */
export async function createHostedDevice(
  plan: DevicePlan & { hosted: NonNullable<DevicePlan["hosted"]> },
  step: Step<CreateChecked>,
): Promise<CreateDeviceResult> {
  const { deadline, timeoutMs, manageAvailable, smallModelMode } =
    step.call.ctx;
  const created = await createBrowserDevice(
    plan.item as NonNullable<DevicePlan["item"]>,
    plan.device,
    plan.path,
    { deadline, timeoutMs, manageAvailable, smallModelMode },
  );
  const left = deadline == null ? undefined : deadline - Date.now();
  const failure =
    left != null && left <= 0
      ? `could not load "${plan.device}": ${unreachedDetail("path")}`
      : await loadPluginInto(created.device.id, plan.hosted, left);

  if (failure != null) {
    throw failedHostedLoad(failure, created, step);
  }

  return await placeCreatedDevice(created, step);
}

// --- Helpers below main export ---

/**
 * Take the wrapper out again, and say what that left. A wrapper that can't be
 * deleted stays in the Set, so the entry keeps its id and path.
 * @param failure - Why the plug-in didn't load
 * @param created - The wrapper that was created
 * @param step - The call's state for this target
 * @returns The error to throw
 */
function failedHostedLoad(
  failure: string,
  created: CreatedDevice,
  step: Step<CreateChecked>,
): Error {
  const { device, entry } = created;
  const stranded = deleteWrapper(device);

  if (stranded != null) {
    step.landed("device created", { ...entry });
  }

  return errorWithChainsLeft(
    new Error(joinDetails([failure, stranded])),
    entry.created,
  );
}

/**
 * @param device - The wrapper
 * @returns What to say when it couldn't be deleted, or undefined when it was
 */
function deleteWrapper(device: LiveAPI): string | undefined {
  try {
    const { container, position } = getDeviceInsertionPoint(device);

    container.call("delete_device", position);

    return undefined;
  } catch (error) {
    return `the empty wrapper device couldn't be deleted: ${errorMessage(error)}`;
  }
}
