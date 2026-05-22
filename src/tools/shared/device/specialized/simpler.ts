// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEVICE_CLASS } from "#src/tools/constants.ts";
import {
  probeSimplerSample,
  setSimplerSample,
} from "#src/tools/shared/device/simpler-sample.ts";
import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Simpler (SimplerDevice, class_name "OriginalSimpler"). AJM-371. See
// dev/plans/Specialized-Device-Classes.md.
//
// Currently wired: the `sample` pseudo-param (load a sample via a file path)
// and the `reverse` action. Still TODO for AJM-371:
//   - params (RW): playbackMode, slicingPlaybackMode, retrigger, voices
//   - params (RO): multiSampleMode, estimatedPlaybackLength (omit when no sample)
//   - actions: crop, warpDouble, warpHalf, warpAs(N)
// The `include: ["sample"]` top-level field (sample/gainDb/multisample) is a
// separate read path in device-reader.ts and is unaffected by this spec.

export const simplerSpec: SpecializedDeviceSpec = {
  displayNames: [DEVICE_CLASS.SIMPLER],
  params: [
    {
      name: "sample",
      read: (device) => {
        const probe = probeSimplerSample(device, DEVICE_CLASS.SIMPLER);

        return probe.kind === "single" ? probe.path : undefined;
      },
      write: (device, value, toolName) =>
        setSimplerSample(device, String(value), toolName),
    },
  ],
  actions: {
    // Destructive: reverses the loaded sample.
    reverse: (device) => device.call("reverse"),
  },
};
