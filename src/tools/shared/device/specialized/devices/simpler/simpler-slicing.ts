// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Simpler's slicing, which lives on its `sample` child. Live remembers each
// style's own setting whatever style is in use, so every setting reads and
// writes in any style. Slice positions are seconds into the sample file.
// See dev/live-api/specialized-devices/instruments/simpler.md.

import { DEVICE_CLASS } from "#src/tools/constants.ts";
import { isSingleSampleSimpler } from "#src/tools/shared/device/simpler-sample.ts";
import { coerceInt } from "../../specialized-param-access.ts";
import {
  type ActionDef,
  type ActionOutcome,
  type PseudoParam,
} from "../../specialized-device-types.ts";

const SLICE_STYLES = ["transient", "beat", "region", "manual"] as const;

const MANUAL_STYLE = SLICE_STYLES.indexOf("manual");

// In Live's index order.
const SLICE_DIVISIONS = [
  "1/16",
  "1/16T",
  "1/8",
  "1/8T",
  "1/4",
  "1/4T",
  "1/2",
  "1/2T",
  "1 bar",
  "2 bars",
  "4 bars",
] as const;

const MIN_REGIONS = 2;

/** The most slices Simpler keeps, in every style. */
const MAX_SLICES = 64;

const NO_SAMPLE = "needs a single sample loaded";

/** The action that turns a sliced Simpler into a Drum Rack. */
export const SLICE_TO_DRUM_RACK = "sliceToDrumRack";

/**
 * What the action's entry holds until ppal-update-device has converted the
 * Simpler through the remote script, which it does once the rest of the
 * target's update is done. Never part of a result.
 */
export const DRUM_RACK_PENDING = "converting";

// Simpler's `playback_mode` when it plays slices. In any other mode the sample
// has no slices: `slices` reads empty and an inserted slice is dropped.
const SLICING_MODE = 2;

const NOT_SLICING =
  "the Simpler isn't in slicing mode: set playbackMode to slicing";

/**
 * Simpler's slicing pseudo-params: how the sample is sliced, and where the
 * slices fall.
 * @returns The params, for the Simpler spec
 */
export function simplerSlicingParams(): PseudoParam[] {
  return [
    {
      name: "sliceBy",
      options: SLICE_STYLES,
      read: (device) => readIndexed(device, "slicing_style", SLICE_STYLES),
      write: (device, value) =>
        writeIndexed(device, "slicing_style", value, SLICE_STYLES, "sliceBy"),
    },
    {
      name: "sliceSensitivity",
      options: "0-1",
      read: (device) => sampleOf(device)?.getProperty("slicing_sensitivity"),
      write: writeSensitivity,
    },
    {
      name: "sliceDivision",
      options: SLICE_DIVISIONS,
      read: (device) =>
        readIndexed(device, "slicing_beat_division", SLICE_DIVISIONS),
      write: (device, value) =>
        writeIndexed(
          device,
          "slicing_beat_division",
          value,
          SLICE_DIVISIONS,
          "sliceDivision",
        ),
    },
    {
      name: "sliceRegions",
      options: `${MIN_REGIONS}-${MAX_SLICES}`,
      read: (device) => sampleOf(device)?.getProperty("slicing_region_count"),
      write: writeRegions,
    },
    { name: "slices", read: readSlices },
  ];
}

/**
 * Simpler's slice actions.
 * @returns The actions, for the Simpler spec
 */
export function simplerSlicingActions(): Record<string, ActionDef> {
  return {
    setSlices: {
      handler: setSlices,
      signature: "setSlices(seconds, ...)",
      description:
        "Slice by hand: switch sliceBy to manual and put a slice at each position, replacing the others. A slice always starts at 0",
    },
    resetSlices: {
      handler: resetSlices,
      signature: "resetSlices",
      description: "Bring back the slices sliceBy makes on its own",
    },
    [SLICE_TO_DRUM_RACK]: {
      handler: (device) =>
        isSlicing(device) ? { detail: DRUM_RACK_PENDING } : NOT_SLICING,
      signature: SLICE_TO_DRUM_RACK,
      description:
        "Replace the Simpler with a Drum Rack, one pad per slice from C1 up, after the rest of the call. The rack is a new device with a new id. Needs slicing mode and the remote script",
    },
  };
}

// --- Helpers below main exports ---

/**
 * Whether a Simpler is in slicing mode, the only mode its sample has slices in.
 * @param device - The Simpler
 * @returns True in slicing mode
 */
function isSlicing(device: LiveAPI): boolean {
  return device.getProperty("playback_mode") === SLICING_MODE;
}

/**
 * A Simpler's loaded sample.
 * @param device - The Simpler
 * @returns The sample; undefined when none is loaded or it holds several
 */
function sampleOf(device: LiveAPI): LiveAPI | undefined {
  return isSingleSampleSimpler(device, DEVICE_CLASS.SIMPLER)
    ? device.getChildren("sample")[0]
    : undefined;
}

