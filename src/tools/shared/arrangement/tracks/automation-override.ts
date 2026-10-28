// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * What a result says when a write overrode a parameter's arrangement lane.
 * Live then ignores the whole lane, playback included, until Re-Enable
 * Automation.
 */
export const AUTOMATION_OVERRIDDEN =
  "arrangement automation overridden — Live ignores it until Re-Enable Automation";

/**
 * Run a write to a parameter and tell whether it overrode the parameter's
 * arrangement lane. That is when the parameter had a lane (`automation_state`
 * 1) before the write and the write changed its value: Live ignores a write of
 * the value it already holds. Already overridden (2), no lane, and unknown (0,
 * as while the track plays from Session) all say nothing.
 *
 * `automation_state` is read before the write only: it lags a tick, so a read
 * right after the write still shows 1. Values read back at once.
 * @param param - The DeviceParameter the write changes
 * @param write - Does the write
 * @param watched - Reads the value the write changes, when that isn't the
 *   parameter's own `value` (tempo lives on the Song)
 * @returns What the write returned, and whether it overrode the lane
 */
export function writeCheckingOverride<T>(
  param: LiveAPI,
  write: () => T,
  watched: () => unknown = () => param.getProperty("value"),
): { result: T; overrode: boolean } {
  const lane = param.getProperty("automation_state") === 1;
  const valueBefore = lane ? watched() : undefined;
  const result = write();

  return { result, overrode: lane && watched() !== valueBefore };
}

/**
 * Run a write that returns nothing, and tell whether it overrode the lane.
 * @param param - The DeviceParameter the write changes
 * @param write - Does the write
 * @param watched - Reads the value the write changes, if not the param's own
 * @returns True when the write overrode the lane
 */
export function overridesAutomation(
  param: LiveAPI,
  write: () => void,
  watched?: () => unknown,
): boolean {
  return writeCheckingOverride(param, write, watched).overrode;
}

/**
 * Run a mute write and tell whether it overrode the arrangement lane of the
 * owner's activator parameter, which mute drives. An owner with no activator
 * (a drum pad) just writes.
 * @param owner - The track or chain being muted
 * @param activator - The mixer parameter that mute maps to
 * @param write - Does the write
 * @returns True when the write overrode the lane
 */
export function overridesActivator(
  owner: LiveAPI,
  activator: "track_activator" | "chain_activator",
  write: () => void,
): boolean {
  const param = owner.child("mixer_device").child(activator);

  if (!param.exists()) {
    write();

    return false;
  }

  return overridesAutomation(param, write);
}

/**
 * The detail for a field of a target's entry whose lane a write overrode.
 * @param field - The field, as the call named it
 * @returns The detail, e.g. `tempo: arrangement automation overridden — ...`
 */
export function automationOverriddenDetail(field: string): string {
  return `${field}: ${AUTOMATION_OVERRIDDEN}`;
}
