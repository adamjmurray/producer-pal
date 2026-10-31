// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Choosing the automation slot that carries a hosted param's envelope, and
// mapping it. A slot already on the param is used; else the lowest free one;
// else one whose automation is gone everywhere. A slot with automation is never
// remapped. What a call learns about a wrapper is kept for the rest of the call,
// so each wrapper is asked once, however many lines name it.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { followsArrangement } from "#src/tools/shared/arrangement/tracks/follows-arrangement.ts";
import {
  type MappedSlot,
  mapSlot,
  readSlotMap,
  slotName,
  slotParameters,
  type SlotMap,
  type SlotParameter,
} from "#src/tools/shared/device/helpers/params/hosted-automation-slots.ts";
import { envelopeRoute } from "../envelope-route.ts";
import { type EnvelopeTarget } from "../envelope-targets.ts";
import {
  ENVELOPE_ROUTES,
  type EnvelopeListResult,
} from "../remote-script-envelope-contract.ts";
import { type HostedTarget } from "./hosted-envelope-target.ts";

/** What the call needs to look at the track's clips. */
export interface HostedSlotContext {
  trackIndex: number;
  deadline: number | null | undefined;
  manage: boolean;
}

/**
 * Where a hosted param's envelope goes: the slot's Live parameter, or null
 * when there is no slot and the line only clears. `mapped` says what was
 * changed to get there, for the clip's entry.
 */
export type SlotPlacement =
  | { ok: true; target: EnvelopeTarget | null; mapped?: string }
  | { ok: false; reason: string };

/** Places hosted params on slots for the rest of one call. */
export interface HostedSlots {
  /**
   * @param target - The hosted param
   * @param forClear - True when the line clears: a slot is looked for, never made
   * @returns Its slot's Live parameter, or why it has none
   */
  place: (target: HostedTarget, forClear: boolean) => Promise<SlotPlacement>;
}

/** What a call knows about one wrapper. */
interface WrapperSlots {
  /** Where the device is, from the first line that named it */
  where: Pick<HostedTarget, "devicePath" | "remotePath">;
  device: LiveAPI;
  slots: SlotMap;
  /** Slots this call chose, which no later line may take over */
  claimed: Set<number>;
  params?: Map<number, SlotParameter>;
  /** Params of this device that a clip on the track holds an envelope for */
  automated?: Set<number> | null;
}

/**
 * Start placing hosted params for one call.
 * @param context - The clip's track, deadline and who is calling
 * @returns The placer
 */
export function hostedSlots(context: HostedSlotContext): HostedSlots {
  const wrappers = new Map<string, WrapperSlots | string>();

  return {
    place: async (target, forClear) => {
      const wrapper = wrapperFor(wrappers, target);

      if (typeof wrapper === "string") {
        return { ok: false, reason: wrapper };
      }

      return forClear
        ? placeExisting(wrapper, target)
        : await placeForWrite(wrapper, target, context);
    },
  };
}

// --- Helpers below main exports ---

/**
 * @param wrappers - What the call has learned so far, added to
 * @param target - The hosted param
 * @returns The wrapper's slots, or why they can't be read
 */
function wrapperFor(
  wrappers: Map<string, WrapperSlots | string>,
  target: HostedTarget,
): WrapperSlots | string {
  const known = wrappers.get(target.deviceId);

  if (known != null) {
    return known;
  }

  const read = readSlotMap(target.deviceId);
  const wrapper = read.ok
    ? {
        where: { devicePath: target.devicePath, remotePath: target.remotePath },
        device: LiveAPI.from(`id ${target.deviceId}`),
        slots: read.slots,
        claimed: new Set<number>(),
      }
    : read.reason;

  wrappers.set(target.deviceId, wrapper);

  return wrapper;
}

/**
 * Use the slot already on the param, for a line that only clears.
 * @param wrapper - The wrapper's slots
 * @param target - The hosted param
 * @returns The slot's Live parameter; none when the param has no slot
 */
