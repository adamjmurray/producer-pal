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

// --- Expanded suite (selection/view, deeper device + musical scenarios) ---

// selection / view state
export { selectTrackAndScene } from "./selection/select-track-and-scene.ts";
export { switchToArrangementView } from "./selection/switch-to-arrangement-view.ts";
export { navigateAndPlayScene } from "./selection/navigate-and-play-scene.ts";

// transport
export { loopPlaybackRegion } from "./transport/loop-playback-region.ts";

// track management
export { colorTracksByRole } from "./tracks/color-tracks-by-role.ts";
export { renameTracksConvention } from "./tracks/rename-tracks-convention.ts";
export { armAndConfigureTrack } from "./tracks/arm-and-configure-track.ts";
export { reorderViaDuplicate } from "./tracks/reorder-via-duplicate.ts";

// scene management
export { buildSongSections } from "./scenes/build-song-sections.ts";
export { colorAndNameScenes } from "./scenes/color-and-name-scenes.ts";
export { fillAndPlayScene } from "./scenes/fill-and-play-scene.ts";

// device handling
export { addEqCutLows } from "./devices/add-eq-cut-lows.ts";
export { buildEffectsChain } from "./devices/build-effects-chain.ts";
export { groupIntoAudioRack } from "./devices/group-into-audio-rack.ts";
export { tweakDeviceParameters } from "./devices/tweak-device-parameters.ts";
export { rackWithMacros } from "./devices/rack-with-macros.ts";
export { instrumentPlusEffects } from "./devices/instrument-plus-effects.ts";

// MIDI generation / editing
export { chordProgressionInKey } from "./midi/chord-progression-in-key.ts";
export { melodyOverChords } from "./midi/melody-over-chords.ts";
export { basslineFollowsRoots } from "./midi/bassline-follows-roots.ts";
export { transposeMelodyUpOctave } from "./midi/transpose-melody-up-octave.ts";
export { swingAndHumanizeDrums } from "./midi/swing-and-humanize-drums.ts";
export { thinOutClip } from "./midi/thin-out-clip.ts";

// analysis / complex workflow
export { analyzeAndNameProgression } from "./workflow/analyze-and-name-progression.ts";
export { analyzeSetSuggestAdditions } from "./workflow/analyze-set-suggest-additions.ts";
export { arrangeVerseChorus } from "./workflow/arrange-verse-chorus.ts";
export { extendArrangementSection } from "./workflow/extend-arrangement-section.ts";
export { fullBeatFromScratch } from "./workflow/full-beat-from-scratch.ts";
