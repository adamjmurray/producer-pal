// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type SettledParams } from "#src/tools/device/update/helpers/call/simpler-pitch-bend.ts";
import { writeHostedParams } from "#src/tools/device/update/helpers/call/hosted-params.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import {
  type MaybePromise,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type CreateDeviceResult,
  type CreatedDevice,
  labelCreatedDevice,
} from "../device-creation.ts";
import { type CreateChecked } from "./check-create-call.ts";

/**
 * Record that a device is in the Set, then name it and set its params. A
 * Producer Pal wrapper (found by asking the device, not by the name the call
 * used) takes its params as update-device does: they go to the plug-in, or are
 * all refused when none is loaded. That write is async, so the result is too.
 * @param created - The device a path put in place
 * @param step - The call's state for this target
 * @returns The target's entry; a promise only for a wrapper with params
 */
export function placeCreatedDevice(
  created: CreatedDevice,
  step: Step<CreateChecked>,
): MaybePromise<CreateDeviceResult> {
  recordPlaced(created, step);

  // Written ahead of the sync param write, like update-device's.
  const settled = writeHostedParams(
    created.device,
    step.checked.params,
    step.checked.hostedStall,
    hostedCall(step),
  );

  return settled == null
    ? labelPlaced(created, step)
    : settled.then((done) => labelPlaced(created, step, done));
}

/**
 * Record that a device is in the Set, so a later throw keeps its entry.
 * @param created - The device a path put in place
 * @param created.device - The device
 * @param created.entry - Its result entry
 * @param created.written - How the call spelled its container
 * @param step - The call's state for this target
 */
export function recordPlaced(
  { device, entry, written }: CreatedDevice,
  step: Step<CreateChecked>,
): void {
  step.checked.placed.set(entry.id, { device, written });
  step.landed("device created", { ...entry });
}

/**
 * Name a placed device and give it its params.
 * @param created - The device a path put in place
 * @param created.device - The device
 * @param created.entry - Its result entry
 * @param step - The call's state for this target
 * @param settled - Params already written by the caller, by entry
 * @returns The entry
 */
export function labelPlaced(
  { device, entry }: CreatedDevice,
  step: Step<CreateChecked>,
  settled?: SettledParams,
): CreateDeviceResult {
  const { name, names, params } = step.checked;
  const labeled = labelCreatedDevice(
    device,
    entry,
    getNameForIndex(name, step.index, names),
    params,
    (phrase) => step.landed(phrase),
    settled,
  );

  if (labeled.params != null) {
    step.landed("params", { params: labeled.params });
  }

  return labeled;
}

/**
 * What a hosted write needs from the call.
 * @param step - The call's state for this target
 * @returns The request deadline, and how to tell of a write that may have landed
 */
export function hostedCall(step: Step<CreateChecked>): {
  deadline: number | null | undefined;
  landed: (phrase: string) => void;
} {
  return {
    deadline: step.call.ctx.deadline,
    landed: (phrase) => step.landed(phrase),
  };
}
