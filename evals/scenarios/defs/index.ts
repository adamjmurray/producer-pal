// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Export all evaluation scenarios
 *
 * NOTE: This barrel file provides a single import point for all scenarios.
 * While the project generally discourages barrel files, this simplifies
 * scenario registration in load-scenarios.ts.
 */

export { arrangementClipWorkflow } from "./clip/arrangement-clip-workflow.ts";
export { audioSampleWorkflow } from "./clip/audio-sample-workflow.ts";
export { drumTransforms } from "./clip/drum-transforms.ts";
export { connectToAbleton } from "./workflow/connect-to-ableton.ts";
export { createAndEditClip } from "./clip/create-and-edit-clip.ts";
export { duplicate } from "./clip/duplicate.ts";
export { legatoTransforms } from "./clip/legato-transforms.ts";
export { melodyTransforms } from "./clip/melody-transforms.ts";
export { swingAndQuantize } from "./clip/swing-and-quantize.ts";
export { memoryWorkflow } from "./workflow/memory-workflow.ts";
export { negativeCases } from "./workflow/negative-cases.ts";
export { sceneAndPlayback } from "./workflow/scene-and-playback.ts";
export { trackAndDeviceWorkflow } from "./workflow/track-and-device-workflow.ts";
export { updateLiveSet } from "./workflow/update-live-set.ts";
