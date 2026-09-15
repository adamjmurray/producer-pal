// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Turns a segment that names a device by type (`inst`, `mfx0`, `afx1`) into the
// `d<n>` it resolves to, so everything that walks a device path only ever sees
// positions. Live keeps a container's devices sorted MIDI effects → instrument
// → audio effects, so this is a filter over that order.
//
// Runs on every device path, so the no-type-segment case must read nothing.
// See dev/Object-Paths.md.

import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  DEVICE_TYPE_FORMS,
  type DeviceTypeForm,
} from "#src/tools/shared/validation/helpers/object-path-device-tail.ts";
import { trackSegmentPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  formatDeviceSegment,
  formatObjectPath,
  liveApiCollection,
  type CanonicalDeviceSegment,
  type DeviceSegment,
  type DeviceTypeName,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";
import { resolveDrumPadFromPath } from "./device-drumpad-navigation.ts";
import { liveApiAtDevicePath } from "./with-device-path-cache.ts";

/** The Live API `type` value each device-type segment filters on. */
const LIVE_API_DEVICE_TYPE: Record<DeviceTypeName, number> = {
  instrument: LIVE_API_DEVICE_TYPE_INSTRUMENT,
  "midi-effect": LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  "audio-effect": LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
};

/** A type-addressed segment, and what it would have to name. */
type DeviceTypeSegment = Extract<DeviceSegment, { kind: "device-by-type" }>;

/** Why a type-addressed segment named nothing, and what to put in its place. */
interface NoSuchDevice {
  reason: string;
  /** A device index nothing occupies, so the whole path resolves to nothing. */
  fallback: number;
}

export interface DeviceTypeResolution {
  /** The segments, with every type-addressed one replaced by its position. */
  segments: CanonicalDeviceSegment[];
  /** What the container does hold, when a segment named no device — the path
   * now resolves to nothing, and this is what its miss should say. Absent when
   * every segment resolved. */
  namesNothing?: string;
}

/**
 * Replaces every type-addressed device segment with the position it names.
 * Substitutes an unoccupied index when there is no such device, so the path
 * resolves to nothing like any other path that names nothing — and hands back
 * why, for the caller to report on the target it belongs to.
 * @param root - The path's track root
 * @param segments - The device-chain segments below the root, as parsed
 * @returns The segments by position, and why one of them named nothing
 */
export function resolveDeviceTypeSegments(
  root: TrackSegment,
  segments: DeviceSegment[],
): DeviceTypeResolution {
  if (segments.every(isCanonical)) {
    return { segments };
  }

  const canonical: CanonicalDeviceSegment[] = [];
  const spelled: DeviceSegment[] = [];
  let namesNothing: string | undefined;

  for (const segment of segments) {
    if (isCanonical(segment)) {
      canonical.push(segment);
    } else if (namesNothing == null) {
      const found = pickDevice(
        root,
        canonical,
        segment,
        spelling(root, spelled),
      );

      if (typeof found !== "number") {
        namesNothing = found.reason;
      }

      canonical.push({ kind: "device", index: indexOf(found) });
    } else {
      // The path already names nothing, so the rest only has to stay canonical.
      canonical.push({ kind: "device", index: 0 });
    }

    spelled.push(segment);
  }

  return {
    segments: canonical,
    ...(namesNothing == null ? {} : { namesNothing }),
  };
}

// --- Helpers below main exports ---

/**
 * Whether a segment already names its target by position.
 * @param segment - A parsed device-chain segment
 * @returns True for everything but a type-addressed device
 */
function isCanonical(
  segment: DeviceSegment,
): segment is CanonicalDeviceSegment {
  return segment.kind !== "device-by-type";
}

/**
 * The device index a pick landed on, or the unoccupied one standing in for it.
 * @param found - The index, or why there was no such device
 * @returns The index to substitute
 */
function indexOf(found: number | NoSuchDevice): number {
  return typeof found === "number" ? found : found.fallback;
}

/**
 * The device a type-addressed segment names, within the container above it.
 * @param root - The path's track root
 * @param prefix - The canonical segments above this one
 * @param segment - The type-addressed segment
 * @param where - How the caller spelled the container, for the reason
 * @returns The device's index in the container's full device list, or why none
 */
function pickDevice(
  root: TrackSegment,
  prefix: CanonicalDeviceSegment[],
  segment: DeviceTypeSegment,
  where: string,
): number | NoSuchDevice {
  const container = containerAt(root, prefix);

  if (container == null || !container.exists()) {
    return { reason: `${where} does not exist`, fallback: 0 };
  }

  if (
    prefix.length === 0 &&
    root.kind !== "track" &&
    segment.deviceType !== "audio-effect"
  ) {
    return {
      reason: "return and main tracks hold only audio effects",
      fallback: container.getChildCount("devices"),
    };
  }

  const wanted = LIVE_API_DEVICE_TYPE[segment.deviceType];
  const devices = container.getChildren("devices");
  const matching = devices.flatMap((device, index) =>
    device.getProperty("type") === wanted ? [index] : [],
  );
  const found = matching[segment.index];

  return (
    found ?? {
      reason: `${where} ${countOf(DEVICE_TYPE_FORMS[segment.deviceType], matching.length)}`,
      fallback: devices.length,
    }
  );
}

/**
 * What the container holds of the type asked for, so the caller can see why
 * the index missed.
 * @param form - The device type's spellings and nouns
 * @param count - How many of that type the container holds
 * @returns A sentence fragment, e.g. "has 1 audio effect (afx0)"
 */
function countOf(form: DeviceTypeForm, count: number): string {
  if (count === 0) {
    return `has no ${form.indexed ? form.plural : form.noun}`;
  }

  const range =
    count === 1
      ? `${form.segment}0`
      : `${form.segment}0-${form.segment}${count - 1}`;

  return `has ${count} ${count === 1 ? form.noun : form.plural} (${range})`;
}

/**
 * The container a canonical prefix names. Built by string where Live's path
 * says it all, and through the rack where a drum pad makes it note-indexed.
 * @param root - The path's track root
 * @param prefix - The canonical segments above the container's contents
 * @returns The container, or null when the path names none
 */
function containerAt(
  root: TrackSegment,
  prefix: CanonicalDeviceSegment[],
): LiveAPI | null {
  let liveApiPath = trackSegmentPath(root).toString();

  for (const [index, segment] of prefix.entries()) {
    if (segment.kind === "drum-pad") {
      return resolveDrumPadFromPath(
        liveApiPath,
        segment.note,
        prefix.slice(index + 1).map(formatDeviceSegment),
      ).target;
    }

    liveApiPath += ` ${liveApiCollection(segment)} ${segment.index}`;
  }

  return liveApiAtDevicePath(liveApiPath);
}

/**
 * How the caller spelled a prefix of their own path.
 * @param root - The path's track root
 * @param segments - The segments to spell, as parsed
 * @returns The path string, e.g. "t0/d0/pC1"
 */
function spelling(root: TrackSegment, segments: DeviceSegment[]): string {
  return formatObjectPath({ kind: "device", root, segments });
}
