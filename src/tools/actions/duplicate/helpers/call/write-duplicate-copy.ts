// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { validateIdType } from "#src/tools/shared/validation/id-validation.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type AppliedTarget,
  type MaybePromise,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  duplicateArrangementClipToSlot,
  duplicateClipSlot,
} from "../clip/duplicate-clip-slot.ts";
import { duplicateChain } from "../device/duplicate-chain.ts";
import { duplicateDevice } from "../device/duplicate-device.ts";
import {
  duplicateDrumPad,
  resolveSourcePad,
} from "../device/duplicate-drum-pad.ts";
import { runLaneCopy } from "../sources/copy-clip-to-lane.ts";
import {
  duplicateScene,
  duplicateSceneToArrangement,
} from "../sources/duplicate-scene.ts";
import {
  duplicateTrackCopy,
  regularTrackIndex,
} from "../sources/duplicate-track.ts";
import {
  type CopyBody,
  type CopyLabel,
  type CopyPayload,
  type DuplicateCall,
  type DuplicateRun,
} from "./duplicate-call-types.ts";
import {
  liveObject,
  meterOf,
  scenePass,
  slotSourceFor,
} from "./duplicate-run.ts";
import { writeArrangementCopy } from "./write-arrangement-copy.ts";

/**
 * Make one copy.
 * @param run - The call's shared state
 * @param target - The copy
 * @param step - The copy's turn in the call
 * @returns The copy's entry, as a promise only when the copy awaits
 * @throws Error when nothing of the copy landed
 */
export function writeDuplicateCopy(
  run: DuplicateRun,
  target: AppliedTarget<CopyPayload>,
  step: Step<DuplicateCall>,
): MaybePromise<object> {
  const { body, label } = target.data;
  const call = step.checked;

  switch (body.kind) {
    case "track":
      return writeTrack(body.sourceId, label, call, step);
    case "scene":
      return writeScene(body.sourceId, label, call, run);
    case "scene-arrangement":
      return writeSceneArrangement(body, label, call, step, run);
    case "slot":
      return landed(writeSlotCopy(body, label, run), step);
    case "arrangement":
      return writeArrangementCopy(body, label, target.named, step, run);
    case "lane":
      return writeLane(body, step, run);
    default:
      return writeChainCopy(body, label, run);
  }
}

// --- Helpers below main export ---

/**
 * A skip an entry says it is becomes the throw that makes it one, so the
 * pipeline knows nothing landed; anything else landed whatever it covers.
 * @param entry - What a copy worker answered
 * @param step - The copy's turn in the call
 * @returns The entry
 * @throws Error carrying the skip's detail
 */
function landed(entry: object, step: Step<DuplicateCall>): object {
  const skip = entry as { ok?: false; detail?: string };

  if (skip.ok === false) {
    throw new Error(skip.detail);
  }

  step.coverLanded();

  return entry;
}

/**
 * Copy a clip into a clip slot.
 * @param body - The copy
 * @param label - Its name and color
 * @param run - The call's shared state
 * @returns The copy's entry, or the skip saying none landed
 */
function writeSlotCopy(
  body: Extract<CopyBody, { kind: "slot" }>,
  label: CopyLabel,
  run: DuplicateRun,
): object {
  const clip = liveObject(run, body.sourceId);
  const { trackIndex, sceneIndex } = clip;

  // An arrangement clip has no slot to read from, so it is re-created.
  if (trackIndex == null || sceneIndex == null) {
    return duplicateArrangementClipToSlot(
      clip,
      body.slot,
      label.name,
      label.color,
    );
  }

  return duplicateClipSlot(
    trackIndex,
    sceneIndex,
    body.slot.trackIndex,
    body.slot.sceneIndex,
    label.name,
    label.color,
    slotSourceFor(run, clip, body.slot.trackIndex),
  );
}

/**
 * Copy a track from the source itself.
 * @param sourceId - The source track's id
 * @param label - The copy's name and color
 * @param call - The call, as read
 * @param step - The copy's turn in the call
 * @returns The copy's entry
 */