function placeExisting(
  wrapper: WrapperSlots,
  target: HostedTarget,
): SlotPlacement {
  const slot = slotOf(wrapper, target);

  return slot == null
    ? { ok: true, target: null }
    : placeOn(wrapper, slot.slot);
}

/**
 * Find or make the slot that carries the param.
 * @param wrapper - The wrapper's slots
 * @param target - The hosted param
 * @param context - The clip's track, deadline and who is calling
 * @returns The slot's Live parameter, and what was changed to get it
 */
async function placeForWrite(
  wrapper: WrapperSlots,
  target: HostedTarget,
  context: HostedSlotContext,
): Promise<SlotPlacement> {
  const existing = slotOf(wrapper, target);

  if (existing != null) {
    return placeOn(wrapper, existing.slot);
  }

  // Reclaiming lists every clip on the track, so it is the last resort.
  const free = freeSlot(wrapper);
  const taken = free == null ? await reclaimable(wrapper, context) : undefined;
  const slot = free ?? taken?.slot;

  if (slot == null) {
    return { ok: false, reason: bankFull(wrapper, context) };
  }

  const mapped = mapSlot(target.deviceId, slot, target.index);

  if (!mapped.ok) {
    return mapped;
  }

  // Keep what the wrapper now holds, so the next line sees this slot as taken.
  wrapper.slots.mapped.set(slot, {
    slot,
    index: target.index,
    name: mapped.name,
  });

  // Only a slot with a parameter is ever chosen.
  const placed = targetOf(wrapper, slot) as EnvelopeTarget;

  return { ok: true, target: placed, mapped: mappedPhrase(slot, taken) };
}

/**
 * @param wrapper - The wrapper's slots
 * @param target - The hosted param
 * @returns The slot that already drives the param, if any
 */
function slotOf(
  wrapper: WrapperSlots,
  target: HostedTarget,
): MappedSlot | undefined {
  return [...wrapper.slots.mapped.values()].find(
    (entry) => entry.index === target.index,
  );
}

/**
 * @param wrapper - The wrapper's slots
 * @param slot - The slot number
 * @returns The slot's Live parameter, if the wrapper lists one
 */
function parameterOf(
  wrapper: WrapperSlots,
  slot: number,
): SlotParameter | undefined {
  wrapper.params ??= slotParameters(wrapper.device);

  return wrapper.params.get(slot);
}

/**
 * Whether Live holds arrangement automation for the slot. The state reads as
 * none for a track that plays from Session, whatever it holds.
 * @param wrapper - The wrapper's slots
 * @param slot - The slot number
 * @returns False only when the slot's parameter reads as having none
 */
function hasLaneAutomation(wrapper: WrapperSlots, slot: number): boolean {
  return (
    parameterOf(wrapper, slot)?.param.getProperty("automation_state") !== 0
  );
}

/**
 * The lowest slot that drives nothing and holds no arrangement automation,
 * which mapping would otherwise hand to the new param.
 * @param wrapper - The wrapper's slots
 * @returns The slot number, if any
 */
function freeSlot(wrapper: WrapperSlots): number | undefined {
  for (let slot = 1; slot <= wrapper.slots.count; slot++) {
    if (!wrapper.slots.mapped.has(slot) && !hasLaneAutomation(wrapper, slot)) {
      return slot;
    }
  }

  return undefined;
}

/**
 * Say what was changed to give the param a slot.
 * @param slot - The slot used
 * @param taken - The slot's old mapping, when it was taken over
 * @returns The phrase for the clip's entry
 */
function mappedPhrase(slot: number, taken: MappedSlot | undefined): string {
  const used = `mapped to slot "${slotName(slot)}"`;

  return taken == null
    ? used
    : `${used} (it drove "${taken.name}", which had no automation left)`;
}

/**
 * @param wrapper - The wrapper's slots
 * @param slot - The slot number
 * @returns The slot's Live parameter as the remote script takes it, if the
 *   wrapper lists one
 */
function targetOf(
  wrapper: WrapperSlots,
  slot: number,
): EnvelopeTarget | undefined {
  const found = parameterOf(wrapper, slot);

  if (found == null) {
    return undefined;
  }

  wrapper.claimed.add(slot);

  return { device: wrapper.where.remotePath, parameter: found.index };
}

