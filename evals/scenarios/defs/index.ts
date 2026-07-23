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
export {
  arpeggioBracketIdiom,
  arpeggioMixedDurations,
} from "./clip/notation/arpeggio-bracket-idiom.ts";
export { audioSampleWorkflow } from "./clip/audio-sample-workflow.ts";
export {
  barBeatAbsoluteDurationUniformity,
  barBeatCompoundFeelPulse,
  barBeatMeterFill,
  barBeatTriplets,
} from "./clip/notation/bar-beat/bar-beat-absolute-durations.ts";
export {
  barBeatPerBarChord,
  barBeatPerBarNote,
} from "./clip/notation/bar-beat/bar-beat-multibar-spread.ts";
export {
  barBeatMelodicCompoundStepping,
  barBeatMelodicLegatoRun,
  barBeatMelodicStepping,
} from "./clip/notation/bar-beat/bar-beat-pitch-streams.ts";
export {
  barBeatGallop,
  barBeatVelocityAccent,
  barBeatZipStreams,
} from "./clip/notation/bar-beat/bar-beat-value-streams.ts";
export { drumTransforms } from "./clip/drum-transforms.ts";
export {
  contextFollowGlobal,
  contextFollowProject,
  contextMemoryNoSpuriousRecall,
  contextMemoryRecall,
} from "./context/context-follow.ts";
export {
  contextMemoryDelete,
  contextMemoryUpdateNotDuplicate,
} from "./context/context-memory-hygiene.ts";
export {
  contextOnboardingNoImport,
  contextOnboardingOffer,
  contextOnboardingRecordsDecline,
  contextOnboardingStaysQuiet,
} from "./context/context-onboarding.ts";
export {
  contextWriteLayerGlobal,
  contextWriteLayerMemory,
  contextWriteLayerProject,
} from "./context/context-write-layers.ts";
export {
  contextWritePreservesGlobal,
  contextWritePreservesProject,
} from "./context/context-write-preserve.ts";
export { connectToAbleton } from "./workflow/connect-to-ableton.ts";
export { deviceDrumKit } from "./workflow/device-drum-kit.ts";
export { deviceSoundDesign } from "./workflow/device-sound-design.ts";
export { createAndEditClip } from "./clip/create-and-edit-clip.ts";
export { duplicate, duplicateLoop } from "./clip/duplicate.ts";
export {
  durationArgBarLength,
  durationArgMixedCombiner,
  durationArgSubBar,
} from "./clip/notation/duration-arg-grammar.ts";
export { durationReachForQuarter } from "./clip/notation/duration-reach-for-quarter.ts";
export {
  noteOpsMerge,
  noteOpsRatchetRoll,
  noteOpsRepeat,
  noteOpsSplit,
  noteOpsSplitSync,
} from "./clip/note-ops-roll-and-merge.ts";
export { legatoTransforms } from "./clip/legato-transforms.ts";
export { melodyTransforms } from "./clip/melody-transforms.ts";
export {
  rangeClearFirstHalf,
  rangeClearWholeBar,
} from "./clip/notation/range-bound-clears.ts";
export {
  pretransformsHatFillsBaseline,
  pretransformsMelodyReplaceBaseline,
  pretransformsSnareSwapBaseline,
} from "./clip/notation/pretransforms-baseline.ts";
export {
  slmPretransformsDrumRemap,
  slmPretransformsRegionClear,
} from "./clip/notation/pretransforms-slm.ts";
export {
  drumBackbeatMatrix,
  melodyPitchMatrix,
  rhythmGridMatrix,
} from "./clip/notation/notation-matrix-scenarios.ts";
export { surgicalNoteDurationEdit } from "./clip/notation/surgical-note-duration-edit.ts";
export { swingAndQuantize } from "./clip/swing-and-quantize.ts";
export { whereTransforms } from "./clip/where-transforms.ts";
export { syncedLfoMeterInvariance } from "./clip/notation/synced-lfo-meter-invariance.ts";
export { projectContextWorkflow } from "./workflow/project-context-workflow.ts";
export { negativeCases } from "./workflow/negative-cases.ts";
export { sceneAndPlayback } from "./workflow/scene-and-playback.ts";
export { trackAndDeviceWorkflow } from "./workflow/track-and-device-workflow.ts";
export { updateLiveSet } from "./workflow/update-live-set.ts";