function writeTrack(
  sourceId: string,
  label: CopyLabel,
  call: DuplicateCall,
  step: Step<DuplicateCall>,
): object {
  // Read fresh: a copy made for an earlier source moves this one along.
  const trackIndex = regularTrackIndex(validateIdType(sourceId, "track"));

  return duplicateTrackCopy(
    trackIndex,
    { name: label.name, color: label.color },
    {
      withoutClips: call.withoutClips,
      withoutDevices: call.withoutDevices,
      routeToSource: call.args.routeToSource,
    },
    step.landed,
  );
}

/**
 * Copy a scene in the session. Each copy is made from the last one that
 * landed, which puts the copies in the order named.
 * @param sourceId - The source scene's id
 * @param label - The copy's name and color
 * @param call - The call, as read
 * @param run - The call's shared state
 * @returns The copy's entry
 */
function writeScene(
  sourceId: string,
  label: CopyLabel,
  call: DuplicateCall,
  run: DuplicateRun,
): object {
  const from = validateIdType(run.lastScene.get(sourceId) ?? sourceId, "scene");
  const sceneIndex = from.sceneIndex;

  if (sceneIndex == null) {
    throw new Error(`no scene index for ${targetLabel(from)}`);
  }

  const copy = duplicateScene(
    sceneIndex,
    label.name,
    label.color,
    call.withoutClips,
  );

  run.lastScene.set(sourceId, copy.id);

  return copy;
}

/**
 * Copy a scene's clips onto the arrangement.
 * @param body - The copy
 * @param label - Its name, color and length
 * @param call - The call, as read
 * @param step - The copy's turn in the call
 * @param run - The call's shared state
 * @returns The copy's entry
 */
async function writeSceneArrangement(
  body: Extract<CopyBody, { kind: "scene-arrangement" }>,
  label: CopyLabel,
  call: DuplicateCall,
  step: Step<DuplicateCall>,
  run: DuplicateRun,
): Promise<object> {
  const { numerator, denominator } = meterOf(run);

  return landed(
    await duplicateSceneToArrangement(
      body.sourceId,
      body.startBeats,
      label.name,
      label.color,
      call.withoutClips,
      label.length,
      numerator,
      denominator,
      run.context,
      run.ledger,
      // A scene copied without clips has nothing to read.
      call.withoutClips === true ? undefined : scenePass(run, body.sourceId),
    ),
    step,
  );
}

/**
 * Copy a lane's clips onto a lane, or a main lane.
 * @param body - The copy
 * @param step - The copy's turn in the call
 * @param run - The call's shared state
 * @returns The destination's entry
 */
function writeLane(
  body: Extract<CopyBody, { kind: "lane" }>,
  step: Step<DuplicateCall>,
  run: DuplicateRun,
): object {
  const { numerator, denominator } = meterOf(run);

  return landed(
    runLaneCopy(
      body.entry,
      body.target,
      run.takeLaneName,
      { songTimeSigNumerator: numerator, songTimeSigDenominator: denominator },
      run.ledger,
    ),
    step,
  );
}

/**
 * Copy a device, a rack chain or a drum pad.
 * @param body - The copy
 * @param label - Its name
 * @param run - The call's shared state
 * @returns The copy's entry, as a promise when it awaits the remote script
 */
function writeChainCopy(
  body: Extract<CopyBody, { kind: "device" | "chain" | "pad" }>,
  label: CopyLabel,
  run: DuplicateRun,
): MaybePromise<object> {
  // Read fresh: an earlier copy inserted at or before the source's own index
  // shifts it up, so reusing an object would copy whatever moved into its place.
  if (body.kind === "pad") {
    return duplicateDrumPad(
      resolveSourcePad(validateIdType(body.sourceId, "drum-pad")),
      // Never undefined: a pad with no destination was refused up front.
      body.toPath as string,
      label.name,
    );
  }

  return body.kind === "chain"
    ? duplicateChain(
        validateIdType(body.sourceId, "chain"),
        body.toPath,
        label.name,
      )
    : duplicateDevice(
        validateIdType(body.sourceId, "device"),
        body.toPath,
        label.name,
        run.context.deadline,
      );
}
