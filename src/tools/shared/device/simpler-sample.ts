// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { DEVICE_CLASS } from "#src/tools/constants.ts";

/**
 * Result of probing a device for its Simpler sample state. Callers
 * branch on `kind` to render the appropriate response shape (a
 * `parameters` entry, a top-level `sample`/`multisample` field, etc.).
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

  if ((device.getProperty("multi_sample_mode") as number) > 0) {
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

  const displayName = device.getProperty("class_display_name") as string;

  if (displayName !== DEVICE_CLASS.SIMPLER) {
    console.warn(
      `${toolName}: 'sample' only applies to Simpler devices (got ${displayName})`,
    );

    return;
  }

  if ((device.getProperty("multi_sample_mode") as number) > 0) {
    console.warn(
      `${toolName}: 'sample' is not supported on Simpler in multi-sample mode`,
    );

    return;
  }

  device.call("replace_sample", trimmed);
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
