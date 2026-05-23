// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { DEVICE_CLASS } from "#src/tools/constants.ts";
import {
  probeSimplerSample,
  setSimplerGain,
  setSimplerSample,
} from "#src/tools/shared/device/simpler-sample.ts";
import { liveGainToDb } from "#src/tools/shared/gain-utils.ts";
import {
  readBoolProp,
  readEnumByIndex,
  writeBoolProp,
  writeEnumByIndex,
  writeIntFromSet,
} from "../specialized-device-param-helpers.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Simpler (SimplerDevice, class_name "OriginalSimpler"). AJM-371. See
// dev/Specialized-Devices.md.
//
// The `sample` and `gainDb` params are tagged `sampleGroup` so the focused
// `include: ["sample"]` read in device-reader.ts can return just those entries
// (the full set still appears for `include: ["params"]`).

const PLAYBACK_MODES = ["classic", "one-shot", "slicing"] as const;

const SLICING_PLAYBACK_MODES = ["mono", "poly", "thru"] as const;

// Discrete voice counts Simpler accepts; in-between values silently revert.
const VOICES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 32] as const;

/**
 * Read the loaded sample's file path (undefined unless a single sample is
 * loaded).
 * @param device - LiveAPI device object
 * @returns The sample file path, or undefined
 */
function readSamplePath(device: LiveAPI): string | undefined {
  const probe = probeSimplerSample(device, DEVICE_CLASS.SIMPLER);

  return probe.kind === "single" ? probe.path : undefined;
}

/**
 * Read the loaded sample's gain in dB (undefined unless a single sample is
 * loaded). Mirrors the linear→dB mapping used everywhere else.
 * @param device - LiveAPI device object
 * @returns Gain in dB, or undefined
 */
function readSimplerGain(device: LiveAPI): number | undefined {
  const probe = probeSimplerSample(device, DEVICE_CLASS.SIMPLER);

  return probe.kind === "single" && probe.gain != null
    ? liveGainToDb(probe.gain)
    : undefined;
}

/**
 * Read the `voices` count (undefined when the device reports a non-number).
 * @param device - LiveAPI device object
 * @returns The voice count, or undefined
 */
function readVoices(device: LiveAPI): number | undefined {
  const value = device.getProperty("voices");

  return typeof value === "number" ? value : undefined;
}

/**
 * Estimate playback length in beats (only when a sample is loaded —
 * guess_playback_length returns garbage otherwise).
 * @param device - LiveAPI device object
 * @returns Estimated playback length in beats, or undefined when no sample
 */
function readEstimatedPlaybackLength(device: LiveAPI): number | undefined {
  if (readSamplePath(device) == null) {
    return undefined;
  }

  return device.call("guess_playback_length") as number;
}

/**
 * Run a no-argument destructive action on the loaded sample.
 * @param method - Live API method name
 * @returns An ActionHandler that calls the method
 */
function sampleAction(method: string) {
  return (device: LiveAPI): void => {
    device.call(method);
  };
}

export const simplerSpec: SpecializedDeviceSpec = {
  displayNames: [DEVICE_CLASS.SIMPLER],
  params: [
    {
      name: "sample",
      sampleGroup: true,
      read: readSamplePath,
      write: (device, value, toolName) =>
        setSimplerSample(device, String(value), toolName),
    },
    {
      name: "gainDb",
      sampleGroup: true,
      read: readSimplerGain,
      write: (device, value, toolName) =>
        setSimplerGain(device, Number(value), toolName),
    },
    {
      name: "playbackMode",
      read: (device) =>
        readEnumByIndex(device, "playback_mode", PLAYBACK_MODES),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "playback_mode",
          value,
          PLAYBACK_MODES,
          toolName,
          "playbackMode",
        ),
    },
    {
      name: "slicingPlaybackMode",
      read: (device) =>
        readEnumByIndex(
          device,
          "slicing_playback_mode",
          SLICING_PLAYBACK_MODES,
        ),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "slicing_playback_mode",
          value,
          SLICING_PLAYBACK_MODES,
          toolName,
          "slicingPlaybackMode",
        ),
    },
    {
      name: "retrigger",
      read: (device) => readBoolProp(device, "retrigger"),
      write: (device, value, toolName) =>
        writeBoolProp(device, "retrigger", value, toolName, "retrigger"),
    },
    {
      name: "voices",
      read: readVoices,
      write: (device, value, toolName) =>
        writeIntFromSet(device, "voices", value, VOICES, toolName, "voices"),
    },
    // Read-only state.
    {
      name: "multiSampleMode",
      read: (device) => readBoolProp(device, "multi_sample_mode"),
    },
    {
      name: "estimatedPlaybackLength",
      read: readEstimatedPlaybackLength,
    },
  ],
  actions: {
    // Destructive sample edits. Warp/crop operate on the active region
    // (S Start .. S Start + S Length), not the whole sample.
    reverse: sampleAction("reverse"),
    crop: sampleAction("crop"),
    warpDouble: sampleAction("warp_double"),
    warpHalf: sampleAction("warp_half"),
    warpAs: (device, args, toolName) => {
      const beats = Number(args[0]);

      if (!Number.isFinite(beats)) {
        console.warn(`${toolName}: warpAs requires a numeric beats argument`);

        return;
      }

      device.call("warp_as", beats);
    },
  },
};
