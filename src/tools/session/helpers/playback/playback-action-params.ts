// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ParamHome,
  refuseParamsOutsideAction,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";

// The timeline is written before the action runs, so a session action given
// these would also move the arrangement start position.
const TIMELINE_ACTIONS = ["play-arrangement", "update-arrangement", "stop"];
const TIMELINE: ParamHome = { action: TIMELINE_ACTIONS };
const TARGET: ParamHome = {
  action: ["play-scene", "play-session-clips", "stop-session-clips"],
};

const PLAYBACK_PARAM_HOMES: Record<string, ParamHome> = {
  startTime: TIMELINE,
  startLocator: TIMELINE,
  loop: TIMELINE,
  loopStart: TIMELINE,
  loopStartLocator: TIMELINE,
  loopEnd: TIMELINE,
  loopEndLocator: TIMELINE,
  id: TARGET,
  ids: TARGET,
  path: TARGET,
  paths: TARGET,
  slots: TARGET,
  sceneIndex: { action: ["play-scene"] },
};

/**
 * @param action - The call's action
 * @returns True when the action reads the timeline params (start position and
 *   loop). A blank one sent to another action is not refused, so it must still
 *   be kept out of the timeline.
 */
export function actionReadsTimeline(action: string): boolean {
  return TIMELINE_ACTIONS.includes(action);
}

/**
 * Refuses a playback call that sends a timeline or target param its action
 * doesn't read.
 * @param action - The call's action
 * @param args - The args as sent
 */
export function refusePlaybackParamsOutsideAction(
  action: string,
  args: object,
): void {
  refuseParamsOutsideAction({ action }, { ...args }, PLAYBACK_PARAM_HOMES);
}
