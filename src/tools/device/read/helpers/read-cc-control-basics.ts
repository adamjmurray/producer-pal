// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A CC Control's name and on/off state. Max's Live API can't read either, so a
// read leaves them out; only the Producer Pal remote script can say.

import { DEVICE_TYPE } from "#src/tools/constants.ts";
import { lookUpDeviceBasics } from "#src/tools/shared/remote-script/device-basics/device-basics.ts";
import { isStalled } from "#src/tools/shared/remote-script/device-batch-route.ts";
import { READ_DETAIL_MAX_WAIT_MS } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { findInReadResult } from "./find-in-read-result.ts";

/** How a read types a CC Control (Max reports its class name). */
const CC_CONTROL_TYPE = `${DEVICE_TYPE.MIDI_EFFECT}: CC Control`;
const CC_CONTROL_NAME = "CC Control";

/** A CC Control in a read result. */
interface ReadCcControl extends Record<string, unknown> {
  id: string;
  type: string;
}

/**
 * Give each CC Control a read found its name, when the user renamed it, and
 * `deactivated`, when it is off, in one remote-script call for all of them. A
 * CC Control stays as the read left it (no name, no on/off) when the remote
 * script isn't running, can't answer, or can't read it: this is extra detail,
 * never a reason to fail the read.
 * @param results - What the read produced: devices, or skips
 * @param deadline - The request deadline from ToolContext, if any
 * @returns Whether the remote script stalled (no time, or no reply), so the
 *   next thing asked of it would stall too
 */
export async function addCcControlBasics(
  results: unknown[],
  deadline: number | null | undefined,
): Promise<boolean> {
  const controls = findInReadResult(results, isReadCcControl);

  if (controls.length === 0) {
    return false;
  }

  const answers = await lookUpDeviceBasics(
    controls.map((control) => LiveAPI.from(`id ${control.id}`)),
    deadline,
    READ_DETAIL_MAX_WAIT_MS,
  );

  for (const [i, control] of controls.entries()) {
    const answer = answers?.[i];

    if (answer != null && "name" in answer) {
      reportBasics(control, answer.name, answer.active);
    }
  }

  return answers?.some(isStalled) ?? false;
}

// --- Helpers below main exports ---

/**
 * Add the name and `deactivated` to a read CC Control, right after its type.
 * @param control - The read's CC Control, updated in place
 * @param name - Its name in Live
 * @param active - Whether it is on
 */
function reportBasics(
  control: ReadCcControl,
  name: string,
  active: boolean,
): void {
  const entries = Object.entries(control);
  const at = entries.findIndex(([key]) => key === "type") + 1;
  const added: Array<[string, unknown]> = [];

  if (name !== CC_CONTROL_NAME) {
    added.push(["name", name]);
  }

  if (!active) {
    added.push(["deactivated", true]);
  }

  for (const [key] of entries.slice(at)) {
    delete control[key];
  }

  Object.assign(control, Object.fromEntries([...added, ...entries.slice(at)]));
}

/**
 * Whether a read result is a CC Control.
 * @param record - A read result
 * @returns True for a device with an id that reads as a CC Control
 */
function isReadCcControl(record: object): record is ReadCcControl {
  const { id, type } = record as Partial<ReadCcControl>;

  return typeof id === "string" && type === CC_CONTROL_TYPE;
}
