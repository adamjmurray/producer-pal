// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { withDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type PipelineResult,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type CreateChecked,
  checkCreateCall,
} from "./helpers/call/check-create-call.ts";
import {
  type CreateCall,
  type CreateCallArgs,
  type CreateDeviceArgs,
  type CreatePayload,
  createListArgs,
  createTargets,
  namesOnlyNativeDevices,
  parseCreateCall,
} from "./helpers/call/parse-create-call.ts";
import { settleCreatedDevices } from "./helpers/call/settle-created-devices.ts";
import { writeCreatedDevice } from "./helpers/call/write-created-device.ts";
import { type CreateDeviceResult } from "./helpers/device-creation.ts";

/** What create-device answers: the catalog, or the device(s) it created. */
export type CreateDeviceAnswer =
  | typeof VALID_DEVICES
  | PipelineResult<CreateDeviceResult>;

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
 * device that isn't native (plug-ins, Max for Live devices), and any preset, is
 * loaded from Live's browser when the Producer Pal remote script is running.
 * @param args - The device parameters
 * @param args.device - Device for all, or comma-separated one per path, in
 *   order; omit this and preset to list available devices
 * @param args.deviceName - Deprecated spelling of `device`
 * @param args.preset - Preset for all, or comma-separated one per path: a name
 *   looked up among the device's presets (all presets with no device), or a
 *   file path
 * @param args.path - Device path(s), comma-separated for multiple (required when device provided)
 * @param args.name - Name for all, or comma-separated for each
 * @param args.params - {name, value} entries applied to each created device (e.g. Simpler: {name:"sample", value:"<file path>"})
 * @param args.focus - Select the device and show device detail view
 * @param context - Internal context object, for the request deadline
 * @returns Device list, or object(s) naming each created device
 */
export async function createDevice(
  args: CreateDeviceArgs = {},
  context: Partial<ToolContext> = {},
): Promise<CreateDeviceAnswer> {
  // List mode: return valid devices when no device is named
  if (args.device == null && args.deviceName == null && args.preset == null) {
    validateListModeArgs(args);

    return VALID_DEVICES;
  }

  const call: CreateCallArgs = {
    ...args,
    native: namesOnlyNativeDevices(args),
  };

  // A call with nothing to await shares one path cache across its inserts. A
  // load can't: the cache is torn down before an awaited step would finish.
  return call.native
    ? await withDevicePathCache(() => runWrite(CREATE_WRITE, call, context))
    : await runWrite(CREATE_WRITE, call, context);
}

const CREATE_WRITE: WriteSpec<
  CreateCallArgs,
  CreateCall,
  CreatePayload,
  CreateChecked,
  CreateDeviceResult
> = {
  tool: "ppal-create-device",
  words: { rerun: "path" },
  parse: parseCreateCall,
  lists: createListArgs,
  targets: createTargets,
  check: (call, targets, { ctx }) =>
    checkCreateCall(call, targets, ctx.deadline),
  write: writeCreatedDevice,
  settle: settleCreatedDevices,
};
