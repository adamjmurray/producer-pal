// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { type BrowserItem } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  type NamedTarget,
  namedTargets,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { blankTargetIgnores } from "#src/tools/shared/validation/lists/target-lists.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { refuseUnparsableEntries } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type AppliedTarget,
  type Call,
  type Done,
  type MaybePromise,
  type PipelineResult,
  type Step,
  type Target,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type DeviceChecked,
  type DevicePayload,
  checkDeviceUpdate,
  deviceListArgs,
} from "./helpers/call/check-device-update.ts";
import {
  type PresetOutcome,
  loadPreset,
  presetDevice,
} from "./helpers/call/device-presets.ts";
import {
  type DeviceCall,
  parseDeviceCall,
} from "./helpers/call/parse-device-call.ts";
import {
  type ResolvedTarget,
  resolveNamedTarget,
  resolvedTargetKey,
  targetIsGone,
  writtenContainer,
} from "./helpers/call/resolve-device-target.ts";
import {
  type SettledParams,
  writePitchBendParams,
} from "./helpers/call/simpler-pitch-bend.ts";
import { type UpdateTargetOptions } from "./helpers/update-device-properties.ts";
import { updateDeviceTarget } from "./helpers/update-device-target.ts";
import { updateDrumPadGroup } from "./helpers/update-drum-pad-group.ts";
import { wrapDevicesInRack } from "./helpers/wrap/wrap-devices-in-rack.ts";

export interface UpdateDeviceArgs extends UpdateTargetOptions {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  wrapInRack?: boolean;
  focus?: boolean;
}

/** What a refused preset left of the device it was loaded onto. */
const CHANGED_BY_PRESET =
  "the device was replaced and removed; its slot is empty";

/** One target's entry. */
type DeviceEntry = Record<string, unknown>;

/** What update-device answers: a lone entry, or one entry per target. */
export type UpdateDeviceResult = PipelineResult<DeviceEntry>;

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path, without a preset
 * or a macro count: sync, except that a Simpler's `pitchBendRange` or
 * `notePitchBendRange` in `params` goes through the remote script and answers
 * as a promise, whatever this signature says.
 * @param args - The update-device args: the target (id/path), what to set on
 *   it, and `wrapInRack` or `focus`
 * @param ctx - Internal context object, for the request deadline
 * @returns Updated object info(s)
 */
export function updateDevice(
  args: UpdateDeviceArgs & { preset?: undefined; macroCount?: undefined },
  ctx?: Partial<ToolContext>,
): UpdateDeviceResult;
/**
 * Update device(s), chain(s), or drum pad(s) by ID or path. A `preset` loads
 * through the remote script, a `macroCount` may ask it which macros are
 * mapped, and a Simpler's pitch bend `params` are written through it, so the
 * answer comes as a promise.
 * @param args - The update-device args: the target (id/path), what to set on
 *   it, and `wrapInRack`, `preset` or `focus`
 * @param ctx - Internal context object, for the request deadline
 * @returns Updated object info(s)
 */
export function updateDevice(
  args: UpdateDeviceArgs,
  ctx?: Partial<ToolContext>,
): MaybePromise<UpdateDeviceResult>;

/**
 * Update device(s), chain(s), or drum pad(s) by ID or path.
 * @param args - The update-device args
 * @param ctx - Internal context object, for the request deadline
 * @returns Updated object info(s)
 */
export function updateDevice(
  args: UpdateDeviceArgs,
  ctx: Partial<ToolContext> = {},
): MaybePromise<UpdateDeviceResult> {
  return runWrite(DEVICE_WRITE, args, ctx);
}

const DEVICE_WRITE: WriteSpec<
  UpdateDeviceArgs,
  DeviceCall,
  DevicePayload,
  DeviceChecked,
  DeviceEntry
> = {
  tool: "ppal-update-device",
  words: { rerun: "target" },
  parse: (args) => parseDeviceCall(args),
  lists: deviceListArgs,
  targets: deviceTargets,
  check: (call, targets, { ctx }) =>
    checkDeviceUpdate(call, targets, ctx.deadline),
  write: writeDevice,
  settle: settleDeviceUpdate,
};

// --- Helpers below main export ---

/**
 * Name the call's targets and resolve each now, before the first write: a move
 * re-indexes what it leaves, so a later path would name whatever slid into the
 * slot.
 * @param call - The update-device call
 * @returns The targets in the order named
 * @throws Error when a list has a hole, or a path can't be parsed
 */