/**
 * Read an int-indexed sample property as its label.
 * @param device - The Simpler
 * @param property - The sample's property
 * @param labels - Labels in Live's index order
 * @returns The label, or undefined with no sample
 */
function readIndexed(
  device: LiveAPI,
  property: string,
  labels: readonly string[],
): string | undefined {
  const sample = sampleOf(device);

  return sample && labels[sample.getProperty(property) as number];
}

/**
 * Write a label to an int-indexed sample property. Live ignores an index out
 * of range without a word, so an unknown label is refused here.
 * @param device - The Simpler
 * @param property - The sample's property
 * @param value - The label asked for
 * @param labels - Labels in Live's index order
 * @param name - The param's name, for the reason
 * @returns Why it was refused, or null when written
 */
function writeIndexed(
  device: LiveAPI,
  property: string,
  value: string | number,
  labels: readonly string[],
  name: string,
): string | null {
  const sample = sampleOf(device);

  if (!sample) {
    return NO_SAMPLE;
  }

  const wanted = String(value).trim().toLowerCase();
  const index = labels.findIndex((label) => label.toLowerCase() === wanted);

  if (index < 0) {
    return `"${value}" is not a valid ${name}. Options: ${labels.join(", ")}`;
  }

  sample.set(property, index);

  return null;
}

/**
 * Write the transient sensitivity. Live clamps a value outside 0-1 silently.
 * @param device - The Simpler
 * @param value - The value asked for
 * @returns Why it was refused, or null when written
 */
function writeSensitivity(
  device: LiveAPI,
  value: string | number,
): string | null {
  const sample = sampleOf(device);
  const amount = Number(value);

  if (!sample) {
    return NO_SAMPLE;
  }

  if (String(value).trim() === "" || !(amount >= 0 && amount <= 1)) {
    return `sliceSensitivity must be a number 0-1 (got "${value}")`;
  }

  sample.set("slicing_sensitivity", amount);

  return null;
}

/**
 * Write the region count. Live ignores a count out of range silently.
 * @param device - The Simpler
 * @param value - The value asked for
 * @returns Why it was refused, or null when written
 */
function writeRegions(device: LiveAPI, value: string | number): string | null {
  const sample = sampleOf(device);
  const count = coerceInt(value);

  if (!sample) {
    return NO_SAMPLE;
  }

  if (count == null || count < MIN_REGIONS || count > MAX_SLICES) {
    return `sliceRegions must be an integer ${MIN_REGIONS}-${MAX_SLICES} (got "${value}")`;
  }

  sample.set("slicing_region_count", count);

  return null;
}

/**
 * Where each slice starts, in seconds into the sample file.
 * @param device - The Simpler
 * @returns The slice starts; undefined with no sample or outside slicing mode
 */
function readSlices(device: LiveAPI): number[] | undefined {
  const sample = sampleOf(device);

  if (!sample || !isSlicing(device)) {
    return undefined;
  }

  const rate = sample.getProperty("sample_rate") as number;
  const frames = sample.getPropertyList("slices") as number[];

  return frames.map((frame) => Math.round((frame / rate) * 10000) / 10000);
}

/**
 * Replace the slices with ones at the given positions.
 * @param device - The Simpler
 * @param args - Slice starts in seconds
 * @returns Why nothing was done, or null when the slices were set
 */
function setSlices(
  device: LiveAPI,
  args: Array<string | number>,
): ActionOutcome {
  const sample = sampleOf(device);

  if (!sample) {
    return NO_SAMPLE;
  }

  if (!isSlicing(device)) {
    return NOT_SLICING;
  }

  const rate = sample.getProperty("sample_rate") as number;
  const length = sample.getProperty("length") as number;
  const seconds = args.map(Number);
  const bad = seconds.findIndex(
    (at) => !(at >= 0) || Math.round(at * rate) >= length,
  );

  if (seconds.length === 0) {
    return "requires at least one position in seconds";
  }

  if (bad >= 0) {
    const end = Math.floor((length / rate) * 10000) / 10000;

    return `"${args[bad]}" is not a position inside the sample (0 to ${end} seconds)`;
  }

  // Live always keeps a slice at 0.
  const frames = new Set([0, ...seconds.map((at) => Math.round(at * rate))]);

  if (frames.size > MAX_SLICES) {
    return `Simpler holds at most ${MAX_SLICES} slices (got ${frames.size}, counting the one at 0)`;
  }

  sample.set("slicing_style", MANUAL_STYLE);
  sample.call("clear_slices");

  for (const frame of frames) {
    if (frame > 0) {
      sample.call("insert_slice", frame);
    }
  }

  return null;
}

/**
 * Bring back the slices the current style makes.
 * @param device - The Simpler
 * @returns Why nothing was done, or null when the slices were reset
 */
function resetSlices(device: LiveAPI): ActionOutcome {
  const sample = sampleOf(device);

  if (!sample) {
    return NO_SAMPLE;
  }

  if (!isSlicing(device)) {
    return NOT_SLICING;
  }

  sample.call("reset_slices");

  return null;
}
