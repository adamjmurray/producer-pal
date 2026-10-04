// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
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
  labelCreatedDevice,
} from "../device-creation.ts";
import { refuseIndexInNewChain } from "../device-insertion-order.ts";
import { type CreateChecked, type DevicePlan } from "./check-create-call.ts";
import { type CreatePayload } from "./parse-create-call.ts";

/**
 * Stage 4: create one target's device, then name it and set its params. A
 * throw once the device is in the Set keeps its entry, with a detail for what
 * didn't happen. The device comes from a native insert, or from Live's browser,
 * which is awaited.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 */
export function writeCreatedDevice(
  target: AppliedTarget<CreatePayload>,
  step: Step<CreateChecked>,
): MaybePromise<CreateDeviceResult> {
  const plan = step.checked.plans[step.index] as DevicePlan;

  // Before the path makes any chains: it would leave them behind when refused.
  refuseIndexInNewChain(target.data.path);

  if (plan.item == null) {
    return place(insertNativeDevice(plan.device, plan.path), step);
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
  const { deadline, timeoutMs } = step.call.ctx;
  // Named and given its params as soon as it is moved into place, before the
  // load cleans up its temp track: a cleanup failure then leaves an entry that
  // already shows what was asked.
  const created = await createBrowserDevice(item, plan.device, plan.path, {
    deadline,
    timeoutMs,
    onPlaced: (placed) => place(placed, step),
  });

  return created.entry;
}

// Record that a device is in the Set, then name it and set its params.
function place(
  { device, entry, written }: CreatedDevice,
  step: Step<CreateChecked>,
): CreateDeviceResult {
  const { name, names, params, placed } = step.checked;

  placed.set(entry.id, { device, written });
  step.landed("device created", { ...entry });

  const labeled = labelCreatedDevice(
    device,
    entry,
    getNameForIndex(name, step.index, names),
    params,
    (phrase) => step.landed(phrase),
  );

  if (labeled.params != null) {
    step.landed("params", { params: labeled.params });
  }

  return labeled;
}
