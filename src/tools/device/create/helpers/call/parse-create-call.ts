// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { ALL_VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { validateParamEntries } from "#src/tools/device/update/helpers/params/param-entry-validation.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { type ListArg } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { everyEntry } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";

export interface CreateDeviceArgs {
  device?: string;
  /** Deprecated spelling of `device`. */
  deviceName?: string;
  preset?: string;
  path?: string;
  name?: string;
  params?: ParamEntry[];
  focus?: boolean;
}

/** The args as the write pipeline gets them. */
export interface CreateCallArgs extends CreateDeviceArgs {
  /** Whether the call only inserts native devices, so none is awaited */
  native: boolean;
}

/** A create-device call, read once. */
export interface CreateCall {
  device: string | undefined;
  preset: string | undefined;
  /** The path list, or undefined when the call sent none */
  path: string | undefined;
  name: string | undefined;
  params: ParamEntry[] | undefined;
  focus: boolean | undefined;
  native: boolean;
}

/** What one target of a create-device call carries into its write. */
export interface CreatePayload {
  path: string;
}

/**
 * Stage 1: read the call. A blank path has no params to check, since the call
 * is refused for it.
 * @param args - The tool's args
 * @returns The call
 * @throws Error when a params entry has no name or value
 */
export function parseCreateCall(args: CreateCallArgs): CreateCall {
  const { preset, name, focus, native } = args;
  const sent = args.path != null && args.path.trim() !== "";

  return {
    device: args.device ?? args.deviceName,
    preset,
    path: sent ? args.path : undefined,
    name,
    params: sent ? validateParamEntries(args.params) : undefined,
    focus,
    native,
  };
}

/**
 * Stage 2: one target per path. A path that can't be parsed refuses the call:
 * it was written wrong. One that parses but can't be applied (no such track, a
 * scene) skips its own target when it is written. The write parses each path
 * again and warns about a legacy spelling there, so this parse stays quiet.
 * @param call - The create-device call
 * @returns The targets in the order named, none when the call sent no path
 * @throws Error when the list has a hole, or a path can't be parsed
 */
export function createTargets(call: CreateCall): Array<Target<CreatePayload>> {
  if (call.path == null) {
    return [];
  }

  return targetEntries(call.path, "path").map((path): Target<CreatePayload> => {
    parseObjectPath(path, "path", true);

    return { named: { param: "path", value: path }, data: { path } };
  });
}

/**
 * The lists a call has to keep the same length.
 * @param call - The create-device call
 * @returns The lists to compare, none when the call sent no path
 */
export function createListArgs(call: CreateCall): ListArg[] {
  return call.path == null
    ? []
    : [
        { param: "path", value: call.path, target: true },
        { param: "device", value: call.device },
        { param: "preset", value: call.preset },
        { param: "name", value: call.name },
      ];
}

/**
 * Whether a call only inserts native devices: no preset, and every device it
 * names is one Live inserts itself. Such a call has nothing to await, so it
 * runs under one device path cache. A call that can't be read this way is
 * answered `false`; the pipeline refuses it with the proper error.
 * @param args - The tool's args
 * @returns True when nothing in the call has to be loaded from Live's browser
 */
export function namesOnlyNativeDevices(args: CreateDeviceArgs): boolean {
  const device = args.device ?? args.deviceName;
  const { path } = args;

  if (
    args.preset != null ||
    device == null ||
    path == null ||
    path.trim() === ""
  ) {
    return false;
  }

  try {
    const count = targetEntries(path, "path").length;

    return everyEntry(device, count, "device").every((name) =>
      ALL_VALID_DEVICES.includes(name),
    );
  } catch {
    return false;
  }
}
