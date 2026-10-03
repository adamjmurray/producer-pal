// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChainMixerReport } from "./chain/chain-mixer-report.ts";
import { type ParamResult } from "#src/tools/shared/device/helpers/param-reading.ts";
import { type ActionResult } from "#src/tools/shared/device/specialized/specialized-device-types.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { type WrittenContainer } from "#src/tools/shared/validation/object-path-for-api.ts";
import { moveDeviceToPath } from "./move-device.ts";
import { moveDrumChainToPath } from "./move-drum-chain.ts";
import { type PresetOutcome } from "./call/device-presets.ts";
import { writtenContainer } from "./call/resolve-device-target.ts";
import { stripReturnChainLetter } from "./strip-return-chain-letter.ts";
import {
  type UpdateTargetOptions,
  refuseIfNoParamLanded,
  updateDeviceProperties,
  updateNonDeviceProperties,
} from "./update-device-properties.ts";
import {
  type TargetNotes,
  newTargetNotes,
  noteLanded,
  noteTarget,
  refuseTargetWork,
  reportTargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  isDeviceTreeType,
  wrongTargetTypeMessage,
} from "#src/tools/shared/device/device-target-types.ts";
import { isDeviceClass } from "#src/tools/shared/device/is-device-class.ts";

/** One target's result: what it is, plus whatever the call wrote on it. */
interface UpdateTargetResult extends ChainMixerReport {
  id: string;
  path?: string;
  /** The rack chains a toPath had to make first ("c2-c3"), when it made any */
  created?: string;
  params?: ParamResult[];
  actions?: ActionResult[];
}

/** Whether a `toPath` move happened, and what it made getting there. */
interface TargetMove {
  moved?: boolean;
  created?: string;
}

/** A target's entry, and the call's spelling of its container when that
 * spelling is kept. */
export interface TargetUpdate {
  entry: { id: string; path?: string };
  written?: WrittenContainer;
}

/**
 * Update a single target (device, chain, or drum pad)
 * @param target - Live API object to update
 * @param options - Update options
 * @param writtenPath - The path the call named the target by, if it named one
 * @param presetOutcome - What loading its preset did, when the call sent one
 * @param landed - Told what has changed as it does, for a throw to say so
 * @returns Result with ID and any params written, and the container spelling
 *   it was named by
 * @throws Error when this kind of object can't be written to
 */
export function updateDeviceTarget(
  target: LiveAPI,
  options: UpdateTargetOptions,
  writtenPath?: string,
  presetOutcome?: PresetOutcome,
  landed?: (phrase: string) => void,
): TargetUpdate {
  const type = target.type;

  // Validate type is updatable
  if (!isDeviceTreeType(type)) {
    throw new Error(wrongTargetTypeMessage("update", target));
  }

  const notes = newTargetNotes(landed);

  notePresetOutcome(notes, presetOutcome);

  // Handle move operation first (before other updates)
  const moved: TargetMove =
    options.toPath == null
      ? {}
      : moveTargetToPath(target, type, options.toPath, notes);

  // A moved device is named where it landed: the call's toPath spelling can
  // name a chain to make ("c+") rather than the one it made.
  const written = moved.moved ? undefined : writtenContainer(writtenPath);
  const madeChains = moved.created == null ? {} : { created: moved.created };

  // No DrumPad case: a pad is never a lone target — id and path both resolve
  // one to the whole pad, and updateDrumPadGroup writes `name` to its chain,
  // since Live drops writes to `pad.name`.
  if (options.name != null) {
    target.set("name", stripReturnChainLetter(target, options.name));
    noteLanded(notes, "name");
  }

  if (!isDeviceClass(type)) {
    // The chain's own mixer reads back here, so a clamped or snapped level is
    // visible instead of the caller's argument being assumed to have landed.
    const mixer = updateNonDeviceProperties(target, type, options, notes);

    refuseIfNoParamLanded(notes, mixer.params);

    const result = reportTargetNotes(
      {
        id: target.id,
        // Filled in by the call's settle once every target has run.
        path: undefined,
        ...madeChains,
        ...mixer,
      },
      notes,
      options,
    );

    return { entry: result, written };
  }

  const { params, actions } = updateDeviceProperties(
    target,
    type,
    options,
    notes,
  );
  const result: UpdateTargetResult = {
    id: target.id,
    // Filled in by the call's settle once every target has run.
    path: undefined,
    ...madeChains,
  };

  if (params.length > 0) {
    result.params = params;
  }

  if (actions.length > 0) {
    result.actions = actions;
  }

  return { entry: reportTargetNotes(result, notes, options), written };
}

// --- Helpers below main exports ---

/**
 * Say what loading a preset did, when there's anything to say: why it didn't
 * load, or that a new device took the old one's place.
 * @param notes - What the target's entry has to say, added to
 * @param outcome - What loading the preset did, if the call sent one
 */
function notePresetOutcome(
  notes: TargetNotes,
  outcome: PresetOutcome | undefined,
): void {
  if (outcome == null) {
    return;
  }

  if ("error" in outcome) {
    refuseTargetWork(notes, ["preset"], `preset not loaded: ${outcome.error}`);
  } else if (outcome.replaced) {
    noteTarget(
      notes,
      "the preset replaced the device with a new one (new id); any automation on the old device is gone",
    );
  }
}

/**
 * Carry out the `toPath` move a call asked for.
 * @param target - The object being updated
 * @param type - Its Live API type
 * @param toPath - Where the call asked to move it
 * @param notes - What the target's entry has to say, added to
 * @returns Whether it moved, plus any chains the path made
 */
function moveTargetToPath(
  target: LiveAPI,
  type: string,
  toPath: string,
  notes: TargetNotes,
): TargetMove {
  if (isProducerPalDevice(target)) {
    refuseTargetWork(
      notes,
      ["toPath"],
      "the Producer Pal device cannot be moved",
    );

    return {};
  }

  if (isDeviceClass(type)) {
    return moveDevice(target, toPath, notes);
  }

  if (type === "DrumChain") {
    moveDrumChainToPath([target], toPath, notes);

    return {};
  }

  // Only a chain is left: an updatable target is a device, a chain or a pad,
  // devices and DrumChains are handled above, and a pad never reaches here.
  refuseTargetWork(
    notes,
    ["toPath"],
    "a chain cannot be moved; move its devices instead",
  );

  return {};
}

/**
 * Move a device, noting why when it didn't move.
 * @param device - The device being moved
 * @param toPath - Where the call asked to move it
 * @param notes - What the device's entry has to say, added to
 * @returns Whether it moved, plus any chains the path made on the way
 */
function moveDevice(
  device: LiveAPI,
  toPath: string,
  notes: TargetNotes,
): TargetMove {
  const { outcome, reason, created } = moveDeviceToPath(
    device,
    toPath,
    device,
    toPath,
    notes,
  );

  // The move is skipped either way, and the rest of this update — and of the
  // batch — carries on.
  if (outcome === "unresolvable") {
    refuseTargetWork(notes, ["toPath"], `not moved: ${reason}`);
  } else if (outcome === "no-destination") {
    refuseTargetWork(
      notes,
      ["toPath"],
      `not moved: nothing at toPath "${toPath}"`,
    );
  } else if (outcome === "refused") {
    const explained = reason == null ? "" : `: ${reason}`;

    refuseTargetWork(notes, ["toPath"], `not moved to "${toPath}"${explained}`);
  } else {
    noteLanded(notes, "move");
  }

  return {
    moved: outcome === "moved",
    ...(created == null ? {} : { created }),
  };
}
