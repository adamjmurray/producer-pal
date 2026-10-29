// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What an install-producer-pal call tells the caller. No V8 code in here: the
// portal bundles it.

import { VERSION_CHECK_OR_CONNECT } from "#src/shared/version-check.ts";
import {
  type InstallPart,
  type InstallReply,
  type ManageInstallResult,
} from "./manage-contract.ts";

const INSTALL = "install-producer-pal";
// The device works without the remote script, so this needs no restart.
const DRAG_NOW =
  "The device is in the User Library: the user can drag Producer Pal onto a MIDI track in Live right away, without the restart.";
const ADD = "add-producer-pal";

/**
 * Live only reads Remote Scripts at startup, so the restart comes first: until
 * then a first install isn't in the Control Surface list to choose.
 */
const FINISH_IN_LIVE =
  'restart Live, then, on first install, choose "Producer Pal" as a Control Surface in Settings → Tempo & MIDI, with Input and Output left as None. It takes one free slot and no MIDI, so their other controllers keep working.';

/** Where the call was answered, which decides what is left to do. */
export interface InstallContext {
  /** Whether Producer Pal is running in the Live Set already */
  running: boolean;
}

/**
 * The result of an install the route answered. Each file reports for itself, so
 * one that installed is never hidden by one that didn't. Only a call that
 * installed neither is an error.
 * @param reply - What the install route answered
 * @param context - Where the call was answered
 * @returns Both files' outcomes, and what the user does next
 * @throws Error with the route's own wording when nothing was installed
 */
export function manageInstallResult(
  reply: InstallReply,
  context: InstallContext,
): ManageInstallResult {
  if (!reply.ran) {
    throw new Error(reply.error);
  }

  const { remoteScript, device } = reply;

  if (remoteScript.ok === false && device.ok === false) {
    const script = withoutPeriod(remoteScript.detail);
    const deviceWhy = withoutPeriod(device.detail);

    throw new Error(
      script === deviceWhy
        ? `nothing was installed: ${script}.`
        : `nothing was installed. Remote script: ${script}. Device: ${deviceWhy}.`,
    );
  }

  return {
    remoteScript,
    device,
    nextSteps: nextSteps(remoteScript, device, context),
  };
}

/**
 * @param remoteScript - What became of the remote script
 * @param device - What became of the device
 * @param context - Where the call was answered
 * @returns What to tell the user, and what to call next
 */
function nextSteps(
  remoteScript: InstallPart,
  device: InstallPart,
  context: InstallContext,
): string {
  const finish = `Tell the user to finish in Live: ${FINISH_IN_LIVE}`;

  if (device.ok === false) {
    const retry = context.running
      ? `Call ${INSTALL} again to retry the device.`
      : `Then call ${ADD}, which retries the device, or call ${INSTALL} again.`;

    return `Only the remote script was installed; the device was not (see device). Tell the user why, and to finish in Live: ${FINISH_IN_LIVE} ${retry}`;
  }

  if (remoteScript.ok === false) {
    const drag = context.running ? "" : ` ${DRAG_NOW}`;

    return `Only the device was installed; the remote script was not (see remoteScript). Tell the user why, and call ${INSTALL} again to retry it.${drag}`;
  }

  return context.running
    ? `${finish} Once they have, call ${VERSION_CHECK_OR_CONNECT}.`
    : `${finish} Then call ${ADD} (ask the user first). ${DRAG_NOW}`;
}

/**
 * @param text - A reason
 * @returns It without a closing period, to sit in a longer sentence
 */
function withoutPeriod(text: string): string {
  return text.replace(/\.$/, "");
}