function deviceTargets(call: DeviceCall): Array<Target<DevicePayload>> {
  const named = namedTargets({ id: call.ids, path: call.path });

  // A path that doesn't parse is a mistake in the call, so it refuses the
  // call, wrapping or not; one that parses but names nothing skips only its
  // own target.
  refuseUnparsableEntries(call.path, "path");

  // One rack from every device named, so one target.
  if (call.wrapInRack === true) {
    const { ids, path, toPath } = call;

    return [
      {
        named: named[0] as Target<DevicePayload>["named"],
        data: { wrap: { ids, path, toPath, name: call.options.name } },
      },
    ];
  }

  return named.map((target): Target<DevicePayload> => {
    try {
      const resolved = resolveNamedTarget(target);

      return {
        named: target,
        key: resolvedTargetKey(resolved),
        data: { resolved, before: pathBefore(call, resolved, target) },
      };
    } catch (error) {
      return { named: target, skip: errorMessage(error) };
    }
  });
}

/**
 * Where a target is before the first write, for the entry of one that a later
 * target deletes. Only a forced pad sample swap deletes a named target, and
 * naming a drum chain costs a rack scan, so other calls skip the read.
 * @param call - The update-device call
 * @param resolved - The resolved target
 * @param named - The target as the call named it, for the spelling to keep
 * @returns Its path now, in the call's spelling, when the call can delete it
 */
function pathBefore(
  call: DeviceCall,
  resolved: ResolvedTarget,
  named: NamedTarget,
): string | undefined {
  return call.options.force === true && resolved.kind === "object"
    ? pathField(
        resolved.target,
        writtenContainer(named.param === "path" ? named.value : undefined),
      ).path
    : undefined;
}

/**
 * What to apply to one target: the call's options, with the name, color,
 * destination and other strings that pair per target taken at its position.
 * @param checked - The checked call
 * @param index - The target's position
 * @returns The target's options
 */
function optionsForTarget(
  checked: DeviceChecked,
  index: number,
): UpdateTargetOptions {
  const { options, lists } = checked;

  return {
    ...options,
    name: getNameForIndex(options.name, index, lists.names),
    color: getColorForIndex(options.color, index, lists.colors),
    toPath: lists.destinations[index],
    mappedMacros: checked.macros[index],
    ...lists.valuesAt(index),
  };
}

/**
 * Write one target: a wrap, or its own update after any preset it loads.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 */
function writeDevice(
  target: AppliedTarget<DevicePayload>,
  step: Step<DeviceChecked>,
): MaybePromise<DeviceEntry> {
  const { data, named } = target;

  if ("wrap" in data) {
    return { ...wrapDevicesInRack(data.wrap) };
  }

  // A target resolved up front can die before its turn: an earlier target's
  // preset replaced the rack it sits in, or a forced pad sample swap deleted it.
  if (targetIsGone(data.resolved)) {
    throw new Error(
      "no longer exists: an earlier target in this call replaced it or its rack",
    );
  }

  const options = optionsForTarget(step.checked, step.index);
  const writtenPath = named.param === "path" ? named.value : undefined;
  const item = step.checked.presets[step.index];
  const device = presetDevice(data.resolved);

  return item == null || device == null
    ? updateResolved(data.resolved, options, writtenPath, step)
    : loadThenUpdate(
        { device, item },
        data.resolved,
        options,
        writtenPath,
        step,
      );
}

/**
 * Load a target's preset, then run the rest of its update on the device that's
 * there afterwards.
 * @param preset - The device and the preset to load onto it
 * @param preset.device - The device
 * @param preset.item - The preset
 * @param resolved - The target
 * @param options - What to apply to the target
 * @param writtenPath - The path the call named the target by, if it did
 * @param step - The call's state for this target
 * @returns The target's entry
 */
async function loadThenUpdate(
  preset: { device: LiveAPI; item: BrowserItem },
  resolved: ResolvedTarget,
  options: UpdateTargetOptions,
  writtenPath: string | undefined,
  step: Step<DeviceChecked>,
): Promise<DeviceEntry> {
  const { device, item } = preset;
  // Read now: the device may be gone afterwards, and its id means nothing then.
  const where = pathField(device, writtenContainer(writtenPath));
  const loaded = await loadPreset(device, item, step.call.ctx.deadline);

  // Live changed the device before refusing, so it isn't the one the call
  // named. Throw after landing, so the entry keeps what changed.
  if ("error" in loaded.outcome && loaded.outcome.changed === true) {
    step.landed(CHANGED_BY_PRESET, where);
    throw new Error(`preset not loaded: ${loaded.outcome.error}`);
  }

  if (!("error" in loaded.outcome)) {
    step.landed("preset", { id: (loaded.device ?? device).id });
  }

  // A new device has a new id, and the target is that device from here on. What
  // was read of the old one's macros says nothing about it.
  const current: ResolvedTarget =
    loaded.device == null
      ? resolved
      : { kind: "object", target: loaded.device };

  return await updateResolved(
    current,
    loaded.device == null ? options : { ...options, mappedMacros: undefined },
    writtenPath,
    step,
    loaded.outcome,
  );
}

