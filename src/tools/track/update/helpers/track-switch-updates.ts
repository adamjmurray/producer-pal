// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TargetNotes,
  noteTarget,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";

/** The on/off switches a call can set on a track. */
export interface TrackSwitches {
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
}

/**
 * Set a track's mute, solo and arm, skipping the ones it doesn't have: the main
 * track has no mute or solo, and only an armable track takes arm.
 * @param track - Track object
 * @param switches - The switches the call sent
 * @param notes - What the track's entry has to say, added to
 */
export function applyTrackSwitches(
  track: LiveAPI,
  switches: TrackSwitches,
  notes: TargetNotes,
): void {
  const { mute, solo, arm } = switches;
  const isMain = track.category === "master";
  const armable = arm == null || canBeArmed(track);

  if (isMain) {
    noteMissingSwitches(
      notes,
      { mute, solo },
      "the main track has no mute or solo",
    );
  }

  if (!armable) {
    noteMissingSwitches(
      notes,
      { arm },
      "return, main and group tracks can't be armed",
    );
  }

  track.setAll({
    mute: isMain ? undefined : mute,
    solo: isMain ? undefined : solo,
    arm: armable ? arm : undefined,
  });
}

/**
 * Say why switches the track doesn't have weren't written. Asking for on is
 * refused; asking for off already holds, so it is only noted.
 * @param notes - What the track's entry has to say, added to
 * @param switches - The switches the track doesn't have, as the call sent them
 * @param why - Why the track doesn't have them
 */
function noteMissingSwitches(
  notes: TargetNotes,
  switches: TrackSwitches,
  why: string,
): void {
  const sent = Object.entries(switches).filter(([, value]) => value != null);
  const on = sent.filter(([, value]) => value === true).map(([key]) => key);
  const off = sent.filter(([, value]) => value === false).map(([key]) => key);

  if (on.length > 0) {
    refuseTargetWork(notes, on, `${on.join(" and ")} had no effect: ${why}`);
  }

  if (off.length > 0) {
    noteTarget(notes, `${off.join(" and ")} already off: ${why}`);
  }
}

/**
 * Whether Live lets this track be armed. Return, main and group tracks can't be.
 * @param track - Track object
 * @returns True when the track can be armed
 */
export function canBeArmed(track: LiveAPI): boolean {
  return (track.getProperty("can_be_armed") as number) > 0;
}
