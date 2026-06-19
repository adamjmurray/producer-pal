// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Export all evaluation scenarios
 *
 * NOTE: This barrel file provides a single import point for all scenarios.
 * While the project generally discourages barrel files, this simplifies
 * scenario registration in load-scenarios.ts. Scenarios are grouped into
 * subdirectories by area.
 */

// meta
export { connectToAbleton } from "./meta/connect-to-ableton.ts";
export { memoryWorkflow } from "./meta/memory-workflow.ts";

// transport
export { playbackControl } from "./transport/playback-control.ts";
export { setTempoAndTimeSignature } from "./transport/set-tempo-and-time-signature.ts";

// reading / analysis
export { readAndAnalyzeSet } from "./reading/read-and-analyze-set.ts";
export { analyzeClipContent } from "./reading/analyze-clip-content.ts";
export { inspectTrackDevices } from "./reading/inspect-track-devices.ts";

// track management
export { createMultipleTracks } from "./tracks/create-multiple-tracks.ts";
export { renameAndColorTrack } from "./tracks/rename-and-color-track.ts";
export { deleteTrack } from "./tracks/delete-track.ts";
export { duplicate } from "./tracks/duplicate.ts";
export { trackAndDeviceWorkflow } from "./tracks/track-and-device-workflow.ts";

// scene management
export { sceneManagement } from "./scenes/scene-management.ts";
export { fireScene } from "./scenes/fire-scene.ts";

// device handling
export { addAndConfigureDevice } from "./devices/add-and-configure-device.ts";
export { loadInstrument } from "./devices/load-instrument.ts";

// MIDI generation
export { createAndEditClip } from "./midi/create-and-edit-clip.ts";
export { midiMelody } from "./midi/midi-melody.ts";
export { midiChordProgression } from "./midi/midi-chord-progression.ts";
export { midiBassline } from "./midi/midi-bassline.ts";

// complex workflow
export { arrangementWorkflow } from "./workflow/arrangement-workflow.ts";
export { jambalayaSamplerPlate } from "./workflow/jambalaya-sampler-plate.ts";