/**
 * Apply the call's options to a resolved target.
 * @param resolved - The target
 * @param options - What to apply to it
 * @param writtenPath - The path the call named the target by, if it did
 * @param step - The call's state for this target
 * @param presetOutcome - What loading its preset did, when it had one
 * @returns The target's entry, its path still to be filled in
 */
function updateResolved(
  resolved: ResolvedTarget,
  options: UpdateTargetOptions,
  writtenPath: string | undefined,
  step: Step<DeviceChecked>,
  presetOutcome?: PresetOutcome,
): MaybePromise<DeviceEntry> {
  if (resolved.kind === "drum-pad") {
    const id = resolved.group.pad?.id;

    // A virtual pad has no id, so its entry has none to keep if this throws.
    return {
      ...updateDrumPadGroup(
        resolved.group,
        resolved.padPath,
        options,
        (phrase) => step.landed(phrase, id == null ? {} : { id }),
      ),
    };
  }

  const { target } = resolved;
  const landed = (phrase: string): void =>
    step.landed(phrase, { id: target.id });

  const finish = (settled?: SettledParams): DeviceEntry => {
    const update = updateDeviceTarget(
      target,
      options,
      writtenPath,
      presetOutcome,
      landed,
      settled,
    );

    step.checked.written.set(update.entry, update.written);

    return update.entry;
  };

  // A Simpler's pitch bend params go through the remote script, which the sync
  // param write can't wait on, so they are settled first. Sync unless one is sent.
  const pitchBend = writePitchBendParams(
    target,
    options.params,
    step.checked.pitchBend,
    { deadline: step.call.ctx.deadline, landed },
  );

  return pitchBend == null ? finish() : pitchBend.then(finish);
}

/**
 * Once every target has had its turn: name each by where it sits now, say what
 * the call dropped, and focus the last device written.
 * @param done - What the call did
 * @param call - The call's shared state
 */
function settleDeviceUpdate(
  done: Done<DevicePayload, DeviceChecked, DeviceEntry>,
  call: Call,
): void {
  const { checked, entries, outcomes, targets } = done;
  const written: Array<{ id: string }> = [];

  // A later move can push an earlier target along, so name each one once every
  // target has had its turn. A wrap names its own rack.
  for (const [index, entry] of entries.entries()) {
    const data = targets[index]?.data;
    const id = (entry as DeviceEntry).id;

    if (
      outcomes[index] === "written" &&
      data != null &&
      "resolved" in data &&
      typeof id === "string"
    ) {
      renamePath(
        entry as DeviceEntry,
        id,
        checked.written.get(entry),
        data.before,
      );
    }

    if (outcomes[index] === "written" && typeof id === "string") {
      written.push({ id });
    }
  }

  // Said once the writes are done: it claims what the call did.
  for (const { param, why } of blankTargetIgnores(
    checked.sent,
    "targets",
    checked.named,
  )) {
    call.ignored(param, why);
  }

  const last = written.at(-1);

  if (checked.focus === true && last != null) {
    focusSelect({ id: last.id, detailView: "device" });
  }
}

/**
 * Name a target by where it sits now, keeping its entry's key order. One a
 * later target deleted has no address now, so it keeps the one it had.
 * @param entry - The target's entry, updated in place
 * @param id - Its id
 * @param container - The container spelling it was named by, if any
 * @param before - Where it was before the call, if it had a path
 */
function renamePath(
  entry: DeviceEntry,
  id: string,
  container: Parameters<typeof pathField>[1],
  before: string | undefined,
): void {
  const { path } = pathField(LiveAPI.from(id), container);

  if (path != null) {
    entry.path = path;
  } else if (before != null) {
    entry.path = before;
    appendDetail(
      entry,
      "no longer exists: a later target in this call replaced it",
    );
  } else {
    delete entry.path;
  }
}
