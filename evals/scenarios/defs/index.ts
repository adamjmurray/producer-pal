// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Export all evaluation scenarios
 *
 * NOTE: This barrel file provides a single import point for all scenarios.
 * While the project generally discourages barrel files, this simplifies
 * scenario registration in load-scenarios.ts.
 */

export { connectToAbleton } from "./connect-to-ableton.ts";
export { createAndEditClip } from "./create-and-edit-clip.ts";
export { duplicate } from "./duplicate.ts";
export { memoryWorkflow } from "./memory-workflow.ts";
export { jambalayaSamplerPlate } from "./jambalaya-sampler-plate.ts";
export { trackAndDeviceWorkflow } from "./track-and-device-workflow.ts";
export { playbackControl } from "./playback-control.ts";
export { setTempoAndTimeSignature } from "./set-tempo-and-time-signature.ts";
export { readAndAnalyzeSet } from "./read-and-analyze-set.ts";
export { analyzeClipContent } from "./analyze-clip-content.ts";
export { inspectTrackDevices } from "./inspect-track-devices.ts";
export { createMultipleTracks } from "./create-multiple-tracks.ts";
export { renameAndColorTrack } from "./rename-and-color-track.ts";
export { deleteTrack } from "./delete-track.ts";
export { sceneManagement } from "./scene-management.ts";
export { fireScene } from "./fire-scene.ts";
export { addAndConfigureDevice } from "./add-and-configure-device.ts";
export { loadInstrument } from "./load-instrument.ts";
export { midiMelody } from "./midi-melody.ts";
export { midiChordProgression } from "./midi-chord-progression.ts";
export { midiBassline } from "./midi-bassline.ts";
