// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.ts";
import {
  type TargetNotes,
  noteLanded,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";
import { canBeArmed } from "./track-switch-updates.ts";

const MONITORING_VALUES: Record<string, number> = {
  [MONITORING_STATE.IN]: LIVE_API_MONITORING_STATE_IN,
  [MONITORING_STATE.AUTO]: LIVE_API_MONITORING_STATE_AUTO,
  [MONITORING_STATE.OFF]: LIVE_API_MONITORING_STATE_OFF,
};

/**
 * Refuse a monitoring state Live has no value for, before any track is touched.
 * @param monitoringState - The state the call sent, if any
 * @throws Error when it isn't one of in, auto, off
 */
export function validateMonitoringState(
  monitoringState: string | undefined,
): void {
  if (
    monitoringState != null &&
    !Object.hasOwn(MONITORING_VALUES, monitoringState)
  ) {
    throw new Error(
      `invalid monitoring state "${monitoringState}". Must be one of: ${Object.values(MONITORING_STATE).join(", ")}`,
    );
  }
}

/**
 * Apply monitoring state to a track. Monitoring exists only on armable tracks,
 * so it is refused on the rest.
 * @param track - Track object
 * @param monitoringState - Monitoring state value (in, auto, off), already
 *   checked by {@link validateMonitoringState}
 * @param notes - What the track's entry has to say, added to
 */
export function applyMonitoringState(
  track: LiveAPI,
  monitoringState: string | undefined,
  notes: TargetNotes,
): void {
  if (monitoringState == null) {
    return;
  }

  if (!canBeArmed(track)) {
    refuseTargetWork(
      notes,
      ["monitoringState"],
      "monitoringState had no effect: return, main and group tracks have no monitoring",
    );

    return;
  }

  track.set("current_monitoring_state", MONITORING_VALUES[monitoringState]);
  noteLanded(notes, "monitoringState");
}
