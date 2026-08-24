// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { DEVICE_CLASS } from "#src/tools/constants.ts";
import { dbToLiveGain } from "#src/tools/shared/gain-utils.ts";

/**
 * Result of probing a device for its Simpler sample state. Callers branch on
 * `kind` to decide what to surface (the `sample`/`gainDb` pseudo-params, the
 * read-only `multiSampleMode` param, or nothing).
 */
export type SimplerSampleProbe =
  | { kind: "not-simpler" }
  | { kind: "multisample" }
  | { kind: "empty" }
  | { kind: "single"; path: string; gain: number | undefined };

/**
 * Inspect a device's Simpler sample state. Single source of truth for
 * the Simpler + multi_sample_mode + getChildren("sample") + file_path
 * probe — read-side callers should branch on the returned `kind`
 * rather than re-implementing the property reads.
 *
 * @param device - LiveAPI device object
 * @param className - Device's class_display_name (passed in to avoid a
 *   redundant property fetch when the caller already has it)
 * @returns Probe result; `kind: "single"` carries path + gain when
 *   the first child sample exposes a file_path; `kind: "empty"` when
 *   Simpler is in single-sample mode but no sample is loaded.
 */
export function probeSimplerSample(
  device: LiveAPI,
  className: string,
): SimplerSampleProbe {
  if (className !== DEVICE_CLASS.SIMPLER) {
    return { kind: "not-simpler" };
  }

  if (!isSingleSampleSimpler(device, className)) {
    return { kind: "multisample" };
  }

  const samples = device.getChildren("sample");
  const firstSample = samples[0];

  if (!firstSample) {
    return { kind: "empty" };
  }

  const path = firstSample.getProperty("file_path") as string | undefined;

  if (!path) {
    return { kind: "empty" };
  }

  const gain = firstSample.getProperty("gain") as number | undefined;

  return { kind: "single", path, gain };
}

/**
 * Replace the sample on a Simpler device. Warns and skips for non-Simpler
 * devices and for Simpler in multi-sample mode.
 * @param device - LiveAPI device object
 * @param filePath - Absolute file path to load
 * @param toolName - Calling tool name for warning prefix (e.g. "updateDevice")
 */
export function setSimplerSample(
  device: LiveAPI,
  filePath: string,
  toolName: string,
): void {
  const trimmed = filePath.trim();

  if (trimmed.length === 0) {
    console.warn(`${toolName}: 'sample' requires a non-empty file path`);

    return;
  }

  if (!isAbsolutePath(trimmed)) {
    console.warn(
      `${toolName}: 'sample' must be an absolute file path (got "${trimmed}")`,
    );

    return;
  }

  if (!isWritableSimpler(device, "sample", toolName)) {
    return;
  }

  if (!supportsReplaceSample()) {
    console.warn(
      `${toolName}: 'sample' requires Live ${REPLACE_SAMPLE_MIN_VERSION} or later`,
    );

    return;
  }

  device.call("replace_sample", trimmed);
}

/**
 * Set the gain (in dB) of the loaded sample on a Simpler device. Warns and
 * skips for non-Simpler devices, multi-sample mode, no loaded sample, or a
 * non-numeric value. The dB→linear mapping mirrors the read side
 * (`liveGainToDb`).
 * @param device - LiveAPI device object
 * @param dB - Gain in decibels
 * @param toolName - Calling tool name for warning prefix
 */
export function setSimplerGain(
  device: LiveAPI,
  dB: number,
  toolName: string,
): void {
  if (!Number.isFinite(dB)) {
    console.warn(`${toolName}: 'gainDb' must be a number (got "${dB}")`);

    return;
  }

  if (!isWritableSimpler(device, "gainDb", toolName)) {
    return;
  }

  const sample = device.getChildAt("sample", 0);

  if (sample?.getProperty("file_path") == null) {
    console.warn(`${toolName}: 'gainDb' requires a loaded sample`);

    return;
  }

  sample.set("gain", dbToLiveGain(dB));
}

/**
 * Whether a device takes a single-sample write: a Simpler, not in multi-sample
 * mode. Two property reads and no child objects — the cheap check for a caller
 * that only needs yes/no, where probeSimplerSample would build a sample object
 * per device just to say which flavor of yes.
 * @param device - LiveAPI device object
 * @param className - The device's class_display_name (passed in to avoid a
 *   redundant property fetch when the caller already has it)
 * @returns True when the device is a Simpler in single-sample mode
 */
export function isSingleSampleSimpler(
  device: LiveAPI,
  className: string,
): boolean {
  return (
    className === DEVICE_CLASS.SIMPLER &&
    !((device.getProperty("multi_sample_mode") as number) > 0)
  );
}

/** Simpler's `replace_sample` function was added in Live 12.4. */
const REPLACE_SAMPLE_MIN_VERSION = "12.4";

/**
 * Test whether this Live can load a sample into Simpler. Older versions have no
 * `replace_sample` function, and calling a function Live doesn't have returns
 * normally and does nothing — so check the version instead of the return value.
 * @returns True on Live 12.4 and later
 */
function supportsReplaceSample(): boolean {
  const version = String(LiveAPI.from("live_app").call("get_version_string"));

  return !isNewerVersion(version, REPLACE_SAMPLE_MIN_VERSION);
}

/**
 * Guard a Simpler single-sample write. Warns and returns false unless the
 * device is a Simpler in single-sample mode.
 * @param device - LiveAPI device object
 * @param param - Pseudo-param name for warning text (e.g. "sample", "gainDb")
 * @param toolName - Calling tool name for warning prefix
 * @returns True when the device accepts single-sample writes
 */
function isWritableSimpler(
  device: LiveAPI,
  param: string,
  toolName: string,
): boolean {
  const displayName = device.getProperty("class_display_name") as string;

  if (displayName !== DEVICE_CLASS.SIMPLER) {
    console.warn(
      `${toolName}: '${param}' only applies to Simpler devices (got ${displayName})`,
    );

    return false;
  }

  if ((device.getProperty("multi_sample_mode") as number) > 0) {
    console.warn(
      `${toolName}: '${param}' is not supported on Simpler in multi-sample mode`,
    );

    return false;
  }

  return true;
}

/**
 * Test whether a path looks absolute. Accepts POSIX paths (leading `/`)
 * and Windows-style paths with a drive letter (e.g. `C:\` or `C:/`).
 * Used to reject obviously-invalid input before handing it to Live, which
 * silently fails on relative paths.
 *
 * @param p - Path to check
 * @returns True when the path appears absolute
 */
function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p);
}