/**
 * @param wrapper - The wrapper's slots
 * @param slot - The slot number
 * @returns Where the slot's envelope goes, or why it has no parameter
 */
function placeOn(wrapper: WrapperSlots, slot: number): SlotPlacement {
  const target = targetOf(wrapper, slot);

  return target == null
    ? {
        ok: false,
        reason: `${wrapper.where.devicePath} has no parameter named "${slotName(slot)}"`,
      }
    : { ok: true, target };
}

/**
 * The lowest mapped slot whose automation is gone everywhere: its parameter
 * has no arrangement automation, and no clip on the track holds an envelope
 * for it. Nothing is reclaimed while the track plays from Session, since its
 * parameters then read as having no automation whether they have or not.
 * @param wrapper - The wrapper's slots
 * @param context - The clip's track, deadline and who is calling
 * @returns The slot and what it drives, or undefined when none is free to take
 */
async function reclaimable(
  wrapper: WrapperSlots,
  context: HostedSlotContext,
): Promise<MappedSlot | undefined> {
  if (!followsArrangement(LiveAPI.from(livePath.track(context.trackIndex)))) {
    return undefined;
  }

  // Each with its parameter's position, which the clips' envelopes name it by.
  const candidates = [...wrapper.slots.mapped.values()]
    .toSorted((a, b) => a.slot - b.slot)
    .flatMap((entry) => {
      const found = parameterOf(wrapper, entry.slot);

      return found != null &&
        !wrapper.claimed.has(entry.slot) &&
        !hasLaneAutomation(wrapper, entry.slot)
        ? [{ entry, index: found.index }]
        : [];
    });

  if (candidates.length === 0) {
    return undefined;
  }

  if (wrapper.automated === undefined) {
    wrapper.automated = await automatedParams(wrapper.where, context);
  }

  const { automated } = wrapper;

  return automated == null
    ? undefined
    : candidates.find(({ index }) => !automated.has(index))?.entry;
}

/**
 * Which params of a device any clip on the track holds an envelope for. An
 * arrangement clip has none of its own: its automation is the lane, which a
 * parameter's `automation_state` already says.
 * @param where - The device
 * @param context - The clip's track, deadline and who is calling
 * @returns The params' positions, or null when the clips couldn't all be read
 */
async function automatedParams(
  where: WrapperSlots["where"],
  context: HostedSlotContext,
): Promise<Set<number> | null> {
  const track = LiveAPI.from(livePath.track(context.trackIndex));
  const found = new Set<number>();

  for (const [slot, clipSlot] of track.getChildren("clip_slots").entries()) {
    if ((clipSlot.getProperty("has_clip") as number) === 0) {
      continue;
    }

    const listed = await envelopeRoute<EnvelopeListResult>(
      ENVELOPE_ROUTES.list,
      { track: `t${String(context.trackIndex)}`, slot },
      context.deadline,
      context.manage,
    );

    if (!listed.ok) {
      return null;
    }

    for (const envelope of listed.result.envelopes) {
      if (
        envelope.device === where.remotePath &&
        envelope.parameter_index != null
      ) {
        found.add(envelope.parameter_index);
      }
    }
  }

  return found;
}

/**
 * Say why a param has no slot to take.
 * @param wrapper - The wrapper's slots
 * @param context - The clip's track
 * @returns The reason, with how to free a slot
 */
function bankFull(wrapper: WrapperSlots, context: HostedSlotContext): string {
  const { devicePath } = wrapper.where;
  const used = `all ${wrapper.slots.count} automation slots of ${devicePath} are in use`;

  if (!followsArrangement(LiveAPI.from(livePath.track(context.trackIndex)))) {
    return `${used}, and which have automation can't be told while the track plays from Session; stop its session clips and try again`;
  }

  return `${used}. Delete the automation of one (a clip's envelope or the arrangement lane; ppal-read-device shows which params have a slot) to free it`;
}
