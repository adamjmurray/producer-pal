// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Export all evaluation scenarios
 *
 * NOTE: This barrel file provides a single import point for all scenarios.
 * While the project generally discourages barrel files, this simplifies
 * scenario registration in load-scenarios.ts.
 */

export {
  automationArrangementDirectLimit,
  automationArrangementViaSession,
} from "./clip/automation/automation-arrangement.ts";
export { automationClearOne } from "./clip/automation/automation-clear-one.ts";
export { automationNoRemoteScript } from "./clip/automation/automation-no-remote-script.ts";
export { automationReadEnvelopes } from "./clip/automation/automation-read.ts";
export { automationWriteCurve } from "./clip/automation/automation-write-curve.ts";
export {
  automationWriteDeviceParam,
  automationWriteMixer,
} from "./clip/automation/automation-write.ts";
export { arrangementClipWorkflow } from "./clip/arrangement-clip-workflow.ts";
export { arpeggioBracketIdiom } from "./clip/notation/arpeggio-bracket-idiom.ts";
export {
  audioConvertDrumRack,
  audioConvertToMidi,
} from "./clip/audio-convert.ts";
export { audioSampleWorkflow } from "./clip/audio-sample-workflow.ts";
export {
  barBeatAbsoluteDurationUniformity,
  barBeatCompoundFeelPulse,
  barBeatMeterFill,
  barBeatTriplets,
} from "./clip/notation/bar-beat/bar-beat-absolute-durations.ts";
export { barBeatPerBarSpread } from "./clip/notation/bar-beat/bar-beat-multibar-spread.ts";
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
export { drumTransforms } from "./clip/transforms/drum-transforms.ts";
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
export { contextWritePreserves } from "./context/context-write-preserve.ts";
export { connectToAbleton } from "./workflow/connect-to-ableton.ts";
export { deleteTargets } from "./workflow/delete-targets.ts";
export {
  libraryDiscoveryActions,
  libraryKindMidi,
  libraryTagDiscovery,
  libraryTypeOneshot,
} from "./workflow/library/library-filters.ts";
export { librarySearchFanout } from "./workflow/library/library-search-fanout.ts";
export { locatorDeleteByName } from "./locators/locator-delete-by-name.ts";
export { locatorLifecycle } from "./locators/locator-lifecycle.ts";
export { locatorNavigation } from "./locators/locator-navigation/locator-navigation.ts";
export { liveApiEscapeHatch } from "./workflow/live-api-escape-hatch.ts";
export { mixerLanguage } from "./workflow/mixer-language.ts";
export { deviceAppendPaths } from "./device/device-append-paths.ts";
export { deviceDrumKit } from "./device/device-drum-kit.ts";
export { deviceMovePairing } from "./device/device-move-pairing.ts";
export { deviceTypePaths } from "./device/device-type-paths.ts";
export { deviceKitByName } from "./device/device-kit-by-name.ts";
export { deviceLibraryPadSamples } from "./device/device-library-pad-samples.ts";
export { drumPadForceGuard } from "./device/drum-pad-force-guard.ts";
export { deviceSoundDesign } from "./device/device-sound-design.ts";
export { createAndEditClip } from "./clip/create-and-edit-clip.ts";
export { duplicate, duplicateLoop } from "./clip/duplicate.ts";
export { mutedNotesHidden } from "./clip/muted-notes-hidden.ts";
export { sceneCopyBackToBack } from "./clip/scene-copy-back-to-back.ts";
export { durationArgGrammar } from "./clip/notation/duration-arg-grammar.ts";
export { durationReachForQuarter } from "./clip/notation/duration-reach-for-quarter.ts";
export {
  noteOpsMerge,
  noteOpsRatchetRoll,
  noteOpsRepeat,
  noteOpsSplit,
} from "./clip/transforms/note-ops-roll-and-merge.ts";
export { legatoTransforms } from "./clip/transforms/legato-transforms.ts";
export { transformRandomBakedOrReplayed } from "./clip/transforms/transform-random-baked-or-replayed.ts";
export { melodyTransforms } from "./clip/transforms/melody-transforms.ts";
export { rangeClearBoundaries } from "./clip/notation/range-bound-clears.ts";
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
  middleCScaleMatrix,
  rhythmGridMatrix,
} from "./clip/notation/notation-matrix-scenarios.ts";
export { surgicalNoteDurationEdit } from "./clip/notation/surgical-note-duration-edit.ts";
export { swingAndQuantize } from "./clip/transforms/swing-and-quantize.ts";
export { velocityShaping } from "./clip/transforms/velocity-shaping.ts";
export { whereTransforms } from "./clip/transforms/where-transforms.ts";
export { syncedLfoMeterInvariance } from "./clip/notation/synced-lfo-meter-invariance.ts";
export { projectContextWorkflow } from "./workflow/project-context-workflow.ts";
export { negativeCases } from "./workflow/negative-cases.ts";
export { pathArrangementAddress } from "./path/arrangement/path-arrangement-address.ts";
export { pathArrangementCovers } from "./path/arrangement/path-arrangement-covers.ts";
export { pathSessionSlot } from "./path/path-session-slot.ts";
export { pathSpokenSceneNumber } from "./path/path-spoken-scene-number.ts";
export { pathTakeLaneFirst } from "./path/path-take-lane.ts";
export { pathToPathClipDestinations } from "./path/path-topath-clips.ts";
export { pathToPathDeviceAndPad } from "./path/path-topath-devices.ts";
export { pathToPathPairing } from "./pairing/topath-pairing.ts";
export {
  arrangementDestinationPairing,
  colorListPairing,
  duplicateDestinationPairing,
} from "./pairing/list-pairing.ts";
export {
  trackListBatching,
  trackNameCommaPairing,
} from "./pairing/track-list-pairing.ts";
export { pathTrackSceneAddress } from "./path/path-track-scene-address.ts";
export { pathUncommonRoots } from "./path/path-uncommon-roots.ts";
export { rackPadOps } from "./device/rack-pad-ops.ts";
export { partialFailureHonesty } from "./result/partial-failure-honesty.ts";
export { writeTrustSilentResult } from "./result/write-result-trust.ts";
export { sceneUpdateAndSelect } from "./workflow/scene-update-and-select.ts";
export { sceneAndPlayback } from "./workflow/scene-and-playback.ts";
export { takeLaneUpdate } from "./workflow/take-lane-update.ts";
export { trackAndDeviceWorkflow } from "./workflow/track-and-device-workflow.ts";
export { updateLiveSet } from "./workflow/update-live-set.ts";
export { pathInsertPosition } from "./path/path-insert-position.ts";
export { pathLocatorCoordinate } from "./path/path-locator-coordinate.ts";
