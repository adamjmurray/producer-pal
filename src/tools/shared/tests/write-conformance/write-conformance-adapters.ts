// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { deleteAdapter } from "./adapters/actions/delete-adapter.ts";
import { duplicateAdapter } from "./adapters/actions/duplicate-adapter.ts";
import { playbackAdapter } from "./adapters/actions/playback-adapter.ts";
import { selectAdapter } from "./adapters/actions/select-adapter.ts";
import { createClipAdapter } from "./adapters/create/create-clip-adapter.ts";
import { createDeviceAdapter } from "./adapters/create/create-device-adapter.ts";
import { createSceneAdapter } from "./adapters/create/create-scene-adapter.ts";
import { createTrackAdapter } from "./adapters/create/create-track-adapter.ts";
import { updateClipAdapter } from "./adapters/update/update-clip-adapter.ts";
import { updateDeviceAdapter } from "./adapters/update/update-device-adapter.ts";
import { updateLiveSetAdapter } from "./adapters/update/update-live-set-adapter.ts";
import { updateSceneAdapter } from "./adapters/update/update-scene-adapter.ts";
import { updateTrackAdapter } from "./adapters/update/update-track-adapter.ts";
import { type WriteToolAdapter } from "./write-conformance-types.ts";

/** Every write tool the suite runs. A meta test holds it to the pipeline's list. */
export const ADAPTERS: WriteToolAdapter[] = [
  updateDeviceAdapter,
  updateClipAdapter,
  duplicateAdapter,
  createDeviceAdapter,
  createClipAdapter,
  deleteAdapter,
  createTrackAdapter,
  createSceneAdapter,
  updateTrackAdapter,
  updateSceneAdapter,
  updateLiveSetAdapter,
  playbackAdapter,
  selectAdapter,
];
