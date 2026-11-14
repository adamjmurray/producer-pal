// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type AppliedTarget,
  type MaybePromise,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { createBrowserDevice } from "../browser-devices.ts";
import {
  type CreateDeviceResult,
  type CreatedDevice,
  insertNativeDevice,
} from "../device-creation.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { type CreateChecked, type DevicePlan } from "./check-create-call.ts";
import {
  hostedCall,
  labelPlaced,
  placeCreatedDevice,
  recordPlaced,
} from "./place-created-device.ts";
import { isWrapperItem, waitForWrapper } from "./wait-for-wrapper.ts";
import {
  refuseHostedParams,
  writeHostedParams,
  WRAPPER_SILENT,
} from "#src/tools/device/update/helpers/call/hosted-params.ts";
import { createHostedDevice } from "./write-hosted-device.ts";
import { type CreatePayload } from "./parse-create-call.ts";

/**
 * Stage 4: create one target's device, then name it and set its params. A
 * throw once the device is in the Set keeps its entry, with a detail for what
 * didn't happen. The device comes from a native insert, or from Live's browser,
 * which is awaited.
 * @param _target - The target (its plan is read off `step`)
 * @param step - The call's state for this target
 * @returns The target's entry
 */
export function writeCreatedDevice(
  _target: AppliedTarget<CreatePayload>,
  step: Step<CreateChecked>,
): MaybePromise<CreateDeviceResult> {
  const plan = step.checked.plans[step.index] as DevicePlan;

  if (plan.hosted != null) {
    return createHostedDevice({ ...plan, hosted: plan.hosted }, step);
  }

  if (plan.item == null) {
    return placeCreatedDevice(insertNativeDevice(plan.device, plan.path), step);
  }

  return loadDevice(plan, plan.item, step);
}

// --- Helpers below main export ---

// A device Live loads from its browser: awaited.
async function loadDevice(
  plan: DevicePlan,
  item: NonNullable<DevicePlan["item"]>,
  step: Step<CreateChecked>,
): Promise<CreateDeviceResult> {
  const { deadline, timeoutMs, manageAvailable, smallModelMode } =
    step.call.ctx;
  const { params } = step.checked;

  // A new wrapper isn't up yet, so it takes its params once the temp track is
  // gone, not while that sits in the Set waiting for it.
  if (isWrapperItem(item) && params != null && params.length > 0) {
    const loaded = await createBrowserDevice(item, plan.device, plan.path, {
      deadline,
      timeoutMs,
      manageAvailable,
      smallModelMode,
      onPlaced: (placed) => recordPlaced(placed, step),
    });

    return await finishWrapper(loaded, params, step);
  }

  // Named and given its params as soon as it is moved into place, before the
  // load cleans up its temp track, so the entry already shows what was asked
  // when the cleanup has something to add.
  const created = await createBrowserDevice(item, plan.device, plan.path, {
    deadline,
    timeoutMs,
    manageAvailable,
    smallModelMode,
    onPlaced: (placed) => placeCreatedDevice(placed, step),
  });

  return created.entry;
}

// Give a wrapper its params once it answers. One that never does is refused
// them all: it can't be told from a Max device, and its own Live params are
// not the plug-in's.
async function finishWrapper(
  created: CreatedDevice,
  params: ParamEntry[],
  step: Step<CreateChecked>,
): Promise<CreateDeviceResult> {
  const { device } = created;
  const settled = (await waitForWrapper(device.id, step.call.ctx.deadline))
    ? await writeHostedParams(
        device,
        params,
        step.checked.hostedStall,
        hostedCall(step),
      )
    : refuseHostedParams(params, WRAPPER_SILENT);

  return labelPlaced(created, step, settled);
}
