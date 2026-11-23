// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import {
  automationOverriddenDetail,
  overridesAutomation,
} from "#src/tools/shared/arrangement/tracks/automation-override.ts";
import {
  type UnresolvedParam,
  type WrittenPseudoParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import {
  applySpecializedParamWrite,
  getSpecForDevice,
} from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { objectIsGone } from "#src/tools/shared/write-pipeline/object-is-gone.ts";
import {
  type TargetNotes,
  noteLanded,
  noteTarget,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";

/** A DeviceParameter whose state means a rack macro owns it. */
const MAPPED_TO_MACRO = 2;

/** How far apart two values can be, relative to their size, and still match. */
const VALUE_TOLERANCE = 1e-5;

/** Settings that route to other tracks, left as they are on the target. */
const NOT_COPIED = new Set(["sidechainSourceTrackId", "sidechainChannel"]);

/** What a copy changed, and what it left alone. */
export interface CopiedParams {
  /** How many params took a new value */
  params: number;
  /** The settings (pseudo-params) that took a new value */
  settings?: string[];
  /** What was left alone, each with its reason */
  skipped?: string[];
}

/** A source param and the target param it pairs with. */
interface ParamPair {
  name: string;
  source: LiveAPI;
  target: LiveAPI;
}

/**
 * Copy one device's settings onto another of the same type: its named
 * settings first (they can change which params apply), then its params. The
 * target keeps anything the two devices don't share.
 * @param target - The device to copy onto
 * @param sourceId - Id of the device to copy from, read when the call began
 * @param notes - What the target's entry has to say, added to
 * @returns What changed, or undefined when the copy was refused
 */
export function copyDeviceParams(
  target: LiveAPI,
  sourceId: string,
  notes: TargetNotes,
): CopiedParams | undefined {
  const source = LiveAPI.from(sourceId);
  const refusal = copyRefusal(source, target);

  if (refusal != null) {
    refuseTargetWork(notes, ["copyParamsFrom"], `not copied: ${refusal}`);

    return undefined;
  }

  const skipped: string[] = [];
  const settings = copySettings(source, target, skipped);
  const plain = copyPlainParams(source, target, skipped);

  if (plain.changed > 0 || settings.length > 0) {
    noteLanded(notes, "copyParamsFrom");
  }

  if (plain.overridden.length > 0) {
    noteTarget(
      notes,
      `${automationOverriddenDetail("copyParamsFrom")} (${plain.overridden.join(", ")})`,
    );
  }

  return {
    params: plain.changed,
    ...(settings.length > 0 ? { settings } : {}),
    ...(skipped.length > 0 ? { skipped } : {}),
  };
}

// --- Helpers below main export ---

/**
 * Why a copy can't go ahead, when it can't.
 * @param source - The device to copy from
 * @param target - The device to copy onto
 * @returns The reason, or null when the copy can run
 */
function copyRefusal(source: LiveAPI, target: LiveAPI): string | null {
  if (!source.exists() || objectIsGone(source)) {
    return "the source device is gone";
  }

  if (source.id === target.id) {
    return "this is the source device";
  }

  if (source.getProperty("class_name") !== target.getProperty("class_name")) {
    return `the source is ${deviceType(source)}, not ${deviceType(target)}`;
  }

  return null;
}

/**
 * A device's type in the words the tools use.
 * @param device - The device
 * @returns Its display name, or its class name when it has none
 */
function deviceType(device: LiveAPI): string {
  return String(
    device.getProperty("class_display_name") ??
      device.getProperty("class_name"),
  );
}

/**
 * Copy the settings a specialized device keeps beside its params (`globalMode`,
 * `sample`, ...), through the same write `params` uses. A setting the source
 * can't read is left alone.
 * @param source - The device to copy from
 * @param target - The device to copy onto
 * @param skipped - Settings that did not copy, added to with the reason
 * @returns The settings that took a new value
 */
function copySettings(
  source: LiveAPI,
  target: LiveAPI,
  skipped: string[],
): string[] {
  const changed: string[] = [];

  for (const setting of getSpecForDevice(target)?.params ?? []) {
    if (setting.write == null || NOT_COPIED.has(setting.name)) {
      continue;
    }

    const value = setting.read(source);

    if (
      value == null ||
      JSON.stringify(value) === JSON.stringify(setting.read(target))
    ) {
      continue;
    }

    const [written] = applySpecializedParamWrite(
      target,
      setting.name,
      typeof value === "number" || typeof value === "string"
        ? value
        : JSON.stringify(value),
    ) as [UnresolvedParam | WrittenPseudoParam];
    const reason =
      "ok" in written
        ? written.detail
        : written.writeFailed?.(setting.read(target));

    if (reason == null) {
      changed.push(setting.name);
    } else {
      skipped.push(`${setting.name}: ${reason}`);
    }
  }

  return changed;
}

/**
 * Copy each param's value across, leaving the ones a rack macro owns.
 * @param source - The device to copy from
 * @param target - The device to copy onto
 * @param skipped - Params that did not copy, added to with the reason
 * @returns How many params changed, and which of those overrode automation
 */
function copyPlainParams(
  source: LiveAPI,
  target: LiveAPI,
  skipped: string[],
): { changed: number; overridden: string[] } {
  const { pairs, unmatched } = pairParams(
    source.getChildren("parameters"),
    target.getChildren("parameters"),
  );
  const overridden: string[] = [];
  let changed = 0;

  for (const pair of pairs) {
    const value = pair.source.getProperty("value");

    if (pair.target.getProperty("state") === MAPPED_TO_MACRO) {
      skipped.push(`${pair.name}: mapped to a macro`);
    } else if (!sameValue(value, pair.target.getProperty("value"))) {
      try {
        if (
          overridesAutomation(pair.target, () =>
            pair.target.set("value", value),
          )
        ) {
          overridden.push(pair.name);
        }

        changed++;
      } catch (error) {
        skipped.push(`${pair.name}: ${errorMessage(error)}`);
      }
    }
  }

  if (unmatched > 0) {
    skipped.push(`${unmatched} params not on both devices`);
  }

  return { changed, overridden };
}

/**
 * Whether two param values are the same as far as a copy can tell. Max passes
 * a value with about six significant digits, so a copied value reads back a
 * hair off the source's.
 * @param source - The source param's value
 * @param target - The target param's value
 * @returns True when a write would change nothing
 */
function sameValue(source: unknown, target: unknown): boolean {
  if (typeof source !== "number" || typeof target !== "number") {
    return source === target;
  }

  const scale = Math.max(1, Math.abs(source), Math.abs(target));

  return Math.abs(source - target) <= VALUE_TOLERANCE * scale;
}

/**
 * Pair the params of two devices: by position when both list the same names,
 * otherwise by name, for the names each device lists once.
 * @param source - The source device's params
 * @param target - The target device's params
 * @returns The pairs, and how many params found no partner
 */
function pairParams(
  source: LiveAPI[],
  target: LiveAPI[],
): { pairs: ParamPair[]; unmatched: number } {
  const sourceNames = source.map((param) => param.getName());
  const targetNames = target.map((param) => param.getName());
  const sameNames =
    sourceNames.length === targetNames.length &&
    sourceNames.every((name, index) => name === targetNames[index]);

  if (sameNames) {
    return {
      pairs: source.map((param, index) => ({
        name: sourceNames[index] as string,
        source: param,
        target: target[index] as LiveAPI,
      })),
      unmatched: 0,
    };
  }

  const pairs = sourceNames.flatMap((name, index): ParamPair[] => {
    const at = targetNames.indexOf(name);
    const once =
      sourceNames.indexOf(name) === sourceNames.lastIndexOf(name) &&
      at !== -1 &&
      at === targetNames.lastIndexOf(name);

    return once
      ? [
          {
            name,
            source: source[index] as LiveAPI,
            target: target[at] as LiveAPI,
          },
        ]
      : [];
  });

  return {
    pairs,
    unmatched: source.length + target.length - 2 * pairs.length,
  };
}
